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

/*
<label v-for="line in lyrics">
    <template v-if="line.startTimeMs === position.toString()">            
        <b>{{line.words}}</b>
    </template>
    <template v-else>
        {{line.words}}
    </template>
</label>
*/

/* // TEST: {{line}} */

const wgt: WidgetAPI = await widget(`

    <div class="main-container">
        <header>
            <h2>{{title}} - {{artist}} - {{position}}</h2>
        </header>
        <div v-if="isLoading">
            Loading...
        </div>
        <div class="lyrics-container" v-else>
            <label v-for="(line, index) in lyrics">
                <template v-if="currentLine === index">            
                    <b>{{line.words}}</b>
                </template>
                <template v-else>
                    {{line.words}}
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

        .lyrics-container > label {
            display: block;
        }

    </style>
`, {
    width: 700,
    height: 1200,
    alwaysOnTop: true
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
            "authorization": "Bearer BQC_EQdJqtro0wFHO2ozz7pwq4KpAqY64ekKttPMqzD8644EEJanIeDfC3VELP8fu5kP6MlOQ5Qc4jCp3fmsCeN_5mpLCQ2hIMppT-5bpK0LWEZ1cnXGiEKAlXwUjWJmSlA_Cw3P1n4KpMI-xq249JXwyR_EhR_K-WpHNIL2q9yQRmYZ67MxldOc5BYg2ky427Q0pjfLRoszhDyzAgAIR8642QE3BMWm005fVeiFa-M4p7vJBd46O7VGZIirmZvexDvoMMtJWpiJPgDUajMwQtAAR-SaSb5kYkqcUo_ILG_qYFMFiUuYnM34tx9dGPoGraXmBkONqT6injjgwEvw",
            "user-agent": "Spotify/8.7.78.373 Android/29 (Android SDK built for arm64)",
            "spotify-app-version": "8.7.78.373"
        }
    })

    if (!(request.status === 200)) return;

    const data: RealtimeLyrics = await request.json();

    return data
}

const COMMAND = "/Users/liljack/Documents/repos/spotify-realtime-lyrics/test.applescript";

const pipeCommandOutput = (command: string, callback: any) => {
    const cmd = executeCustom(command);
    cmd.stdout.setEncoding("utf8");
    cmd.stdout.on("data", (data) => wgt.setState({ position: JSON.parse(data).position }));
    cmd.stderr.setEncoding("utf8");
    // cmd.stderr.on("data", (data) => wgt.setState({ position: data }));
    cmd.stderr.on("data", callback);
    cmd.on("close", (code) => wgt.setState({ position: code }));
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

        debugger;

        // dev({ a: syncLyrics(data.lyrics.lines, 17980)});

        pipeCommandOutput(COMMAND, (x: any) => {
            // const parse = JSON.parse(x);
            const currIndex = syncLyrics(data.lyrics.lines, x)

            debugger;

            // wgt.setState({ position: x, line: data.lyrics.lines[currIndex]?.words })
            wgt.setState({ position: x, currentLine: currIndex })
        })
    })
})

