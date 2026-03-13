import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
    manifest: {
        name: 'Briked LastFM YoutubeMusic Scrobbler',
        description: 'A browser extension to keep your Youtube Music listening activity up to date with your LastFM.',
        permissions: [
            'storage',
            'tabs',
            'activeTab',
            'scripting',
        ],
        host_permissions: [
            "https://music.youtube.com/*",
            "https://ws.audioscrobbler.com/",
            "https://www.last.fm/api/*",
        ]
    }
});
