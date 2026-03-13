import './style.css';
import { MessageTypes } from '@/utils/constants';
import { DefaultScrobbleSettings, DefaultNowPlaying } from '@/utils/constants';
import type { UserInfo } from "@/utils/types";

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<body>
    <div id="toast"></div>
    <div id="authorization-gate" class="authorization-gate">
        <header class="main-header">
            <div class="logo-area">
                <span class="fm-logo">Briked</span>
                <h1 class="extension-title">Last.fm Scrobbler</h1>
            </div>
            <p class="subtitle">Your YouTube Music Companion</p>
        </header>
        <div class="auth-card">
            <h1 class="auth-title">Welcome</h1>
            <p class="auth-description">To start automatically scrobbling your YouTube Music tracks to Last.fm, you need to authorize this extension with your account.</p>
            <p class="auth-details">This is a one-time connection. Your credentials are safe.</p>
            <p class="auth-details">After a successful authorization, Please refresh Youtube Music</p>
            <button id="auth-connect-btn" class="btn btn-primary connect-btn auth-connect-btn">
                Connect to Last.fm
            </button>
            <p class="auth-footer-text">We never access your credentials.</p>
        </div>
    </div>
    <div class="main-app-container hidden">
        <header class="main-header">
            <div class="logo-area">
                <span class="fm-logo">Briked</span>
                <h1 class="extension-title">Last.fm Scrobbler</h1>
            </div>
            <p class="subtitle">Your YouTube Music Companion</p>
        </header>
        <section class="card current-track">
            <div class="card-header">Now Playing on LastFM</div>
            <div class="track-details">
                <div class="album-art-placeholder">
                    <span class="music-icon">🎵</span>
                </div>
                <div class="track-text">
                    <h2 class="track-title"></h2>
                    <p class="artist-name"></p>
                    <div class="track-sub-detail">
                        <button class="like-button" id="toggle-like" aria-label="Toggle like">
                            <svg class="heart-icon outline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.78-8.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                            <svg class="heart-icon fill" viewBox="0 0 24 24" fill="none">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path>
                            </svg>
                            <svg class="like-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <circle cx="12" cy="12" r="9" stroke-dasharray="28 56" stroke-linecap="round"/>
                            </svg>
                        </button>
                        <p class="track-play-count" id="play-count">N/A</p>
                    </div>
                </div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" id="progress-fill"></div>
            </div>
        </section>
        <section class="card settings-container">
            <div class="card-header">Settings</div>
            <div class="setting-item toggle-item">
                <label for="scrobbleToggle">Enable scrobbling</label>
                <label class="switch">
                    <input type="checkbox" id="scrobble-toggle" checked>
                    <span class="slider round"></span>
                </label>
            </div>
            <div class="setting-item dropdown-item">
                <select id="scrobble-at" class="styled-select">
                    <option value="50" selected>After 50% (Halfway)</option>
                    <option value="75">After 75%</option>
                    <option value="90">At 100% (End)</option>
                </select>
            </div>
            <div class="action-item connect-lastfm hidden">
                <button class="btn btn-primary connect-btn">
                    <span class="btn-icon">as</span> Connect to Last.fm
                </button>
            </div>
        </section>

        <footer class="main-footer">
            <button class="btn btn-secondary profile-btn" id="profile-btn">
                <span class="btn-icon profile-icon">👤</span> Open Last.fm Profile
            </button>
            <button class="icon-btn btn-danger" id="reset-btn">
               <span class="btn-icon profile-icon">♲</span>
            </button>
        </footer>
    </div>
</body>
`;

async function getLocalUserData() {
    const { username, subscriber, session } = await browser.storage.local.get<UserInfo>(['subscriber', 'username', 'session']);
    return { username: username ?? null, subscriber: subscriber ?? null, session: session ?? null };
}

function updateTrackLoveStatus(isLoved: boolean) {
    const likeBtn = document.getElementById("toggle-like") as HTMLButtonElement | null;
    if (!likeBtn) return;
    likeBtn.classList.remove("loading");
    likeBtn.disabled = false;
    if (isLoved) {
        likeBtn.classList.add("liked");
    } else {
        likeBtn.classList.remove("liked");
    }
}

function showPopupError(errorMsg: string) {
    const toast = document.getElementById("toast");
    if (toast && errorMsg) {
        toast.className = "show error";
        toast.textContent = errorMsg;
        setTimeout(function(){
            toast.className = toast.className.replace("show", "hide");
        }, 6000);
        // clear error
        browser.storage.session?.set({ showPopupError: "" });
    }
}

function setupRuntimeListeners() {
    // create a port so we cna track when the port closes on popup close in backgroud script
    browser.runtime.connect({ name: "popup script"});
    browser.runtime.onMessage.addListener((message) => {
        if (message.type === MessageTypes.POPUP_ERROR_NOTIFY) {
            const { error } = message.payload;
            const errorClassElem = document.querySelector(".popup-error");
            const errorElem = document.getElementById("popup-error-msg");
            if (errorElem && error) {
                errorClassElem?.classList.remove("hidden");
                errorElem.innerText = error;
            }
        }
    });
    // track changes
    browser.storage.onChanged.addListener((changes, namespace) => {
        for (let [key, { newValue }] of Object.entries(changes)) {
            if (key === "isLoved" && namespace === "session") {
                updateTrackLoveStatus(!!newValue as boolean);
            }

            if (key === "showPopupError" && namespace === "session") {
                showPopupError(newValue as string);
            }
        }
    });
}

function setupButtonListeners() {
    const connectBtn = document.getElementById("auth-connect-btn");
    const profileBtn = document.getElementById("profile-btn");
    const resetBtn = document.getElementById("reset-btn");
    const likeBtn = document.getElementById("toggle-like");

    // handlers that need auth request send to background js
    connectBtn?.addEventListener('click', () => {
        browser.runtime.sendMessage({ type: MessageTypes.OPEN_LASTFM_AUTH_PAGE });
    });
    likeBtn?.addEventListener('click', () => {
        const btn = likeBtn as HTMLButtonElement;
        btn.classList.add("loading");
        btn.disabled = true;
        browser.runtime.sendMessage({ type: MessageTypes.LASTFM_TOGGLE_LIKE });
    });

    // handlers that cna be carried out locally
    profileBtn?.addEventListener('click', async () => {
        const { username } = await getLocalUserData();
        if (username) {
            const url = `https://www.last.fm/user/${username}`;
            browser.tabs.create({ url });
        }
    });

    resetBtn?.addEventListener('click', () => {
        if(confirm("Clear Credentials and Local data?")) {
            browser.storage.session?.clear();
            browser.storage.local?.clear();
        }
    });
}

function setupInputListeners() {
    const scrobbleToggle = document.getElementById("scrobble-toggle");
    const scrobbleAt = document.getElementById("scrobble-at");

    if (scrobbleToggle) {
        scrobbleToggle.onchange = (ev: Event) => {
            const scrobble = (ev.target as HTMLInputElement)?.checked;
            browser.storage.local?.set({ scrobbleEnabled: scrobble });
        }
    }

    if (scrobbleAt) {
        scrobbleAt.onchange = (ev: Event) => {
            const rate = (ev.target as HTMLSelectElement)?.value;
            browser.storage.local?.set({ scrobbleRate: rate });
        }
    }
}

async function setScrobbleSettingsFromLocalStore() {
    const scrobbleToggle = document.getElementById("scrobble-toggle");
    const scrobbleAt = document.getElementById("scrobble-at");

    const { scrobbleEnabled: se, scrobbleRate: sr } = await browser.storage?.local?.get<{ scrobbleEnabled: boolean; scrobbleRate: string;}>(DefaultScrobbleSettings);

    if (scrobbleToggle) {
        (scrobbleToggle as HTMLInputElement).checked = se;
    }

    if (scrobbleAt) {
        (scrobbleAt as HTMLSelectElement).value = sr;
    }
}

async function setNowPlayingFromSessionStore() {
    const titleElem = document.querySelector(".track-title");
    const artistElem = document.querySelector(".artist-name");
    const playCountElem = document.getElementById("play-count");
    const progress = document.getElementById("progress-fill");

    const {
        title, artist, isLoved, currentTime, duration, playCount
    } = await browser.storage.session?.get<DefaultNowPlaying>(DefaultNowPlaying);

    if (titleElem && title) titleElem.innerHTML = title;
    if (artistElem && artist) artistElem.innerHTML = artist;
    if (playCountElem) playCountElem.innerHTML = `Plays: ${playCount || "N/A"}`;
    if (duration && currentTime && progress) {
        const durrPercent = Math.round((Math.max(Math.round(currentTime), 1) / 100) * Math.round(duration));
        progress.style.width = `${durrPercent}%`;
    }
    updateTrackLoveStatus(isLoved);
}

async function checkAuthFromLocalStore() {
    const { session } = await getLocalUserData();
    if (session) {
        document.querySelector('.authorization-gate')?.classList.add("hidden");
        document.querySelector('.main-app-container')?.classList.remove("hidden");
    }
}

async function main() {
    await checkAuthFromLocalStore();
    setupRuntimeListeners();
    setupButtonListeners();
    setupInputListeners();
    // otehr promises
    setScrobbleSettingsFromLocalStore();
    setNowPlayingFromSessionStore();
}

main();