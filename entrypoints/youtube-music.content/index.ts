import { MessageTypes } from '@/utils/constants';
import { logger } from "@/utils/logger";
import type { TrackInfo, YtMusicPlayerType } from "@@/utils/types";


export default defineContentScript({
  matches: ['*://music.youtube.com/*'],
  main() {
    // todo, change to event/subsription based global state
    let scrobbleEnabled = true;
    let scrobbleRate = 0.5;
    let lastTitle = '';
    let scrobbled = false;
    let trackStartedAt = 0;
    let ytMusicPlayertype: YtMusicPlayerType | null = null;

    function isAdPlaying(): boolean {
      // YouTube sets .ad-showing on the player during ads
      if (document.querySelector('.ad-showing')) return true;

      // if the sponsored tag isn't hidden
      const sponsoredElem = document.querySelector('.badge-style-type-ad-stark') as HTMLSpanElement;
      if (sponsoredElem && !sponsoredElem.hidden) return true;

      // Short duration as a last-resort filter
      // const { duration } = getPlaybackTimes();
      //if (duration > 0 && duration < AD_MIN_DURATION) return true;

      return false;
    }

    function isValidTrack(track: TrackInfo | null): boolean {
      if (!track) return false;
      if (!track.title || !track.artist) return false;
      if (track.duration <= 0) return false;
      return true;
    }

    // Reads currentTime and duration from the player bar time display.
    // This is reliable even for album streams where video.currentTime reflects
    // position in the full album rather than the current track.
    function getPlaybackTimes(): { currentTime: number; duration: number } {
      if (ytMusicPlayertype === 'ytmusic-player-bar') {
        // YTMusic renders time as "1:23 / 3:45" in .time-info, or in separate spans
        const timeInfoEl = document.querySelector<HTMLElement>(
          'ytmusic-player-bar .time-info, #left-controls .time-info'
        );

        if (timeInfoEl) {
          const text = timeInfoEl.innerText ?? '';
          const [currentStr, durationStr] = text.split('/');

          if (currentStr && durationStr) {
            return {
              currentTime: parseTimeToSeconds(currentStr),
              duration: parseTimeToSeconds(durationStr),
            };
          }
        }

        // Fallback: separate current-time / duration elements
        const currentTimeEl = document.querySelector<HTMLElement>(
          'ytmusic-player-bar .current-time, #left-controls span.ytmusic-player-bar:first-of-type'
        );
        const durationEl = document.querySelector<HTMLElement>(
          'ytmusic-player-bar .duration, #left-controls span.ytmusic-player-bar:last-of-type'
        );
        if (currentTimeEl && durationEl) {
          return {
            currentTime: parseTimeToSeconds(currentTimeEl.innerText ?? ''),
            duration: parseTimeToSeconds(durationEl.innerText ?? ''),
          };
        }

      } else if (ytMusicPlayertype === 'ytmusic-miniplayer') {
        const timeInfoEl = document.querySelector<HTMLElement>('.ytMusicMiniPlayerTimeInfo');
        if (timeInfoEl) {
          const text = timeInfoEl.innerText ?? '';
          const [currentStr, durationStr] = text.split('/');

          if (currentStr && durationStr) {
            return {
              currentTime: parseTimeToSeconds(currentStr),
              duration: parseTimeToSeconds(durationStr),
            };
          }
        }
      }

      // Last resort: video element (unreliable for album streams)
      const videoEl = document.querySelector<HTMLVideoElement>('video');
      return {
        currentTime: videoEl?.currentTime ?? 0,
        duration: videoEl?.duration ?? 0,
      };
    }

    function getTrackInfo(): TrackInfo | null {
      if (ytMusicPlayertype === 'ytmusic-player-bar') {
        const titleEl = document.querySelector<HTMLElement>('.title.ytmusic-player-bar');
        const bylineEl = document.querySelector<HTMLElement>('.byline.ytmusic-player-bar');
        const albumArtEl = document.querySelector<HTMLImageElement>('#song-image img');

        if (!titleEl || !bylineEl) return null;

        const title = titleEl.innerText?.trim() ?? '';

        // Byline anchor links: [0] = artist, [length - 1] = album (optional)
        // could be multiple artist so use the last as album
        const bylineLinks = Array.from(bylineEl.querySelectorAll<HTMLAnchorElement>('a'));
        const artist = bylineLinks[0]?.innerText?.trim() ?? bylineEl.innerText?.trim() ?? '';
        const album = bylineLinks[bylineLinks.length - 1]?.innerText?.trim() ?? '';

        const { currentTime, duration } = getPlaybackTimes();

        return { title, artist, album, albumArtUrl: albumArtEl?.src ?? '', duration, currentTime };

      } else if (ytMusicPlayertype === 'ytmusic-miniplayer') {
        const titleEl = document.querySelector<HTMLElement>('.ytmusicTrackInfoTitle');
        const bylineEl = document.querySelector<HTMLElement>('.ytmusicTrackInfoBylineItem');
        const albumArtEl = document.querySelector<HTMLImageElement>('.ytmusicTrackInfoThumbnailWrapper img');

        if (!titleEl || !bylineEl) return null;

        const title = titleEl.innerText?.trim() ?? '';

        // Byline is usually in this format: Artist • Album • Year, can be in the title property or in descendant span elements
        // We can split by the bullet character and take the first part as the artist, the others could be missing so account for that
        const bylineFullText = bylineEl.title?.trim() ?? bylineEl.innerText?.trim() ?? '';
        const artist = bylineFullText.split('•')[0]?.trim() ?? '';
        const album = bylineFullText.split('•')[1]?.trim() ?? '';

        const { currentTime, duration } = getPlaybackTimes();

        return { title, artist, album, albumArtUrl: albumArtEl?.src ?? '', duration, currentTime };
      }
      return null;
    }

    function onScrobble(track: TrackInfo) {
      scrobbled = true;
      browser.runtime.sendMessage({
        type: MessageTypes.LASTFM_SET_SCROBBLE_TRACK,
        payload: { ...track, trackStartedAt }
      });
    }

    function onTrackChange(track: TrackInfo) {
      scrobbled = false;
      lastTitle = track.title;
      trackStartedAt = Math.floor((Date.now() - (track.currentTime ?? 0) * 1000) / 1000);
      browser.runtime.sendMessage({ type: MessageTypes.LASTFM_SET_NOW_PLAYING, payload: track });
    }

    function onUpdateTrackDuration(track: TrackInfo) {
      browser.runtime.sendMessage({ type: MessageTypes.SAVE_TRACK_DURATIONS, payload: {
        currentTime: track.currentTime,
        duration: track.duration,
      } });
    }

    function checkTrackChange(track: TrackInfo | null) {
      if (isAdPlaying()) return false;
      const _track = track ?? getTrackInfo();
      if (!_track?.title || !_track?.duration || _track.title === lastTitle) return false;
      // The track changes before the DOM element time refresh, so the DOM could report the previous timer briefly
      // if currenTime is above 5s, it cant be a new track
      if (_track.currentTime > 5) return false;
      return true;
    }

    function checkTrackScrobble(track: TrackInfo | null) {
      if (!track || scrobbled || isAdPlaying()) return false;
      const { currentTime, duration } = getPlaybackTimes();
      if (scrobbleEnabled && duration > 0 && currentTime >= duration * scrobbleRate) return true;
      return false;
    }

    function onPlayerBarUpdate() {
      if (isAdPlaying()) return;
      const track = getTrackInfo();
      if (!isValidTrack(track)) return;
      if (checkTrackScrobble(track)) onScrobble(track!);
      if (checkTrackChange(track)) onTrackChange(track!);
      onUpdateTrackDuration(track!);
    }

    // checks local storage for scrobble settings and sets up the initial state
    function setupLocalStateFromStore() {
      browser.storage?.local?.get<{ scrobbleEnabled: boolean; scrobbleRate: string; }>(DefaultScrobbleSettings)
        .then(({ scrobbleEnabled: se, scrobbleRate: sr }) => {
          scrobbleEnabled = se;
          scrobbleRate = sr ? Number(sr) / 100 : 0.5;
        })
    }

    // listens to changes in the storage so we can update the scrobble settings in real time
    function setupStorageListener() {
      browser.storage.onChanged.addListener((changes, _) => {
        for (let [key, { newValue }] of Object.entries(changes)) {

          if (key === "scrobbleEnabled") {
            scrobbleEnabled = !!newValue
          }

          if (key === "scrobbleRate") {
            scrobbleRate = newValue && typeof newValue === "string" ? Number(newValue) / 100 : 0.5;
          }
        }
      });
    }

    // listen to seek event so we can rescrobble if the user seeks back before the scrobble point
    function setupVideoListeners(videoEl: HTMLVideoElement) {
      videoEl.addEventListener('seeked', () => {
        if (!scrobbled) return;
        const { currentTime, duration } = getPlaybackTimes();
        if (duration > 0 && currentTime < duration * scrobbleRate) {
          scrobbled = false;
          // Recalculate start time based on new seek position
          trackStartedAt = Math.floor((Date.now() - currentTime * 1000) / 1000);
        }
      });
    }

    // video events like timeupdate are a bit unrelaible and stops triggering sometimes
    // so we observer the player bar / miniplayer instead permanently and check for changes in the track info and scrobble state
    function setupPlayerBarObserver(playerBar: Element) {
      const observer = new MutationObserver(onPlayerBarUpdate);
      observer.observe(playerBar, { subtree: true, childList: true, characterData: true });
    }

    // observe and wait for the video element and ytmusic-player-bar/ytmusic-miniplayer to appear
    const domObserver = new MutationObserver(() => {
      const videoEl = document.querySelector<HTMLVideoElement>('video');
      const playerBar = document.querySelector('ytmusic-player-bar');
      const miniplayer = document.querySelector('ytmusic-miniplayer');
      const playerBarOrMiniplayer = miniplayer ?? playerBar;
      ytMusicPlayertype = miniplayer ? 'ytmusic-miniplayer' : playerBar ? 'ytmusic-player-bar' : null;

      if (videoEl && playerBarOrMiniplayer) {
        setupVideoListeners(videoEl);
        setupPlayerBarObserver(playerBarOrMiniplayer);
        domObserver.disconnect();
        logger.info("Scrobbler initialized")
      }
    });

    domObserver.observe(document.body, { childList: true, subtree: true });
    // this listens to popup events so can be initialzed without fully waiting for DOM elemnts to appear
    setupLocalStateFromStore();
    setupStorageListener();
  },
});
