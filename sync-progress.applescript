#!/usr/bin/osascript

tell application "Spotify"
  repeat until application "Spotify" is not running
    set cstate to ((player position * 1000) as integer)
    log cstate
  end repeat
end tell