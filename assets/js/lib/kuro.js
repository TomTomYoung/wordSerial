/**
 * kuro.js
 *
 * Wrapper for Kuroshiro / Kuromoji (Japanese text analysis).
 * Handles lazy loading, CDN path patching, and basic conversion.
 *
 * INPUT:
 *   - Text string (in wrapper functions)
 *
 * OUTPUT:
 *   - Converted string (Hiragana, Katakana, Romaji)
 */

const kuroFetchLog = [];
const kuroInitTrace = [];
const MAX_KURO_CONVERT_LOGS = 100;
const KURO_CONVERT_LOG_AGG_INTERVAL = 20;
let kuroConvertLogCount = 0;
const kuroConvertStepCounts = new Map();
let K = null, kuroReady = false;
let kuroFetchPatched = false;
let kuroInitPromise = null;
let kuroFailed = false;

// Dependencies needed from utils (or duplicated if we want pure isolation).
// For now, minimal duplication for isolation.
const nowISO = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const normNFKC = s => (s || "").normalize('NFKC').trim();

/* ====== Debug / Tracing ====== */
function log(msg) {
    // Only console log for library
    console.log(`[kuro.js] ${msg}`);
}

function recordKuroInit(step) {
    const entry = { at: nowISO(), step };
    kuroInitTrace.push(entry);
    if (kuroInitTrace.length > 100) kuroInitTrace.shift();
    log(`[init] ${step}`);
    if (typeof window !== 'undefined') window.__kuroInitTrace = kuroInitTrace.slice();
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
    if (typeof window !== 'undefined') window.__kuromojiFetchLog = kuroFetchLog;
}

/* ====== Network Patching ====== */
function normalizeCdnUrl(url) {
    if (!url || typeof url !== 'string') return url;
    const addMissingSlash = url.replace(/((?:https?:)?\/\/cdn\.jsdelivr\.net\/npm\/kuromoji@0\.1\.2\/dict)(?=[^\/])/g, '$1/');
    if (addMissingSlash.startsWith('https://cdn.jsdelivr.net/')) {
        const fixed = addMissingSlash;
        recordKuroFetch(url, fixed);
        return fixed;
    }
    const finalFixed = addMissingSlash.replace(/^(https?:)\/([^/])/, '$1//$2');
    if (finalFixed !== url) {
        recordKuroFetch(url, finalFixed);
        return finalFixed;
    }
    recordKuroFetch(url, url);
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
                args[0] = normalizeCdnUrl(args[0]);
            }
            return originalFetch.apply(window, args);
        };
        recordKuroInit('patchKuroFetch: hooked window.fetch');
    }

    if (typeof window.XMLHttpRequest === 'function' && window.XMLHttpRequest.prototype?.open) {
        const originalOpen = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            const fixed = normalizeCdnUrl(url);
            return originalOpen.call(this, method, fixed, ...rest);
        };
        recordKuroInit('patchKuroFetch: hooked XMLHttpRequest.open');
    }
}

/* ====== Initialization ====== */
export async function ensureKuro() {
    if (kuroReady) return;
    if (kuroFailed) throw new Error("Kuroshiro initialization failed previously");
    if (kuroInitPromise) return kuroInitPromise;

    kuroInitPromise = (async () => {
        try {
            recordKuroInit('ensureKuro: start');
            patchKuroFetch();

            // Wait for script global if needed
            if (!window.Kuroshiro) await new Promise(r => setTimeout(r, 500));

            let KuroshiroConstructor = window.Kuroshiro;
            if (typeof KuroshiroConstructor !== 'function' && KuroshiroConstructor?.default) {
                KuroshiroConstructor = KuroshiroConstructor.default;
            }
            if (typeof KuroshiroConstructor !== 'function') throw new Error("window.Kuroshiro is not a constructor");

            let Analyzer = window.KuromojiAnalyzer || window.Kuroshiro.Analyzer?.KuromojiAnalyzer;
            if (!Analyzer) throw new Error("KuromojiAnalyzer not found");

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
        } catch (e) {
            kuroFailed = true;
            recordKuroInit(`ensureKuro: init failed (${e?.message || e})`);
            console.warn("Kuroshiro init failed:", e);
            throw e;
        } finally {
            kuroInitPromise = null;
        }
    })();
    return kuroInitPromise;
}

/* ====== Conversion Wrappers ====== */
export async function toHiragana(s) {
    if (!s) return '';
    recordKuroConvert('toHiragana: start');
    await ensureKuro();
    if (!K) throw new Error("Kuroshiro not initialized");
    return await K.convert(normNFKC(s), { to: 'hiragana', mode: 'spaced' });
}

export async function toKatakana(s) {
    if (!s) return '';
    recordKuroConvert('toKatakana: start');
    await ensureKuro();
    if (!K) throw new Error("Kuroshiro not initialized");
    return await K.convert(normNFKC(s), { to: 'katakana', mode: 'spaced' });
}

export async function toRomaji(s) {
    if (!s) return '';
    recordKuroConvert('toRomaji: start');
    await ensureKuro();
    if (!K) throw new Error("Kuroshiro not initialized");
    return await K.convert(normNFKC(s), { to: 'romaji', mode: 'spaced' });
}
