import { logger } from "@/utils/logger";
import type { TrackInfo, GetUserTrackResponse, UserInfo } from "@@/utils/types";
import { md5 } from "js-md5";

export default defineBackground(() => {

    async function getLocalSessionKey() {
        const { session } = await browser.storage.local.get<{ session?: string }>('session');
        return session;
    }

    async function getLocalUserData() {
        const { username, subscriber } = await browser.storage.local.get<UserInfo>(['subscriber', 'username']);
        return { username: username ?? null, subscriber: subscriber ?? null };
    }

    async function getSessionNowPlaying() {
        const nowPlaying = await browser.storage.session?.get<typeof DefaultNowPlaying>(DefaultNowPlaying);
        return nowPlaying;
    }

    async function getAuthToken() {
        const result = {} as { token?: string; error?: string };
        try {
            const apiKey = import.meta.env.VITE_LASTFM_API_KEY || "";
            const response = await fetch(`https://ws.audioscrobbler.com/2.0/?method=auth.gettoken&api_key=${apiKey}&format=json`);
            const data = await response.json() as { token: string };
            result.token = data?.token;
        } catch (error) {
            result.error = "We encountered an issue reaching lastFM, Please try again later";
        }
        return result;
    }

    async function signPayloadWithSecret(data: Record<string, string>, secret: string) {
        let _md5Str = "";
        const sortedKeys = Object.keys(data).sort();
        sortedKeys.forEach((item) => { _md5Str += item + data[item]; });
        // concat secret directly at end
        _md5Str += secret;

        return {
            ...data,
            api_sig: md5(_md5Str),
            format: "json"
        };
    }

    async function getUserSessionForToken(token: string) {
        const apiKey = import.meta.env.VITE_LASTFM_API_KEY || "";
        const apiSecret = import.meta.env.VITE_LASTFM_API_SECRET || "";
        const result = {} as { session?: { key: string; name: string; subscriber: number }; error?: string };

        try {
            const _md5 = md5(`api_key${apiKey}method${"auth.getSession"}token${token}${apiSecret}`);
            // add signature and response format after
            const data = new URLSearchParams({
                method: "auth.getSession",
                api_key: apiKey,
                token: token,
                api_sig: _md5,
                format: "json"
            });
            const response = await fetch("https://ws.audioscrobbler.com/2.0/?" + data.toString());
            if (response.ok) {
                const data = await response.json() as { session: { key: string; name: string; subscriber: number } };
                result.session = data.session;
            } else {
                const error = await response.text();
                result.error = error;
            }

        } catch (error) {
            result.error = "We encountered an issue validating your token, Please try again later"
        }

        return result;
    }

    async function lastFmRequest<T extends {}>(params: { method: string, payload: Record<string, string> }) {
        const apiKey = import.meta.env.VITE_LASTFM_API_KEY || "";
        const apiSecret = import.meta.env.VITE_LASTFM_API_SECRET || "";
        const sessionKey = await getLocalSessionKey();

        if (!sessionKey || !apiKey || !apiSecret) {
            return { error: "Invalid Session, Please authorize our extension on LastFM" }
        }

        const payload = await signPayloadWithSecret({
            ...params.payload,
            api_key: apiKey,
            sk: sessionKey
        }, apiSecret);

        const payloadToSearchParams = new URLSearchParams(payload);
        let url = "https://ws.audioscrobbler.com/2.0/";
        const opts = { method: params.method } as Record<string, unknown>;

        if (params.method === "POST") {
            opts["body"] = payloadToSearchParams;
        } else {
            url = url + "?" + payloadToSearchParams.toString()
        }

        const result = await fetch(url, opts);
        if (result.ok) {
            const data = await result.json();
            return { data: data as T, ok: true };
        } else {
            const error = await result.text();
            return { error, ok: false };
        }
    }

    browser.runtime.onMessage.addListener((message, sender) => {

        if (message.type === MessageTypes.OPEN_LASTFM_AUTH_PAGE) {
            getAuthToken()
                .then((result) => {
                    const { error, token } = result;

                    if (token) {
                        const apiKey = import.meta.env.VITE_LASTFM_API_KEY || "";
                        const authUrl = `https://www.last.fm/api/auth/?api_key=${apiKey}&token=${token}`;
                        browser.tabs.create({ url: authUrl });
                    } else {
                        browser.storage.session?.set({ showPopupError: error || "An error Occured" });
                    }
                })
                .catch(() => {
                    browser.storage.session?.set({ showPopupError: "An error occured reaching LastFM, Please try again later" });
                })
        }

        if (message.type === MessageTypes.LASTFM_GET_SESSION_KEY) {
            const { apiKey, token } = message.payload as { apiKey: string | null; token: string | null };
            if (!apiKey || !token) {
                browser.runtime.sendMessage({
                    type: MessageTypes.POPUP_ERROR_NOTIFY,
                    payload: {
                        type: "AUTH_API_ACCESS_ERROR",
                        message: "An error occured valdating permission, Please retry access flow"
                    }
                });
                return
            }

            getUserSessionForToken(token)
                .then((result) => {
                    if (result.session) {
                        const { key, name, subscriber } = result.session;
                        // store in sync storage
                        browser.storage.sync?.set({
                            session: key,
                            username: name,
                            subscriber: subscriber,
                        });
                        // store in local
                        browser.storage.local?.set({
                            session: key,
                            username: name,
                            subscriber: subscriber,
                        });
                    } else {
                        browser.storage.session?.set({ showPopupError: result.error || "An error occured" });
                        return
                    }
                })
        }

        if (message.type === MessageTypes.LASTFM_SET_NOW_PLAYING) {
            const { artist, title, duration, currentTime, album } = message.payload as TrackInfo;
            const payload = { artist, track: title, album, method: "track.updateNowPlaying" };

            // update last fm now playing
            lastFmRequest({ method: "POST", payload })
                .then(() => {
                    browser.storage.session?.set({
                        artist,
                        title,
                        album,
                        duration,
                        currentTime,
                        playCount: "",
                        isLoved: false,
                        trackAddedAt: Date.now()
                    });
                    logger.info(title);
                })
                .catch((res) => {
                    browser.storage.session?.set(DefaultNowPlaying);
                    browser.storage.session?.set({ showPopupError: "Error occured setting the playing track on LastFM" });
                    logger.error({message: "Error occured setting the playing track on LastFM", error: res});
                });
            // get track interactions for user
            getLocalUserData()
                .then((res) => {
                    if (res.username) {
                        const getTrackPayload = { artist, track: title, method: "track.getInfo", username: res.username };
                        lastFmRequest<GetUserTrackResponse>({ method: "GET", payload: getTrackPayload })
                            .then((res) => {
                                if (res.ok) {
                                    const track = res.data?.track;
                                    if (track) {
                                        browser.storage.session?.set({
                                            playCount: track.userplaycount,
                                            isLoved: track.userloved === "1" ? true : false
                                        });
                                    }
                                } else {
                                    logger.error("Error getting user track info");
                                }
                            })
                            .catch((res) => {
                                logger.error({ message: "Error getting user track info", error: res });
                            });
                    }
                })
        }

        if (message.type === MessageTypes.LASTFM_SET_SCROBBLE_TRACK) {
            const { artist, title, trackStartedAt, album } = message.payload as TrackInfo & { trackStartedAt: number };
            const payload = { artist, track: title, album, timestamp: String(trackStartedAt), method: "track.scrobble" };
            lastFmRequest({ method: "POST", payload })
                .then((_) => {
                    // pass
                    logger.info(`LastFm Scrobbled: ${title}`);
                })
                .catch((res) => {
                    browser.storage.session?.set({ showPopupError: "Error occured scrobbling track to LastFM" });
                    logger.error({ message: "Error scrobbling track to LASTFM", error: res });
                });
        }

        if (message.type === MessageTypes.LASTFM_TOGGLE_LIKE) {
            getSessionNowPlaying()
                .then(({ artist, title, isLoved }) => {
                    const payload = { artist, track: title, method: isLoved ? "track.unlove" : "track.love" };
                    lastFmRequest({ method: "POST", payload })
                        .then((res) => {
                            if (res.ok) {
                                browser.storage.session?.set({ isLoved: !isLoved });
                            } else {
                                browser.storage.session?.set({ isLoved: isLoved });
                            }
                        })
                        .catch((res) => {
                            browser.storage.session?.set({ isLoved: isLoved });
                            browser.storage.session?.set({ showPopupError: "Error occured liking track on LASTFM" });
                            logger.error({ message: "Error liking track on LASTFM", error: res});
                        });
                })
        }

        return true;
    });

    browser.runtime.onConnect.addListener((externalPort) => {
        externalPort.onDisconnect.addListener((p) => {
            // disconnect foired when popup closes
            if (p.name === "popup script") {
                // we clear any error
                browser.storage.session?.set({ showPopupError: "" });
            }
        })
    });

    browser.runtime.onInstalled.addListener(async () => {
        // we clear and ask for reauth, for now.
        // the session keys for versions before 2.0 are all invalid, so we should force a new session get
        browser.tabs.create({ url: "popup.html" });
        return;
        const prevSetup = await browser.storage.sync?.get<typeof DefaultUserSession>(DefaultUserSession);
        if (prevSetup.session) {
            browser.storage.local?.set(prevSetup);
        } else {
            browser.tabs.create({ url: "popup.html" });
        }
    });
});
