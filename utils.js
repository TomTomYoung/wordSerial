/* ====== 共通ユーティリティ ====== */
export const nowISO = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
export const uniq = a => Array.from(new Set(a));
export const normNFKC = s => (s || "").normalize('NFKC').trim();
export const el = q => document.querySelector(q);
export const parseIntSafe = (value, fallback = 0) => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
};

export function waitFrame() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

export function log(msg) {
    const host = el('#log');
    const stamped = `[${nowISO()}] ${msg}`;
    console.log(stamped);
    if (!host) return;
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = stamped;
    host.prepend(div);
    while (host.children.length > 150) host.removeChild(host.lastChild);
}

export function appendOpLog(msg) {
    const host = el('#opLog');
    if (!host) return;
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = `[${nowISO()}] ${msg}`;
    host.prepend(div);
    while (host.children.length > 150) host.removeChild(host.lastChild);
}

/* Levenshtein Distance */
export function levenshtein(s, t) {
    if (!s) return t.length;
    if (!t) return s.length;
    const d = [];
    const n = s.length;
    const m = t.length;
    for (let i = 0; i <= n; i++) d[i] = [i];
    for (let j = 0; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        }
    }
    return d[n][m];
}

export function setsAreEqual(a, b) {
    if (a === b) return true;
    if (!(a instanceof Set) || !(b instanceof Set)) return false;
    if (a.size !== b.size) return false;
    for (const value of a) {
        if (!b.has(value)) return false;
    }
    return true;
}

/* Random Seeds */
export function makeSeedFromString(seed) {
    if (typeof seed === 'number') return seed >>> 0;
    let h = 1779033703 ^ (seed?.length || 0);
    for (let i = 0; i < (seed?.length || 0); i += 1) {
        h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return (Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0;
}

export function mulberry32(a) {
    return function () {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ====== Kuroshiro（かな正規化） ====== */
let K = null, kuroReady = false;
let kuroFetchPatched = false;
const kuroFetchLog = [];
const kuroInitTrace = [];
const MAX_KURO_CONVERT_LOGS = 100;
let kuroConvertLogCount = 0;

function recordKuroInit(step) {
    const entry = { at: nowISO(), step };
    kuroInitTrace.push(entry);
    if (kuroInitTrace.length > 100) kuroInitTrace.shift();
    log(`[kuro-init] ${step}`);
    if (typeof window !== 'undefined') {
        window.__kuroInitTrace = kuroInitTrace.slice();
    }
}

function recordKuroConvert(step) {
    if (kuroConvertLogCount >= MAX_KURO_CONVERT_LOGS) return;
    kuroConvertLogCount += 1;
    recordKuroInit(step);
}

function recordKuroFetch(original, fixed) {
    const entry = { at: nowISO(), original, fixed, same: original === fixed };
    kuroFetchLog.push(entry);
    if (kuroFetchLog.length > 50) kuroFetchLog.shift();

    if (fixed !== original) {
        log(`kuromoji URL rewrite: ${original} -> ${fixed}`);
    } else if (typeof window?.location?.host === 'string' && original?.includes(window.location.host)) {
        log(`kuromoji URL stayed on host (${window.location.host}): ${original}`);
    }

    // Expose for manual inspection in DevTools
    if (typeof window !== 'undefined') {
        window.__kuromojiFetchLog = kuroFetchLog;
    }
}

function normalizeCdnUrl(url) {
    if (typeof url !== 'string') return url;

    // path.join() inside kuromoji drops one of the slashes (https:/...), which then
    // becomes a host-relative path on GitHub Pages and 404s. Fix a few known patterns.
    const addMissingSlash = url.replace(/^(https?:)\/([^/])/, '$1//$2');
    if (addMissingSlash.startsWith('/cdn.jsdelivr.net/')) {
        const fixed = `https://cdn.jsdelivr.net${addMissingSlash}`;
        recordKuroFetch(url, fixed);
        return fixed;
    }
    if (addMissingSlash.startsWith('https:/cdn.jsdelivr.net/')) {
        const fixed = addMissingSlash.replace('https:/cdn.jsdelivr.net/', 'https://cdn.jsdelivr.net/');
        recordKuroFetch(url, fixed);
        return fixed;
    }
    if (addMissingSlash.startsWith('http:/cdn.jsdelivr.net/')) {
        const fixed = addMissingSlash.replace('http:/cdn.jsdelivr.net/', 'https://cdn.jsdelivr.net/');
        recordKuroFetch(url, fixed);
        return fixed;
    }
    recordKuroFetch(url, addMissingSlash);
    return addMissingSlash;
}

function patchKuroFetch() {
    if (kuroFetchPatched) return;
    kuroFetchPatched = true;
    recordKuroInit('patchKuroFetch: start');

    if (typeof window.fetch === 'function') {
        const originalFetch = window.fetch;
        window.fetch = (...args) => {
            if (typeof args[0] === 'string') {
                const fixed = normalizeCdnUrl(args[0]);
                if (fixed !== args[0]) console.debug('Rewriting kuromoji fetch URL:', args[0], '->', fixed);
                args[0] = fixed;
            }
            return originalFetch.apply(window, args);
        };
        recordKuroInit('patchKuroFetch: hooked window.fetch');
    }

    if (typeof window.XMLHttpRequest === 'function' && window.XMLHttpRequest.prototype?.open) {
        const originalOpen = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            const fixed = normalizeCdnUrl(url);
            if (fixed !== url) console.debug('Rewriting kuromoji XHR URL:', url, '->', fixed);
            return originalOpen.call(this, method, fixed, ...rest);
        };
        recordKuroInit('patchKuroFetch: hooked XMLHttpRequest.open');
    }
}

export async function ensureKuro() {
    if (kuroReady) {
        recordKuroInit('ensureKuro: already ready, skipping');
        return;
    }
    try {
        recordKuroInit('ensureKuro: start');
        patchKuroFetch();
        // Fix path.join() for URLs before kuromoji loads
        // kuromoji uses require('path').join() which breaks URLs in browser
        if (typeof window.require === 'function') {
            const pathModule = window.require('path');
            if (pathModule && pathModule.join) {
                const originalJoin = pathModule.join;
                pathModule.join = function(...args) {
                    // If first arg is a URL, use simple concatenation
                    if (args[0] && /^https?:\/\//.test(args[0])) {
                        let result = args[0];
                        for (let i = 1; i < args.length; i++) {
                            if (!result.endsWith('/')) result += '/';
                            result += args[i].replace(/^\/+/, '');
                        }
                        return result;
                    }
                    return originalJoin.apply(this, args);
                };
                recordKuroInit('ensureKuro: patched path.join for URL handling');
            }
        }

        if (!window.Kuroshiro) {
            await new Promise(r => setTimeout(r, 500));
        }

        let KuroshiroConstructor = window.Kuroshiro;
        if (typeof KuroshiroConstructor !== 'function' && KuroshiroConstructor?.default) {
            KuroshiroConstructor = KuroshiroConstructor.default;
        }

        if (typeof KuroshiroConstructor !== 'function') {
            throw new Error("window.Kuroshiro is not a constructor");
        }
        recordKuroInit('ensureKuro: Kuroshiro constructor detected');

        let Analyzer = window.KuromojiAnalyzer || window.Kuroshiro.Analyzer?.KuromojiAnalyzer;
        if (!Analyzer) {
            throw new Error("KuromojiAnalyzer not found");
        }
        recordKuroInit('ensureKuro: KuromojiAnalyzer detected, starting init');

        K = new KuroshiroConstructor();
        const analyzer = new Analyzer({
            dictPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/'
        });

        const initPromise = K.init(analyzer);
        const timeoutMs = 8000;
        await Promise.race([
            initPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Kuromoji init timeout after ${timeoutMs}ms`)), timeoutMs))
        ]);
        kuroReady = true;
        recordKuroInit('ensureKuro: Kuroshiro initialized successfully');
        console.log("Kuroshiro initialized successfully");
    } catch (e) {
        recordKuroInit(`ensureKuro: init failed (${e?.message || e})`);
        console.warn("Kuroshiro init failed, using WanaKana fallback:", e);
        log(`Kuroshiro init failed or timed out: ${e?.message || e}`);
    }
}

function katakanaToHiragana(value) {
    if (!value) return '';
    return value.replace(/[\u30A1-\u30FA\u30FD\u30FE]/g, ch => {
        const code = ch.charCodeAt(0);
        if (code === 0x30FD) return 'ゝ'; // ヽ → ゝ
        if (code === 0x30FE) return 'ゞ'; // ヾ → ゞ
        return String.fromCharCode(code - 0x60);
    });
}

function normalizeKatakanaFallback(value) {
    if (!value) return '';
    return katakanaToHiragana(value);
}

function safeWanakanaConvert(method, value) {
    const wk = window.wanakana;
    if (wk && typeof wk[method] === 'function') {
        return wk[method](value);
    }
    if (method === 'toHiragana') {
        return normalizeKatakanaFallback(value);
    }
    return value;
}

export async function toHiragana(s) {
    if (!s) return '';
    recordKuroConvert('toHiragana: start');
    try {
        await ensureKuro();
        recordKuroConvert(`toHiragana: ensureKuro resolved (ready=${kuroReady})`);
        if (K) return await K.convert(normNFKC(s), { to: 'hiragana', mode: 'spaced' });
        recordKuroConvert('toHiragana: converted via Kuroshiro');
    } catch (e) {
        recordKuroConvert(`toHiragana: Kuroshiro failed (${e?.message || e})`);
        // Fallback
    }
    recordKuroConvert('toHiragana: fallback to WanaKana/normalize');
    return safeWanakanaConvert('toHiragana', normNFKC(s));
}

export async function toKatakana(s) {
    if (!s) return '';
    recordKuroConvert('toKatakana: start');
    try {
        await ensureKuro();
        recordKuroConvert(`toKatakana: ensureKuro resolved (ready=${kuroReady})`);
        if (K) return await K.convert(normNFKC(s), { to: 'katakana', mode: 'spaced' });
        recordKuroConvert('toKatakana: converted via Kuroshiro');
    } catch (e) {
        recordKuroConvert(`toKatakana: Kuroshiro failed (${e?.message || e})`);
        // Fallback
    }
    recordKuroConvert('toKatakana: fallback to WanaKana/normalize');
    return safeWanakanaConvert('toKatakana', normNFKC(s));
}

export async function toRomaji(s) {
    if (!s) return '';
    recordKuroConvert('toRomaji: start');
    try {
        await ensureKuro();
        recordKuroConvert(`toRomaji: ensureKuro resolved (ready=${kuroReady})`);
        if (K) return await K.convert(normNFKC(s), { to: 'romaji', mode: 'spaced' });
        recordKuroConvert('toRomaji: converted via Kuroshiro');
    } catch (e) {
        recordKuroConvert(`toRomaji: Kuroshiro failed (${e?.message || e})`);
        // Fallback
    }
    recordKuroConvert('toRomaji: fallback to WanaKana/normalize');
    return safeWanakanaConvert('toRomaji', normNFKC(s));
}

export function findBagStatusElement(bagId) {
    return document.querySelector(`.bag-card[data-id="${bagId}"] [data-k="status"]`);
}

export function setBagStatusMessage(bagId, message) {
    const statusEl = findBagStatusElement(bagId);
    if (statusEl) {
        const text = message || '';
        statusEl.textContent = text;
        statusEl.title = text;
    }
}

export function describeBagLifecycle(bag) {
    if (bag?.meta?.reapply_status) return bag.meta.reapply_status;
    if (bag?.meta?.reapplied_at) return `↻ ${bag.meta.reapplied_at}`;
    if (bag?.meta?.updated_at) return `✎ ${bag.meta.updated_at}`;
    if (bag?.meta?.created_at) return `＋ ${bag.meta.created_at}`;
    return '';
}

export function setSelectOptions(sel, opts) {
    if (!sel) return;
    const v = sel.value;
    sel.innerHTML = '';
    for (const o of opts) {
        const op = document.createElement('option');
        op.value = o.value;
        op.textContent = o.label;
        sel.appendChild(op);
    }
    if (opts.length) {
        sel.value = v && opts.some(o => o.value === v) ? v : opts[opts.length - 1].value;
    }
}
