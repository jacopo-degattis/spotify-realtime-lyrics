import "@johnlindquist/kit"

import { exec as executeCustom } from "child_process";
import { WidgetAPI } from "@johnlindquist/kit/types/pro";


// SQLITE3 error is thrown, is there a way to fix it ?
// const chrome = await npm("chrome-cookies-secure");
const spotify = await npm("spotify-node-applescript");

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
            color: white;
        }

        .lyrics-container > label {
            display: block;
            font-size: 1.4rem;
            font-weight: 600;
        }
    </style>

    <script>
        setTimeout(() => {
            const buttons = document.querySelectorAll("#unfocused-line");
            
            buttons.forEach((button) => {
                button.addEventListener("click", (event) => {
                    ipcRenderer.send("WIDGET_CLICK", {
                        targetId: "jumpto",
                        index: event.target.dataset.index,
                        name: event.target.dataset.name,
                        widgetId: window.widgetId,
                    })
                })
            })

        }, 2000)

    </script>
`, {
    width: 700,
    height: 1200,
    alwaysOnTop: true,
    backgroundColor: "#7C7B7C"
})

wgt.onClick((event: any) => {
    dev({ e: event });
    if (event.targetId === "jumpto") {
        spotify.jumpTo(state.currentLyrics[parseInt(event.name)].startTimeMs / 1000, () => console.log("JUMPED TO"));
    }
})

const syncLyrics: (
    lyrics: Array<RealtimeLyricsLines>,
    time: number
) => number = (lyrics, time) => {
    const scores = [];

    lyrics.forEach((lyric: any) => {
        const score = time - lyric.startTimeMs;

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
            "authorization": "Bearer BQDLjLuzEF-TZOwwhuUf8Y41jsb-CYCNb-qapZqVfQiDoW_AxpEfE3fj5UTS4J_3yD6DD3_xTiJc9kAbPWNCNWOFhY4ZgXxX7SehqbWT8wJk3db53lsrBAVmDiuTmBY3vb3SKH_m4M3uzpdFEwBaJLG66taYPmwAtomm77j2rpikTkn4OG3tKTYcxP7xkj7if95d1zaBWHGCipocI4i09s6iEAp2_b8WwkjK7XaWaTU6Ur_mefI0rRJr5VP6jpqz4Ve5mZ8f-ZQfAd8e-Oe8qRAg5D0hhlnf833kL9FCNfLLUKXch61_oYw1Ka2wwf43IDu4IE8y8oHoKlFnFuH6",
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
    // cmd.stdout.on("data", (data) => wgt.setState({ position: JSON.parse(data).position }));
    // Why it works on stderr and not stdout ?
    cmd.stderr.on("data", callback);
    cmd.on("close", () => {});
    return cmd;
}

const killAndRelaunch = (command: string, prevProcess: any, callback: (x: any) => void) => {
    prevProcess.kill();
    return pipeCommandOutput(command, callback);
}

setInterval(() => {
    spotify.isRunning((err: any, isRunning: boolean) => {
        if (!isRunning) return

        spotify.getTrack(async (err: any, track: any) => {
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
