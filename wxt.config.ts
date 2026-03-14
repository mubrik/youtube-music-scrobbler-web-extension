import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
    manifest: {
        name: 'Briked LastFM YoutubeMusic Scrobbler',
        description: 'A browser extension to keep your Youtube Music listening activity up to date with your LastFM.',
        permissions: [
            'storage',
            'tabs',
            'scripting',
        ],
        host_permissions: [
            "https://music.youtube.com/*",
            "https://ws.audioscrobbler.com/",
            "https://www.last.fm/api/*",
        ],
        browser_specific_settings: {
            gecko: {
                // @ts-ignore this is required for firefox build
                data_collection_permissions: {
                    required: ["none"]
                }
            }
        }
    }
});
