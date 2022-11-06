import "@johnlindquist/kit"

import { WidgetAPI } from "@johnlindquist/kit/types/pro";
import { ChildProcess, exec as executeCustom } from "child_process";
import { Browser } from "puppeteer";

const puppeteer = await npm("puppeteer");
const spotify = await npm("spotify-node-applescript");

const credentialsStorage = await db({ accessToken: null })

interface Track {
    artist: string,
    album: string,
    disc_number: number,
    duration: number,
    played_count: number,
    track_number: number,
    starred: boolean,
    popularity: number,
    id: string,
    name: string,
    album_artist: string,
    artwork_url: string,
    spotify_url: string
}

interface RealtimeLyricsLines {    
    startTimeMs: string,
    words: string,
    syllables: [],
    endTimeMs: string
}

interface RealtimeLyrics {
    lyrics: {
        syncType: string,
        lines: Array<RealtimeLyricsLines>,
        provider: string,
        providerLyricsId: string,
        providerDisplayName: string,
        syncLyricsUri: string,
        isDenseTypeface: boolean,
        alternatives: Array<[]>,
        language: string,
        isRtlLanguage: boolean,
        fullscreenAction: string,
    },
    colors: { background: number, text: number, highlightText: number },
    hasVocalRemoval: boolean
}

interface State {
    position: number,
    currentLine: number,
    currentLyrics: Array<RealtimeLyricsLines>,
    previousProcess: ChildProcess,
    isProcessLaunched: boolean,
    previousTrack: string,
    backgroundColor: string,
    currentTrack: {
        title: string,
        artist: string,
        isLoading: boolean,
        position: number,
    },
    spotifyUser: {
        email: string,
        password: string,
        tokenMaxAttempts: number
    }
}

const state: State = {
    position: 0,
    currentLine: 0,
    currentLyrics: null,
    previousProcess: null,
    isProcessLaunched: false,
    previousTrack: null,
    backgroundColor: "#984E51",
    currentTrack: {
        title: "",
        artist: "",
        isLoading: null,
        position: 0
    },
    spotifyUser: {
        email: "",
        password: "",
        tokenMaxAttempts: 2
    }
}

const wgt: WidgetAPI = await widget(`
    <div class="main-container">
        <header>
            <h2>{{currentTrack.title}} - {{currentTrack.artist}}</h2>
        </header>
        <div v-if="currentTrack.isLoading" class="loader">
            Loading ...
        </div>
        <div class="lyrics-container" v-else>
            <label v-for="(line, index) in currentLyrics">
                <template v-if="currentLine === index">            
                    <div class="highlighted">{{line.words}}</div>
                </template>
                <template v-else>
                    <div :key="index" :data-name="index" :data-index="index" id="unfocused-line" class="grayed-out">{{line.words}}</div>
                </template>
            </label>
        </div>
    </div>
    <style>
        .main-container {
            padding-top: 50px;
            padding-bottom: 50px;
            padding-left: 50px;
            overflow: scroll;
            width: 700px;
            height: 1200px;
            width: 100%;
            height: 100%;
        }
        
        .lryics-container {
            margin-left: 0px;
            padding-left: 0px;
        }

        .highlighted {
            color: white;
        }

        .grayed-out {
            color: #2e2e2e;
        }

        .grayed-out:hover {
            cursor: pointer;
            transition-duration: 0.2s;
            color: white;
        }

        .lyrics-container > label {
            display: block;
            font-size: 1.4rem;
            font-weight: 600;
        }

    </style>

    <script>
        const handler = (event) => {
            ipcRenderer.send("WIDGET_CLICK", {
                targetId: "jumpto",
                index: event.target.dataset.index,
                name: event.target.dataset.name,
                widgetId: window.widgetId,
            })
        }

        const setupButtons = () => {
            const buttons = document.querySelectorAll("#unfocused-line");
            buttons.forEach((button) => {
                button.removeEventListener("click", handler);
                button.addEventListener("click", handler);
            })
        }

        setTimeout(setupButtons, 2000);
        window.onSetState = setupButtons;
        
    </script>
`, {
    width: 700,
    height: 1200,
    alwaysOnTop: true,
    backgroundColor: state.backgroundColor
})

wgt.onClick((event: any) => {
    if (event.targetId === "jumpto") {
        const seconds = parseInt(state.currentLyrics[parseInt(event.name)].startTimeMs) / 1000;
        spotify.jumpTo(seconds, () => {});
    }
})

const fetchToken = async (browser: Browser) => {
    const page = await browser.newPage();

    await page.goto("https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F", {
        waitUntil: 'networkidle0',
    });

    if (!await page.$("#login-username")) return;

    await page.type("#login-username", state.spotifyUser.email);
    await page.type("#login-password", state.spotifyUser.password);
        
    Promise.resolve([
        page.click("#login-button"),
        page.waitForNavigation(),
    ])

    const scriptTag = await page.waitForSelector('script[id=session]');
    const value = await scriptTag.evaluate(el => el.textContent);

    return JSON.parse(value);
}

const syncLyrics: (
    lyrics: Array<RealtimeLyricsLines>,
    time: number
) => number = (lyrics, time) => {
    const scores = [];

    lyrics.forEach((lyric) => {
        const score = time - parseInt(lyric.startTimeMs);

        if (score >= 0) scores.push(score);
    })

    if (scores.length === 0) return;

    const closest = Math.min(...scores);

    return scores.indexOf(closest);
}

const fetchRealtimeLyrics: (
    trackId: string,
    browser: Browser,
    attempt: number
) => Promise<RealtimeLyrics> = async (trackId, browser, attempt) => {
    const endpoint = "https://spclient.wg.spotify.com/color-lyrics/v2/track";
    
    let token = credentialsStorage.data.accessToken;

    if (!token) {
        token = await fetchToken(browser);
        credentialsStorage.data.accessToken = token.accessToken;
        credentialsStorage.write();
        token = token.accessToken;
    }

    if (!token) return;

    const request = await fetch(`${endpoint}/${trackId}`, {
        method: "GET",
        headers: {
            "accept": "application/json",
            "authorization": `Bearer ${token}`,
            "user-agent": "Spotify/8.7.78.373 Android/29 (Android SDK built for arm64)",
            "spotify-app-version": "8.7.78.373"
        }
    })

    debugger;

    if (request.status === 401 && attempt < state.spotifyUser.tokenMaxAttempts) {
        credentialsStorage.data.accessToken = null;
        return await fetchRealtimeLyrics(trackId, browser, attempt++);
    }

    if (!(request.status === 200)) return;

    const data: RealtimeLyrics = await request.json();

    return data
}

const script = `
    tell application "Spotify"
        repeat until application "Spotify" is not running
            set cstate to ((player position * 1000) as integer)
            log cstate
        end repeat
    end tell
`

const pipeCommandOutput = (command: string, callback: (x: any) => void) => {
    if (state.previousProcess) state.previousProcess.kill();

    const cmd = executeCustom(command);
    cmd.stdout.setEncoding("utf8");
    cmd.stderr.on("data", callback);
    return cmd;
}

const browser: Browser = await puppeteer.launch();

setInterval(() => {
    spotify.isRunning((err: any, isRunning: boolean) => {
        if (!isRunning || err) return

        spotify.getTrack(async (err: any, track: Track) => {
            if (err) return

            if (state.previousTrack !== track.name) {

                state.previousTrack = track.name;

                wgt.setState({ ...state, position: 0, currentLine: 0 })
                wgt.setState({ ...state, currentTrack: { isLoading: true }})

                const data = await fetchRealtimeLyrics(track.id.split(":").pop(), browser, 0);
                
                if (!data) return;

                state.previousProcess = pipeCommandOutput(`osascript -e '${script}'`, (x: any) => {
                    const currIndex = syncLyrics(data.lyrics.lines, x)
                    wgt.setState({ position: x, currentLine: currIndex })
                })

                wgt.setState({
                    ...state,
                    currentTrack: {
                        title: track.name,
                        artist: track.artist,
                        isLoading: false,
                        position: 0
                    },
                    currentLyrics: data.lyrics.lines
                })

                state.currentLyrics = data.lyrics.lines;
                state.isProcessLaunched = true;
            }
        })
    })
}, 1000)
