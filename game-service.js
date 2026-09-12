// ============================================================================
// PENALTY KICK ARENA — STANDALONE SERVICE MANAGER (game-service.js)
// Forked from the Afro Game Hub's game-hub.js, but fully independent:
// its own localStorage namespace, its own header branding, no shared
// player identity, coins, or stats with the Afro Game Hub lobby.
// ============================================================================

class PenaltyKickService {
    constructor() {
        this.statsKey = 'penaltyKickStats';
        this.muteKey = 'penaltyKickMute';
        this.themeKey = 'penaltyKickTheme';
        this.playerIdKey = 'penaltyKickPlayerId';

        // Google Apps Script Web App deployment URL + shared secret (see apps-script/Code.gs).
        // Leave cloudApiUrl empty to run fully offline on localStorage only.
        this.cloudApiUrl = '';
        this.cloudApiKey = '';
        this.playerId = this.getOrCreatePlayerId();

        this.stats = this.loadStats();
        this.isMuted = localStorage.getItem(this.muteKey) === 'true';
        this.themeSetting = localStorage.getItem(this.themeKey) || 'auto'; // 'auto', 'light', 'dark'
        this.audioCtx = null;

        this.syncFromCloud();

        // Dynamic CSS injection for font
        this.injectGoogleFonts();

        // Wait for DOM to load to inject header and style adjustments
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        this.applyTheme();
        document.body.style.paddingTop = '75px';
        this.injectHeader();
    }

    getAutoTheme() {
        const hour = new Date().getHours();
        return (hour >= 6 && hour < 18) ? 'light' : 'dark';
    }

    resolveTheme() {
        if (this.themeSetting === 'auto') {
            return this.getAutoTheme();
        }
        return this.themeSetting;
    }

    applyTheme() {
        const activeTheme = this.resolveTheme();
        if (activeTheme === 'light') {
            document.body.classList.add('light-theme');
        } else {
            document.body.classList.remove('light-theme');
        }
        this.updateThemeBtn();
    }

    toggleTheme() {
        if (this.themeSetting === 'auto') {
            this.themeSetting = 'light';
        } else if (this.themeSetting === 'light') {
            this.themeSetting = 'dark';
        } else {
            this.themeSetting = 'auto';
        }
        localStorage.setItem(this.themeKey, this.themeSetting);
        this.applyTheme();
    }

    injectGoogleFonts() {
        if (!document.getElementById('hub-fonts')) {
            const link = document.createElement('link');
            link.id = 'hub-fonts';
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap';
            document.head.appendChild(link);
        }

        if (!document.getElementById('hub-global-styles')) {
            const styles = document.createElement('link');
            styles.id = 'hub-global-styles';
            styles.rel = 'stylesheet';
            styles.href = 'game-hub.css';
            document.head.appendChild(styles);
        }
    }

    loadStats() {
        const defaultStats = {
            coins: 0,
            wins: 0,
            streaks: 0,
            bestStreak: 0,
            plays: 0
        };

        try {
            const saved = localStorage.getItem(this.statsKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                return { ...defaultStats, ...parsed };
            }
        } catch (e) {
            console.error('Error loading stats from localStorage', e);
        }
        return defaultStats;
    }

    saveStats() {
        try {
            localStorage.setItem(this.statsKey, JSON.stringify(this.stats));
        } catch (e) {
            console.error('Error saving stats to localStorage', e);
        }
        this.syncToCloud();
    }

    // --- CLOUD SYNC (Google Sheets via Apps Script, see apps-script/Code.gs) ---

    getOrCreatePlayerId() {
        let id = localStorage.getItem(this.playerIdKey);
        if (!id) {
            id = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
            localStorage.setItem(this.playerIdKey, id);
        }
        return id;
    }

    // Fresh browser (no local progress yet) adopts cloud stats, so progress
    // can follow a player to a new device. Otherwise localStorage stays the
    // source of truth and cloud is just a mirror.
    async syncFromCloud() {
        if (!this.cloudApiUrl) return;
        try {
            const url = `${this.cloudApiUrl}?action=getStats&playerId=${encodeURIComponent(this.playerId)}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.found) {
                const localIsFresh = this.stats.coins === 0 && this.stats.plays === 0;
                if (localIsFresh) {
                    this.stats = {
                        coins: Number(data.stats.coins) || 0,
                        wins: Number(data.stats.wins) || 0,
                        streaks: Number(data.stats.streaks) || 0,
                        bestStreak: Number(data.stats.bestStreak) || 0,
                        plays: Number(data.stats.plays) || 0
                    };
                    this.saveStats();
                    this.updateHeaderUI();
                }
            }
        } catch (e) {
            console.warn('Cloud stats fetch failed, using local only', e);
        }
    }

    syncToCloud() {
        if (!this.cloudApiUrl) return;
        fetch(this.cloudApiUrl, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateStats',
                apiKey: this.cloudApiKey,
                playerId: this.playerId,
                stats: this.stats
            })
        }).catch(e => console.warn('Cloud stats sync failed', e));
    }

    // --- COIN & WIN ACTIONS ---

    addCoins(amount) {
        if (amount <= 0) return;
        this.stats.coins += amount;
        this.saveStats();

        this.playCoinSound();
        this.triggerCoinAnimation(amount);
        this.updateHeaderUI();

        window.dispatchEvent(new CustomEvent('coinsUpdated', { detail: { coins: this.stats.coins, added: amount } }));
    }

    recordGamePlayed() {
        this.stats.plays++;
        this.saveStats();
    }

    recordWin(_gameId, coinAmount = 0) {
        this.stats.wins++;
        this.stats.streaks++;
        if (this.stats.streaks > this.stats.bestStreak) {
            this.stats.bestStreak = this.stats.streaks;
        }
        this.saveStats();

        if (coinAmount > 0) {
            let multiplier = 1;
            if (this.stats.streaks >= 3) multiplier = 1.2;
            if (this.stats.streaks >= 5) multiplier = 1.5;
            if (this.stats.streaks >= 10) multiplier = 2.0;

            const finalCoins = Math.round(coinAmount * multiplier);
            this.addCoins(finalCoins);
        }

        this.updateHeaderUI();
    }

    recordLoss() {
        this.stats.streaks = 0;
        this.saveStats();
        this.updateHeaderUI();
    }

    getDifficulty() {
        const params = new URLSearchParams(window.location.search);
        const difficulty = params.get('difficulty') || 'normal';
        return ['easy', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal';
    }

    // --- AUDIO SYSTEM ---

    initAudio() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    playTone(freq, duration, type = 'sine', gainStart = 0.15) {
        if (this.isMuted) return;
        try {
            this.initAudio();
            const osc = this.audioCtx.createOscillator();
            const gainNode = this.audioCtx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

            gainNode.gain.setValueAtTime(gainStart, this.audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

            osc.connect(gainNode);
            gainNode.connect(this.audioCtx.destination);

            osc.start();
            osc.stop(this.audioCtx.currentTime + duration);
        } catch (e) {
            console.warn('Web Audio playback failed', e);
        }
    }

    playClick() {
        this.playTone(600, 0.06, 'triangle', 0.1);
    }

    playCoinSound() {
        this.playTone(987.77, 0.08, 'sine', 0.15);
        setTimeout(() => {
            this.playTone(1318.51, 0.25, 'sine', 0.15);
        }, 80);
    }

    playWin() {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playTone(freq, 0.15, 'sine', 0.12);
            }, idx * 100);
        });
    }

    playLose() {
        const notes = [392.00, 349.23, 311.13, 246.94];
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playTone(freq, 0.2, 'sawtooth', 0.12);
            }, idx * 130);
        });
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        localStorage.setItem(this.muteKey, this.isMuted);
        this.updateHeaderMuteBtn();
    }

    // --- UI INJECTION ---

    injectHeader() {
        const header = document.createElement('header');
        header.className = 'hub-header';
        header.innerHTML = `
            <span class="hub-logo" id="hubLobbyBtn">
                <span class="logo-icon">⚽</span>
                <span class="logo-text">PENALTY KICK ARENA</span>
            </span>
            <div class="hub-stats">
                <div class="hub-stat-item coin-item" id="hubCoinWrapper">
                    <span class="coin-icon">🪙</span>
                    <span class="hub-stat-value" id="hubCoins">${this.stats.coins}</span>
                    <div class="coin-float-container" id="hubCoinFloatContainer"></div>
                </div>
                <div class="hub-stat-item streak-item">
                    <span class="streak-icon">🔥</span>
                    <span class="hub-stat-value" id="hubStreak">${this.stats.streaks}</span>
                </div>
                <button class="hub-audio-toggle" id="hubThemeBtn" title="Toggle Theme" style="margin-right: -4px; padding: 0 8px; width: auto; min-width: 32px; border-radius: 20px;">
                    <span class="audio-icon" id="hubThemeIcon">🌓</span>
                </button>
                <button class="hub-audio-toggle" id="hubAudioBtn" title="Toggle Sound">
                    <span class="audio-icon" id="hubAudioIcon">🔊</span>
                </button>
            </div>
        `;
        document.body.prepend(header);

        document.getElementById('hubAudioBtn').addEventListener('click', () => {
            this.initAudio();
            this.toggleMute();
        });

        document.getElementById('hubThemeBtn').addEventListener('click', () => {
            this.toggleTheme();
        });

        this.updateHeaderMuteBtn();
        this.updateThemeBtn();
    }

    updateThemeBtn() {
        const iconEl = document.getElementById('hubThemeIcon');
        const btnEl = document.getElementById('hubThemeBtn');
        if (iconEl) {
            const activeTheme = this.resolveTheme();
            if (this.themeSetting === 'auto') {
                iconEl.textContent = activeTheme === 'light' ? '🌓☀️' : '🌓🌙';
                if (btnEl) btnEl.title = `Theme: Auto [${activeTheme === 'light' ? 'Day' : 'Night'}] (Click to switch to Light)`;
            } else if (this.themeSetting === 'light') {
                iconEl.textContent = '☀️';
                if (btnEl) btnEl.title = "Theme: Light (Click to switch to Dark)";
            } else {
                iconEl.textContent = '🌙';
                if (btnEl) btnEl.title = "Theme: Dark (Click to switch to Auto)";
            }
        }
    }

    updateHeaderUI() {
        const coinsEl = document.getElementById('hubCoins');
        const streakEl = document.getElementById('hubStreak');

        if (coinsEl) coinsEl.textContent = this.stats.coins;
        if (streakEl) streakEl.textContent = this.stats.streaks;
    }

    updateHeaderMuteBtn() {
        const iconEl = document.getElementById('hubAudioIcon');
        const btnEl = document.getElementById('hubAudioBtn');
        if (!iconEl || !btnEl) return;

        if (this.isMuted) {
            iconEl.textContent = '🔇';
            btnEl.classList.add('muted');
        } else {
            iconEl.textContent = '🔊';
            btnEl.classList.remove('muted');
        }
    }

    triggerCoinAnimation(amount) {
        const container = document.getElementById('hubCoinFloatContainer');
        const coinWrapper = document.getElementById('hubCoinWrapper');
        if (!container || !coinWrapper) return;

        coinWrapper.classList.remove('payout');
        void coinWrapper.offsetWidth;
        coinWrapper.classList.add('payout');

        const floater = document.createElement('span');
        floater.className = 'coin-float-text';
        floater.textContent = `+${amount}`;
        container.appendChild(floater);

        setTimeout(() => {
            floater.remove();
        }, 1200);
    }
}

// Instantiate service manager under the same global name the game code expects (window.gameHub),
// so penalty-kick.html's game logic doesn't need to change — but it now points at an entirely
// separate, independent instance/namespace instead of the Afro Game Hub lobby's.
window.gameHub = new PenaltyKickService();
