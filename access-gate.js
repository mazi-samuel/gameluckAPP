// ============================================================================
// ACCESS GATE (access-gate.js)
// Subscription check that sits in front of every page. The landing screen is
// always reachable; the game behind it only unlocks for subscribed numbers.
//
//   1. Mobile data: the carrier injects an MSISDN header, which the proxy
//      (server/proxy.js) reads on GET /api/check-status.
//   2. No header (Wi-Fi, desktop): the visitor enters their phone number,
//      checked via GET /api/check-phone/:msisdn.
//   3. Not subscribed: show the plans below, then "Check again".
//
// This is a client-side gate: it keeps honest visitors on the right path but
// the static game files are still reachable directly.
// ============================================================================

(function () {
    const CONFIG = {
        serviceName: 'Penalty Kick Arena',
        tagline: 'Pick your corner, beat the keeper, stack your coins.',
        shortCode: '7143',
        plans: [
            { name: 'Daily', price: 100, keyword: 'GD', period: 'day' },
            { name: '3 Days', price: 150, keyword: 'GW', period: '3 days' }
        ],
        unsubscribeHint: 'To unsubscribe, text STOP GD (daily) or STOP GW (3 days) to 7143.',
        storagePrefix: 'penaltyKick'
    };

    const ACCESS_KEY = CONFIG.storagePrefix + 'Access';     // sessionStorage
    const PHONE_KEY = CONFIG.storagePrefix + 'GatePhone';   // localStorage
    const ACCESS_TTL_MS = 30 * 60 * 1000;
    const REQUEST_TIMEOUT_MS = 10000;

    // Nigerian mobile numbers in any common shape: 0803..., 803..., 234803..., +234803...
    const NG_MOBILE = /^(?:\+?234|0)?([789][01]\d{8})$/;

    function normalizePhone(raw) {
        const match = String(raw || '').replace(/[\s()-]/g, '').match(NG_MOBILE);
        return match ? '234' + match[1] : null;
    }

    function maskPhone(msisdn) {
        return '0' + msisdn.slice(3, 6) + '****' + msisdn.slice(-3);
    }

    function storageGet(store, key) {
        try { return store.getItem(key); } catch (e) { return null; }
    }

    function storageSet(store, key, value) {
        try { store.setItem(key, value); } catch (e) { /* private mode etc. */ }
    }

    function storageRemove(store, key) {
        try { store.removeItem(key); } catch (e) { /* ignore */ }
    }

    function hasFreshAccess() {
        try {
            const cached = JSON.parse(storageGet(sessionStorage, ACCESS_KEY));
            return !!cached && cached.until > Date.now();
        } catch (e) {
            return false;
        }
    }

    // Cached access skips the gate entirely, so moving between pages doesn't
    // flash the landing screen or re-hit the status API.
    if (hasFreshAccess()) {
        window.accessGranted = true;
        return;
    }

    document.documentElement.classList.add('gate-locked');

    const style = document.createElement('style');
    style.textContent = `
        html.gate-locked body > *:not(#accessGate) { visibility: hidden; }
        html.gate-locked body { overflow: hidden; }
        #accessGate {
            position: fixed; inset: 0; z-index: 2147483000;
            display: flex; align-items: center; justify-content: center;
            padding: 16px; overflow-y: auto;
            background: var(--bg-dark, #08090f);
            background-image:
                radial-gradient(circle at 15% 20%, rgba(99, 102, 241, 0.12) 0%, transparent 45%),
                radial-gradient(circle at 85% 80%, rgba(16, 185, 129, 0.10) 0%, transparent 45%);
            color: var(--text-primary, #e8eaf0);
            font-family: var(--font-sans, 'Outfit', system-ui, sans-serif);
        }
        .gate-card {
            width: 100%; max-width: 420px; margin: auto;
            padding: 28px 22px; border-radius: 20px; text-align: center;
            background: var(--bg-panel, rgba(17, 19, 31, 0.65));
            border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
            box-shadow: var(--shadow-premium, 0 12px 40px rgba(0, 0, 0, 0.5));
        }
        .gate-brand { font-size: 26px; font-weight: 800; margin: 0 0 6px; }
        .gate-tagline { font-size: 14px; color: var(--text-secondary, #9ca3af); margin: 0 0 22px; }
        .gate-title { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
        .gate-title:focus { outline: none; }
        .gate-text { font-size: 14px; line-height: 1.5; color: var(--text-secondary, #9ca3af); margin: 0 0 16px; }
        .gate-spinner {
            width: 36px; height: 36px; margin: 8px auto 14px; border-radius: 50%;
            border: 3px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
            border-top-color: var(--neon-green, #10b981);
            animation: gate-spin 0.8s linear infinite;
        }
        @keyframes gate-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .gate-spinner { animation-duration: 2.4s; } }
        .gate-label { display: block; text-align: left; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
        .gate-input {
            width: 100%; box-sizing: border-box; padding: 14px; border-radius: 12px;
            border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
            background: var(--bg-raised, rgba(30, 33, 50, 0.85)); color: inherit;
            font: inherit; font-size: 16px; font-weight: 600; text-align: center;
        }
        .gate-input:focus-visible, .gate-btn:focus-visible, .gate-plan:focus-visible, .gate-link:focus-visible {
            outline: 3px solid var(--neon-blue, #3b82f6); outline-offset: 2px;
        }
        .gate-error { color: var(--neon-red, #ef4444); font-size: 13px; font-weight: 600; margin: 8px 0 0; min-height: 1em; }
        .gate-btn {
            display: block; width: 100%; box-sizing: border-box; margin-top: 14px;
            padding: 14px; border: 0; border-radius: 12px; cursor: pointer;
            font: inherit; font-size: 15px; font-weight: 700;
            background: var(--neon-green, #10b981); color: #fff;
        }
        .gate-btn[disabled] { opacity: 0.6; cursor: wait; }
        .gate-btn.secondary {
            background: transparent; color: var(--text-primary, #e8eaf0);
            border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
        }
        .gate-plans { display: grid; gap: 10px; margin: 4px 0 6px; }
        .gate-plan {
            display: flex; align-items: center; justify-content: space-between; gap: 12px;
            padding: 14px 16px; border-radius: 14px; text-decoration: none; text-align: left;
            color: inherit; background: var(--bg-raised, rgba(30, 33, 50, 0.85));
            border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
        }
        .gate-plan-name { font-weight: 700; font-size: 15px; }
        .gate-plan-how { font-size: 13px; color: var(--text-secondary, #9ca3af); margin-top: 2px; }
        .gate-plan-price { font-weight: 800; font-size: 17px; color: var(--neon-green, #10b981); white-space: nowrap; }
        .gate-link {
            background: none; border: 0; padding: 6px; margin-top: 12px; cursor: pointer;
            font: inherit; font-size: 13px; color: var(--text-secondary, #9ca3af); text-decoration: underline;
        }
        .gate-fine { font-size: 12px; color: var(--text-muted, #6b7280); margin: 14px 0 0; }
    `;
    document.head.appendChild(style);

    let gate, view;

    function setView(html, focusSelector) {
        view.innerHTML = html;
        const target = view.querySelector(focusSelector || '[data-autofocus]') || view.querySelector('h2');
        if (target) target.focus();
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function showChecking(message) {
        setView(`
            <div class="gate-spinner" aria-hidden="true"></div>
            <h2 class="gate-title" tabindex="-1">${escapeHtml(message)}</h2>
            <p class="gate-text">This only takes a moment.</p>
        `);
    }

    function showPhoneForm(errorMessage, prefill) {
        setView(`
            <h2 class="gate-title" tabindex="-1">Sign in with your phone number</h2>
            <p class="gate-text">We couldn't detect your number automatically. Enter the number you subscribed with to continue.</p>
            <form id="gatePhoneForm" novalidate>
                <label class="gate-label" for="gatePhone">Phone number</label>
                <input class="gate-input" id="gatePhone" name="phone" type="tel" inputmode="tel" autocomplete="tel"
                    placeholder="0803 123 4567" maxlength="16" required aria-describedby="gatePhoneError"
                    value="${escapeHtml(prefill || '')}" data-autofocus>
                <p class="gate-error" id="gatePhoneError" role="alert">${escapeHtml(errorMessage || '')}</p>
                <button class="gate-btn" type="submit">Continue</button>
            </form>
        `, errorMessage ? '#gatePhone' : null);

        view.querySelector('#gatePhoneForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const raw = view.querySelector('#gatePhone').value;
            const msisdn = normalizePhone(raw);
            if (!msisdn) {
                showPhoneForm('Enter a valid Nigerian mobile number, e.g. 08031234567.', raw);
                return;
            }
            checkPhone(msisdn);
        });
    }

    function showSubscribe(msisdn) {
        const plans = CONFIG.plans.map(plan => `
            <a class="gate-plan" href="sms:${CONFIG.shortCode}?&body=${encodeURIComponent(plan.keyword)}">
                <span>
                    <span class="gate-plan-name">${escapeHtml(plan.name)}</span>
                    <span class="gate-plan-how" style="display:block">Text <strong>${escapeHtml(plan.keyword)}</strong> to <strong>${CONFIG.shortCode}</strong></span>
                </span>
                <span class="gate-plan-price">₦${plan.price}<span class="gate-plan-how"> / ${escapeHtml(plan.period)}</span></span>
            </a>
        `).join('');

        setView(`
            <h2 class="gate-title" tabindex="-1">Subscribe to play</h2>
            <p class="gate-text">${msisdn ? `The number <strong>${maskPhone(msisdn)}</strong> doesn't have an active subscription yet.` : `Your number doesn't have an active subscription yet.`}
                Pick a plan below; tap it to open your SMS app with the keyword ready to send.</p>
            <div class="gate-plans">${plans}</div>
            <button class="gate-btn" type="button" id="gateRecheck">I've subscribed, check again</button>
            ${msisdn ? `<button class="gate-link" type="button" id="gateOtherNumber">Use a different number</button>` : ''}
            ${CONFIG.unsubscribeHint ? `<p class="gate-fine">${escapeHtml(CONFIG.unsubscribeHint)}</p>` : ''}
            <p class="gate-fine">Charges apply to your airtime. Subscriptions renew automatically.</p>
        `);

        view.querySelector('#gateRecheck').addEventListener('click', () => {
            if (msisdn) checkPhone(msisdn); else checkHeader();
        });
        const other = view.querySelector('#gateOtherNumber');
        if (other) {
            other.addEventListener('click', () => {
                storageRemove(localStorage, PHONE_KEY);
                showPhoneForm();
            });
        }
    }

    function showError(retry) {
        setView(`
            <h2 class="gate-title" tabindex="-1">We couldn't confirm your subscription</h2>
            <p class="gate-text">The check didn't go through, usually a network hiccup. Please try again.</p>
            <button class="gate-btn" type="button" id="gateRetry">Try again</button>
            <button class="gate-link" type="button" id="gatePhoneFallback">Sign in with phone number instead</button>
        `);
        view.querySelector('#gateRetry').addEventListener('click', retry);
        view.querySelector('#gatePhoneFallback').addEventListener('click', () => showPhoneForm());
    }

    async function requestStatus(url) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
            const data = await res.json().catch(() => ({}));
            if (res.status === 400 && data.code === 'NO_MSISDN') return 'no_msisdn';
            if (!res.ok) return 'error';
            return data.status === 'subscribed' ? 'subscribed' : 'not_subscribed';
        } catch (e) {
            return 'error';
        } finally {
            clearTimeout(timer);
        }
    }

    function grantAccess() {
        storageSet(sessionStorage, ACCESS_KEY, JSON.stringify({ until: Date.now() + ACCESS_TTL_MS }));
        window.accessGranted = true;
        gate.remove();
        document.documentElement.classList.remove('gate-locked');
        window.dispatchEvent(new CustomEvent('accessgranted'));
    }

    async function checkHeader() {
        showChecking('Checking your subscription…');
        const result = await requestStatus('/api/check-status');

        if (result === 'subscribed') return grantAccess();
        if (result === 'not_subscribed') return showSubscribe(null);
        if (result === 'error') return showError(checkHeader);

        // No carrier header: fall back to a remembered number, else ask for one.
        const saved = storageGet(localStorage, PHONE_KEY);
        if (saved && normalizePhone(saved)) return checkPhone(saved);
        showPhoneForm();
    }

    async function checkPhone(msisdn) {
        showChecking(`Checking ${maskPhone(msisdn)}…`);
        const result = await requestStatus('/api/check-phone/' + encodeURIComponent(msisdn));

        if (result === 'error') return showError(() => checkPhone(msisdn));

        storageSet(localStorage, PHONE_KEY, msisdn);
        if (result === 'subscribed') return grantAccess();
        showSubscribe(msisdn);
    }

    function mount() {
        gate = document.createElement('div');
        gate.id = 'accessGate';
        gate.setAttribute('role', 'dialog');
        gate.setAttribute('aria-modal', 'true');
        gate.setAttribute('aria-labelledby', 'gateBrand');
        gate.innerHTML = `
            <div class="gate-card">
                <h1 class="gate-brand" id="gateBrand">${escapeHtml(CONFIG.serviceName)}</h1>
                <p class="gate-tagline">${escapeHtml(CONFIG.tagline)}</p>
                <div aria-live="polite"></div>
            </div>
        `;
        view = gate.querySelector('[aria-live]');
        document.body.appendChild(gate);
        checkHeader();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();
