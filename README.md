# Spotify Realtime Lyrics

## Description

This repo contains a [Scripkit](https://github.com/johnlindquist/kit) widget that provides lyrics for the currently playing spotify track. The most cool thing right now is the possibility to have the sing-along feature exactly as if you are inside of the official Spotify client.

All the lyrics are fetched from the Musixmatch API made available by Spotify after their partnership. 

*N.B*: Almost surely this is a violation of Spotify Terms of Service so I discourage you to use this tool, it was mainly developed for learning purposes only.

## What's the scope of this project ?

My main purpose was to learn something new as always.

Anyway it's also useful to me because while I work I really enjoying having this window on another screen and sing along the track I'm currently playing in my headphones.

## How does it works ?

**About authentication**

The main behind authentication was to get the `accessToken` making a HTTP request to `https://open.spotify.com` using the local Chrome cookies and extrapolate the `accessToken` property from the `script` tag with id `session`.

This flow works but right now is ony available and working in the `fetch-token.js` file because the implementation with Scripkit is still giving me troubles with sqlite (at least on my Mac with m1).

Once that I'll solve this problem the authentication will be smoother and definitely more effective than now.

*So How can I authenticate the widget right now ?*

First thing first you have to authenticate yourself on Chrome going on `https://open.spotify.com`.

Once you authenticated you can simply execute the `fetch-token.js` script and it will log you your token, necessary for making API calls.

**About Musixmatch lyrics service**

Spotify right now expose an API endpoint to fetch all the lyrics of the given track, also with timing for each row and with colors.

The exposed API is the following: `https://spclient.wg.spotify.com/color-lyrics/v2/track/<spotify-track-id>`

If you call this api providing the `accessToken` and the `spotify-track-id` you will receive the lyrics, if available, along with colors and timings.

## Author

Jacopo De Gattis
