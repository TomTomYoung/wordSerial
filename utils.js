/* ====== 共通ユーティリティ ====== */
export const nowISO = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
export const uniq = a => Array.from(new Set(a));
export const normNFKC = s => (s || "").normalize('NFKC').trim();
export const el = q => document.querySelector(q);
export const parseIntSafe = (value, fallback = 0) => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
};

export function getBatchSize() {
    return Math.max(1, parseIntSafe(el('#batchSize')?.value, 200));
}

export function waitFrame() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

export function log(msg) {
    const verbose = el('#ckVerboseLog')?.checked;
    const stamped = `[${nowISO()}] ${msg}`;
    // Only append to DOM and Console if verbose logging is enabled
    if (!verbose) return;

    console.log(stamped);

    const host = el('#log');
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
let kuroInitPromise = null;
let kuroFailed = false; // Prevent retry loop if init fails
const kuroFetchLog = [];
const kuroInitTrace = [];
const MAX_KURO_CONVERT_LOGS = 100;
const KURO_CONVERT_LOG_AGG_INTERVAL = 20;
let kuroConvertLogCount = 0;
const kuroConvertStepCounts = new Map();

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
    const current = (kuroConvertStepCounts.get(step) || 0) + 1;
    kuroConvertStepCounts.set(step, current);
    if (current === 1 || current % KURO_CONVERT_LOG_AGG_INTERVAL === 0) {
        const suffix = current === 1 ? '' : ` (x${current})`;
        recordKuroInit(`${step}${suffix}`);
    }
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
    if (!url || typeof url !== 'string') return url;
    const addMissingSlash = url.replace(/((?:https?:)?\/\/cdn\.jsdelivr\.net\/npm\/kuromoji@0\.1\.2\/dict)(?=[^\/])/g, '$1/');
    if (addMissingSlash.startsWith('https://cdn.jsdelivr.net/')) {
        const fixed = addMissingSlash;
        recordKuroFetch(url, fixed);
        return fixed;
    }
    if (addMissingSlash.startsWith('http://cdn.jsdelivr.net/')) {
        const fixed = addMissingSlash.replace('http:', 'https:');
        recordKuroFetch(url, fixed);
        return fixed;
    }
    if (addMissingSlash.startsWith('https:/cdn.jsdelivr.net/')) {
        const fixed = addMissingSlash.replace('https:/cdn.jsdelivr.net/', 'https://cdn.jsdelivr.net/');
        recordKuroFetch(url, fixed);
        return fixed;
    }
    // path.join() inside kuromoji drops one of the slashes (https:/...), which then
    // becomes a host-relative path on GitHub Pages and 404s. Fix a few known patterns.
    // The previous regex handles the most common case. This is a fallback for other patterns.
    const finalFixed = addMissingSlash.replace(/^(https?:)\/([^/])/, '$1//$2');
    if (finalFixed !== url) {
        recordKuroFetch(url, finalFixed);
        return finalFixed;
    }
    recordKuroFetch(url, url); // Record even if no change
    return url;
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
        window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            const fixed = normalizeCdnUrl(url);
            if (fixed !== url) console.debug('Rewriting kuromoji XHR URL:', url, '->', fixed);
            return originalOpen.call(this, method, fixed, ...rest);
        };
        recordKuroInit('patchKuroFetch: hooked XMLHttpRequest.open');
    }
}

export async function ensureKuro() {
    if (kuroReady) return;
    if (kuroFailed) throw new Error("Kuroshiro initialization failed previously"); // Fail fast
    if (kuroInitPromise) return kuroInitPromise;

    kuroInitPromise = (async () => {
        try {
            recordKuroInit('ensureKuro: start');
            patchKuroFetch();
            if (typeof window.require === 'function') {
                const pathModule = window.require('path');
                if (pathModule && pathModule.join) {
                    const originalJoin = pathModule.join;
                    pathModule.join = function (...args) {
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

            if (!window.Kuroshiro) await new Promise(r => setTimeout(r, 500));

            let KuroshiroConstructor = window.Kuroshiro;
            if (typeof KuroshiroConstructor !== 'function' && KuroshiroConstructor?.default) {
                KuroshiroConstructor = KuroshiroConstructor.default;
            }

            if (typeof KuroshiroConstructor !== 'function') throw new Error("window.Kuroshiro is not a constructor");
            recordKuroInit('ensureKuro: Kuroshiro constructor detected');

            let Analyzer = window.KuromojiAnalyzer || window.Kuroshiro.Analyzer?.KuromojiAnalyzer;
            if (!Analyzer) throw new Error("KuromojiAnalyzer not found");
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
            kuroFailed = true;
            recordKuroInit(`ensureKuro: init failed (${e?.message || e})`);
            console.warn("Kuroshiro init failed:", e);
            log(`Kuroshiro init failed: ${e?.message || e}`); // Show error to user
            throw e; // Propagate error!
        } finally {
            kuroInitPromise = null;
        }
    })();
    return kuroInitPromise;
}

// NOTE: fallback helpers removed/unused as requested

export async function toHiragana(s) {
    if (!s) return '';
    recordKuroConvert('toHiragana: start');
    await ensureKuro(); // Throws if failed
    if (!K) throw new Error("Kuroshiro not initialized");
    return await K.convert(normNFKC(s), { to: 'hiragana', mode: 'spaced' });
}

export async function toKatakana(s) {
    if (!s) return '';
    recordKuroConvert('toKatakana: start');
    await ensureKuro(); // Throws if failed
    if (!K) throw new Error("Kuroshiro not initialized");
    return await K.convert(normNFKC(s), { to: 'katakana', mode: 'spaced' });
}

export async function toRomaji(s) {
    if (!s) return '';
    recordKuroConvert('toRomaji: start');
    await ensureKuro(); // Throws if failed
    if (!K) throw new Error("Kuroshiro not initialized");
    return await K.convert(normNFKC(s), { to: 'romaji', mode: 'spaced' });
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
