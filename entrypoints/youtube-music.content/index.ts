import { logger } from "@/utils/logger";
import type { TrackInfo } from "@@/utils/types";


export default defineContentScript({
  matches: ['*://music.youtube.com/*'],
  main() {
    // todo, change to event/subsription based global state
    let scrobbleEnabled = true;
    let scrobbleRate = 0.5;
    let lastTitle = '';
    let scrobbled = false;
    let trackStartedAt = 0;

    // Reads currentTime and duration from the player bar time display.
    // This is reliable even for album streams where video.currentTime reflects
    // position in the full album rather than the current track.
    function getPlaybackTimes(): { currentTime: number; duration: number } {
      // YTMusic renders time as "1:23 / 3:45" in .time-info, or in separate spans
      const timeInfoEl = document.querySelector<HTMLElement>(
        'ytmusic-player-bar .time-info, #left-controls .time-info'
      );

      if (timeInfoEl) {
        const text = timeInfoEl.textContent ?? '';
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
          currentTime: parseTimeToSeconds(currentTimeEl.textContent ?? ''),
          duration: parseTimeToSeconds(durationEl.textContent ?? ''),
        };
      }

      // Last resort: video element (unreliable for album streams)
      const videoEl = document.querySelector<HTMLVideoElement>('video');
      return {
        currentTime: videoEl?.currentTime ?? 0,
        duration: videoEl?.duration ?? 0,
      };
    }

    function isAdPlaying(): boolean {
      // YouTube sets .ad-showing on the player during ads
      if (document.querySelector('.ad-showing')) return true;

      // if the sponsored tag isn't hidden
      const sponsoredElem = document.querySelector('.badge-style-type-ad-stark') as HTMLSpanElement;
      if (sponsoredElem && !sponsoredElem.hidden) return true;

      // Short duration as a last-resort filter
      const { duration } = getPlaybackTimes();
      if (duration > 0 && duration < AD_MIN_DURATION) return true;

      return false;
    }

    function getTrackInfo(): TrackInfo | null {
      const titleEl = document.querySelector<HTMLElement>('.title.ytmusic-player-bar');
      const bylineEl = document.querySelector<HTMLElement>('.byline.ytmusic-player-bar');
      const albumArtEl = document.querySelector<HTMLImageElement>('#song-image img');

      if (!titleEl || !bylineEl) return null;

      const title = titleEl.textContent?.trim() ?? '';

      // Byline anchor links: [0] = artist, [length - 1] = album (optional)
      // could be multiple artist so use the last as album
      const bylineLinks = Array.from(bylineEl.querySelectorAll<HTMLAnchorElement>('a'));
      const artist = bylineLinks[0]?.textContent?.trim() ?? bylineEl.textContent?.trim() ?? '';
      const album = bylineLinks[bylineLinks.length - 1]?.textContent?.trim() ?? '';

      const { currentTime, duration } = getPlaybackTimes();

      return { title, artist, album, albumArtUrl: albumArtEl?.src ?? '', duration, currentTime };
    }

    function onScrobble(track: TrackInfo) {
      browser.runtime.sendMessage({
        type: 'LASTFM_SET_SCROBBLE_TRACK',
        payload: { ...track, trackStartedAt }
      });
    }

    function onTrackChange(track: TrackInfo) {
      scrobbled = false;
      lastTitle = track.title;
      trackStartedAt = Math.floor((Date.now() - (track.currentTime ?? 0) * 1000) / 1000);
      browser.runtime.sendMessage({ type: 'LASTFM_SET_NOW_PLAYING', payload: track });
    }

    function checkTrackChange(track?: TrackInfo | null) {
      if (isAdPlaying()) return;
      const _track = track ?? getTrackInfo();
      if (!_track?.title || !_track?.duration || _track.title === lastTitle) return;
      // The track changes before the DOM element time refresh, so the DOM could report the previous timer briefly
      // if currenTime is above 5s, it cant be a new track
      if (_track.currentTime > 5) return;
      onTrackChange(_track);
    }

    function checkTrackScrobble(track: TrackInfo | null) {
      if (scrobbled || isAdPlaying()) return;
      const { currentTime, duration } = getPlaybackTimes();
      if (scrobbleEnabled && duration > 0 && currentTime >= duration * scrobbleRate) {
        scrobbled = true;
        if (track) onScrobble(track);
      }
    }

    function setupEventListener() {
      browser.storage?.local?.get<{ scrobbleEnabled: boolean; scrobbleRate: string; }>(DefaultScrobbleSettings)
        .then(({ scrobbleEnabled: se, scrobbleRate: sr }) => {
          scrobbleEnabled = se;
          scrobbleRate = sr ? Number(sr) / 100 : 0.5;
        })

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

    function onPlayerBarUpdate() {
      if (isAdPlaying()) return;
      const track = getTrackInfo();
      checkTrackScrobble(track);
      checkTrackChange(track);
    }

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
    // so we observer the player bar instead
    function setupPlayerBarObserver(playerBar: Element) {
      const observer = new MutationObserver(onPlayerBarUpdate);
      observer.observe(playerBar, { subtree: true, childList: true, characterData: true });
    }

    // Wait for the video element and ytmusic-player-bar to appear
    const domObserver = new MutationObserver(() => {
      const videoEl = document.querySelector<HTMLVideoElement>('video');
      const playerBar = document.querySelector('ytmusic-player-bar');
      if (videoEl && playerBar) {
        setupVideoListeners(videoEl);
        setupPlayerBarObserver(playerBar);
        domObserver.disconnect();
        checkTrackChange();
        logger.info("Scrobbler initialized")
      }
    });

    domObserver.observe(document.body, { childList: true, subtree: true });
    // this listens to popup events so can be initialzed without fully waiting for DOM elemnts to appear
    setupEventListener();
  },
});
