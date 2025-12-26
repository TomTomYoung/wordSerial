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

let K = null, kuroReady = false;
let kuroFetchPatched = false;
let kuroInitPromise = null;
let kuroFailed = false;

// Dependencies needed from utils (or duplicated if we want pure isolation).
// For now, minimal duplication for isolation.
const normNFKC = s => (s || "").normalize('NFKC').trim();

/* ====== Debug / Tracing ====== */
function log(msg) {
    // Only console log for library
    console.log(`[kuro.js] ${msg}`);
}

/* ====== Network Patching ====== */
function normalizeCdnUrl(url) {
    if (!url || typeof url !== 'string') return url;
    const addMissingSlash = url.replace(/((?:https?:)?\/\/cdn\.jsdelivr\.net\/npm\/kuromoji@0\.1\.2\/dict)(?=[^\/])/g, '$1/');
    if (addMissingSlash.startsWith('https://cdn.jsdelivr.net/')) {
        return addMissingSlash;
    }
    const finalFixed = addMissingSlash.replace(/^(https?:)\/([^/])/, '$1//$2');
    return finalFixed;
}

function patchKuroFetch() {
    if (kuroFetchPatched) return;
    kuroFetchPatched = true;

    if (typeof window.fetch === 'function') {
        const originalFetch = window.fetch;
        window.fetch = (...args) => {
            if (typeof args[0] === 'string') {
                args[0] = normalizeCdnUrl(args[0]);
            }
            return originalFetch.apply(window, args);
        };
    }

    if (typeof window.XMLHttpRequest === 'function' && window.XMLHttpRequest.prototype?.open) {
        const originalOpen = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            const fixed = normalizeCdnUrl(url);
            return originalOpen.call(this, method, fixed, ...rest);
        };
    }
}

/* ====== Initialization ====== */
export async function ensureKuro() {
    if (kuroReady) return;
    if (kuroFailed) throw new Error("Kuroshiro initialization failed previously");
    if (kuroInitPromise) return kuroInitPromise;

    kuroInitPromise = (async () => {
        try {
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
        } catch (e) {
            kuroFailed = true;
            console.warn("Kuroshiro init failed:", e);
            throw e;
        } finally {
            kuroInitPromise = null;
        }
    })();
    return kuroInitPromise;
}

/* ====== Raw Access ====== */
export function getK() { return K; }
export function isReady() { return kuroReady; }

/* ====== Conversion Wrappers ====== */
export async function toHiragana(s) {
    if (!s) return '';
    await ensureKuro();
    return await K.convert(normNFKC(s), { to: 'hiragana', mode: 'spaced' });
}

export async function toKatakana(s) {
    if (!s) return '';
    await ensureKuro();
    return await K.convert(normNFKC(s), { to: 'katakana', mode: 'spaced' });
}

export async function toRomaji(s) {
    if (!s) return '';
    await ensureKuro();
    return await K.convert(normNFKC(s), { to: 'romaji', mode: 'spaced' });
}

