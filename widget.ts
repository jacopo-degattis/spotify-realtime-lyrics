import "@johnlindquist/kit"

import { WidgetAPI } from "@johnlindquist/kit/types/pro";
import { ChildProcess, exec as executeCustom } from "child_process";

// SQLITE3 error is thrown, is there a way to fix it ?
// const chrome = await npm("chrome-cookies-secure");
const spotify = await npm("spotify-node-applescript");

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

const state = {
    currentLyrics: null,
    previousProcess: null,
    isProcessLaunched: false,
    previousTrack: null,
    backgroundColor: "#7C7B7C" 
}

const wgt: WidgetAPI = await widget(`
    <div class="main-container">
        <header>
            <h2>{{title}} - {{artist}}</h2>
        </header>
        <div v-if="isLoading">
            Loading...
        </div>
        <div class="lyrics-container" v-else>
            <label v-for="(line, index) in lyrics">
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
            padding-top: 150px;
            padding-bottom: 150px;
            padding-left: 50px;
            overflow: scroll;
            width: 700px;
            height: 1200px;
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
        const seconds = state.currentLyrics[parseInt(event.name)].startTimeMs / 1000;
        spotify.jumpTo(seconds, () => {});
    }
})

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
    trackId: string
) => Promise<RealtimeLyrics> = async (trackId) => {
    const endpoint = "https://spclient.wg.spotify.com/color-lyrics/v2/track";

    const request = await fetch(`${endpoint}/${trackId}`, {
        method: "GET",
        headers: {
            "accept": "application/json",
            "authorization": "Bearer BQAf7VWG4wmJtnRlPa3yVvdhzCh9SSeNsZnfAPREji__m3rQKiuyzDq4hYBWX-7bjeovECQYtCL-da4zpswhnF87MelJc-K_HeYRKAzmel3ynz00Hm6S-Y8p94PWs95tskLHAygFeXDuz_ydi2adgvxpIR3Nhow3Hic0LNSSXygR33SZHjJndsCoCiJSS7RsO-mF_C-Ou6dtAbYVUGDZIihFVgXkxutl6hxrmOIADdYqZXxv2NwuE1KdCWuIYTXmSdNxOb1peZBw1qQLdG7bGMRR5PNez0DiB0jAfXGb-YO0YZI3T92HuxinWWYaANOADW9TdjC70g1IpH3Js0s8",
            "user-agent": "Spotify/8.7.78.373 Android/29 (Android SDK built for arm64)",
            "spotify-app-version": "8.7.78.373"
        }
    })

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
    const cmd = executeCustom(command);
    cmd.stdout.setEncoding("utf8");
    cmd.stderr.on("data", callback);
    return cmd;
}

const killAndRelaunch = (
    command: string,
    prevProcess: ChildProcess,
    callback: (x: any) => void
) => {
    prevProcess.kill();
    return pipeCommandOutput(command, callback);
}

setInterval(() => {
    spotify.isRunning((err: any, isRunning: boolean) => {
        if (!isRunning || err) return

        spotify.getTrack(async (err: any, track: Track) => {
            if (err) return

            if (state.previousTrack !== track.name) {
                wgt.setState({ position: 0, currentLine: 0 })

                wgt.setState({ isLoading: true })
                const data = await fetchRealtimeLyrics(track.id.split(":").pop());
                
                if (!data) return;

                if (!state.isProcessLaunched) {
                    state.previousProcess = pipeCommandOutput(`osascript -e '${script}'`, (x: any) => {
                        const currIndex = syncLyrics(data.lyrics.lines, x)
                        wgt.setState({ position: x, currentLine: currIndex })
                    })
                } else {
                    if (!state.previousProcess) return;

                    state.previousProcess = killAndRelaunch(`osascript -e '${script}'`, state.previousProcess, (x: any) => {
                        const currIndex = syncLyrics(data.lyrics.lines, x)
                        wgt.setState({ position: x, currentLine: currIndex })
                    });
                }

                wgt.setState({
                    title: track.name,
                    artist: track.artist,
                    isLoading: false,
                    lyrics: data.lyrics.lines,
                    position: 0
                })

                state.currentLyrics = data.lyrics.lines;
                state.isProcessLaunched = true;
                state.previousTrack = track.name;
            }

        })
    })
}, 1000)
