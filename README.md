# Youtube Music Scrobbler Web Extension

An extension for chromium web based browser for keeping lastfm and youtube music in sync

## Features

1. Sync playing tracks on youtube music to lastFM
2. Scrobble playing track to LastFM
3. Filter youtube music ADs
4. Like and Unlike track on LastFM
5. View Counts for track

## Users FAQ

Q: Some tracks information are not being shown on popup
A: Apologies, If last fm cant find track information from name/artist we dont display play counts or like status

Q: The track changes shows on the extension popup, but are not updated on Last FM
A: Your session key might be expired, try clicking the red recycle button to clear all data and re authenticate

## Development

### Requirements
    1. Last FM API (Account)[https://www.last.fm/api]
    2. npm/bun/pnpm

### Setup
    1. Clone the repository or Unzip from file
    2. create a .env file with these keys
    ```.env
    VITE_LASTFM_API_KEY=api_key
    VITE_LASTFM_API_SECRET=api_secret
    ```
    3. run `npm i` to install dependencies
    4. run `npm dev` to run in dev mode and start a browser with extension installed
    5. run `npm build` to bundle the code to `.output` directory


## Contributions
Contributions are welcomed!

<img width="319" height="469" alt="Screenshot 2026-03-10 at 17 33 15" src="https://github.com/user-attachments/assets/1477ce49-9c5e-48b6-adf1-40cb81c9f01d" />
