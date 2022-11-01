import "@johnlindquist/kit"

import { exec as executeCustom } from "child_process";
import { WidgetAPI } from "@johnlindquist/kit/types/pro";


// SQLITE3 error is thrown, is there a way to fix it ?
// const chrome = await npm("chrome-cookies-secure");
const spotify = await npm("spotify-node-applescript");

interface RealtimeLyrics {
    lyrics: {
        syncType: string,
        lines: Array<{
            startTimeMs: string,
            words: string,
            syllables: [],
            endTimeMs: string
        }>,
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
                    <div id="unfocused-line" class="grayed-out">{{line.words}}</div>
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

        // .grayed-out:hover {
        //     cursor: pointer;
        //     color: white;
        // }

        .lyrics-container > label {
            display: block;
            font-size: 1.4rem;
        }

    </style>
`, {
    width: 700,
    height: 1200,
    alwaysOnTop: true,
    backgroundColor: "#7C7B7C"
})

const syncLyrics = (lyrics: any, time: any) => {
    const scores = [];

    lyrics.forEach((lyric: any) => {
        const score = time - lyric.startTimeMs;

        if (score >= 0) scores.push(score);
    })

    if (scores.length === 0) return;

    const closest = Math.min(...scores);

    return scores.indexOf(closest);
}

const fetchRealtimeLyrics: (trackId: string) => Promise<RealtimeLyrics> = async (trackId) => {
    const endpoint = "https://spclient.wg.spotify.com/color-lyrics/v2/track";

    const request = await fetch(`${endpoint}/${trackId}`, {
        method: "GET",
        headers: {
            "accept": "application/json",
            "authorization": "Bearer BQBiJpJaFDT-XL5DCSpC_lPZRIICCIFnPYvmaYErbqTv_e-MHdg3iW3hWmV07DUOfjo49GA2vCjCNrDfziDqYLgN2ktECleWCMaZeRt_Dz16RZWf73qA3AsDMw6I0V80J4VLRINjcsjXxrovthnddbdfxWByrcCfRJNrsAUOoP6E4rgHHU6aFge9hsgiVGsj5mjxcpoj-Nx2H-uy0wuNuWNm_bTzyIy-9d2kvesyhXxPtRmLFte8Ip61TBvjjitcDg1bZBN7TpGNmYZQ0O8fRonzINE3slRXqvzrqiZOsumtl0j7_VUsHHRPNwC_czoyUyCJVJGw00XK0jmlHZrk",
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

const pipeCommandOutput = (command: string, callback: any) => {
    const cmd = executeCustom(command);
    cmd.stdout.setEncoding("utf8");
    // cmd.stdout.on("data", (data) => wgt.setState({ position: JSON.parse(data).position }));
    // Why it works on stderr and not stdout ?
    cmd.stderr.on("data", callback);
    cmd.on("close", () => {});
}

spotify.isRunning((err: any, isRunning: boolean) => {
    if (!isRunning) return

    spotify.getTrack(async (err: any, track: any) => {
        if (err) return
        
        wgt.setState({ isLoading: true })
        const data = await fetchRealtimeLyrics(track.id.split(":").pop());
        
        wgt.setState({
            title: track.name,
            artist: track.artist,
            isLoading: false,
            lyrics: data.lyrics.lines,
            position: 0
        })

        pipeCommandOutput(`osascript -e '${script}'`, (x: any) => {
            const currIndex = syncLyrics(data.lyrics.lines, x)
            wgt.setState({ position: x, currentLine: currIndex })
        })
    })
})

