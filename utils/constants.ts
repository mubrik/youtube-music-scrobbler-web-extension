const MessageTypes = {
  CHECK_AUTH: 'CHECK_AUTH',
  CHECK_NOW_PLAYING: 'CHECK_NOW_PLAYING',
  CLEAR_DATA: 'CLEAR_DATA',
  OPEN_LASTFM_AUTH_PAGE: 'OPEN_LASTFM_AUTH_PAGE',
  POPUP_SET_NOW_PLAYING: 'POPUP_SET_NOW_PLAYING',
  POPUP_ERROR_NOTIFY: 'POPUP_ERROR_NOTIFY',
  LASTFM_GET_SESSION_KEY: 'LASTFM_GET_SESSION_KEY',
  LASTFM_SET_NOW_PLAYING: 'LASTFM_SET_NOW_PLAYING',
  LASTFM_SET_SCROBBLE_TRACK: 'LASTFM_SET_SCROBBLE_TRACK',
  LASTFM_TOGGLE_LIKE: 'LASTFM_TOGGLE_LIKE',
  SAVE_SCROBBLE_MODE: 'SAVE_SCROBBLE_MODE',
  SAVE_SCROBBLE_RATE: 'SAVE_SCROBBLE_RATE',
} as const;

const DefaultUserSession = {
  session: "",
  username: "",
  subscriber: "",
}
type DefaultUserSession = typeof DefaultUserSession;
const DefaultScrobbleSettings = { scrobbleEnabled: true, scrobbleRate: "50" };
const DefaultNowPlaying = {
  artist: "",
  title: "",
  album: "",
  trackAddedAt: 0,
  playCount: "",
  duration: 0,
  currentTime: 0,
  isLoved: false,
};
type DefaultNowPlaying = typeof DefaultNowPlaying;

const AD_MIN_DURATION = 15; // seconds — tracks shorter than this are suspect

export { MessageTypes, AD_MIN_DURATION, DefaultScrobbleSettings, DefaultNowPlaying, DefaultUserSession };
