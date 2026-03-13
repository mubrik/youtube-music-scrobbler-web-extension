export default defineContentScript({
  matches: ['*://*.last.fm/api/*'],
  main() {
    // we simply want our token authenticated, we get session key after it is
    if (document.title?.toLowerCase().includes("application authenticated")) {
        const searchParams = new URLSearchParams(document.location.search);
        browser.runtime.sendMessage({ type: 'LASTFM_GET_SESSION_KEY', payload: {
            token: searchParams.get("token"),
            apiKey: searchParams.get("api_key")
        } })
    }
  },
});
