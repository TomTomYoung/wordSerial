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
    if (!host) {
        console.log(msg);
        return;
    }
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = `[${nowISO()}] ${msg}`;
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
const KUROMOJI_DICT_URL = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/";

function resolveKuromojiDictUrl() {
    // KUROMOJI_DICT_URL is already an absolute URL with trailing slash,
    // so return it directly to prevent relative path resolution on GitHub Pages
    return KUROMOJI_DICT_URL;
}

export async function ensureKuro() {
    if (kuroReady) return;
    try {
        // Retry logic might be needed if scripts are loading asynchronously
        if (!window.Kuroshiro) {
            console.warn("Kuroshiro not found in window, checking again in 500ms...");
            await new Promise(r => setTimeout(r, 500));
        }

        let KuroshiroConstructor = window.Kuroshiro;
        // Handle case where it might be loaded as an ESM module with default export
        if (typeof KuroshiroConstructor !== 'function' && KuroshiroConstructor?.default) {
            KuroshiroConstructor = KuroshiroConstructor.default;
        }

        if (typeof KuroshiroConstructor !== 'function') {
            throw new Error("window.Kuroshiro is not a constructor. Type: " + typeof window.Kuroshiro);
        }

        // Check Analyzer
        let Analyzer = window.Kuroshiro.Analyzer?.KuromojiAnalyzer;
        // Use global fallback if the structure is different
        if (!Analyzer && window.KuromojiAnalyzer) Analyzer = window.KuromojiAnalyzer;

        // If still not found, check if it's nested in default
        if (!Analyzer && window.Kuroshiro.default?.Analyzer?.KuromojiAnalyzer) {
            Analyzer = window.Kuroshiro.default.Analyzer.KuromojiAnalyzer;
        }

        if (!Analyzer) {
            throw new Error("KuromojiAnalyzer not found.");
        }

        K = new KuroshiroConstructor();
        const dictPath = resolveKuromojiDictUrl();
        await K.init(new Analyzer({ dictPath }));
        kuroReady = true;
        console.log("Kuroshiro initialized successfully.");
    } catch (e) {
        console.warn("Kuroshiro init failed, utilizing WanaKana fallback:", e);
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
    try {
        await ensureKuro();
        if (K) return await K.convert(normNFKC(s), { to: 'hiragana', mode: 'spaced' });
    } catch {
        // Fallback
    }
    return safeWanakanaConvert('toHiragana', normNFKC(s));
}

export async function toKatakana(s) {
    if (!s) return '';
    try {
        await ensureKuro();
        if (K) return await K.convert(normNFKC(s), { to: 'katakana', mode: 'spaced' });
    } catch {
        // Fallback
    }
    return safeWanakanaConvert('toKatakana', normNFKC(s));
}

export async function toRomaji(s) {
    if (!s) return '';
    try {
        await ensureKuro();
        if (K) return await K.convert(normNFKC(s), { to: 'romaji', mode: 'spaced' });
    } catch {
        // Fallback
    }
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
