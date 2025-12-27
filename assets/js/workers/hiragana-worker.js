/*
 * Kana normalization worker
 * Offloads heavy Kuroshiro conversions to a dedicated thread so the main UI
 * remains responsive even when handling 100k+ items.
 */

// Load dependencies in the worker scope
importScripts(
    'https://cdn.jsdelivr.net/npm/wanakana@5.0.2/dist/wanakana.min.js',
    'https://cdn.jsdelivr.net/npm/kuroshiro@1.2.0/dist/kuroshiro.min.js',
    'https://cdn.jsdelivr.net/npm/kuroshiro-analyzer-kuromoji@1.1.0/dist/kuroshiro-analyzer-kuromoji.min.js'
);

const KUROMOJI_DICT = 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/';
let kuroInstance = null;
let kuroInitPromise = null;

function normNFKC(value) {
    return (value || '').normalize('NFKC').trim();
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

function fallbackConvert(value, target) {
    const wk = self.wanakana;
    if (!wk) {
        if (target === 'hiragana') return katakanaToHiragana(value);
        return value;
    }
    if (target === 'hiragana' && typeof wk.toHiragana === 'function') {
        return wk.toHiragana(value);
    }
    if (target === 'katakana' && typeof wk.toKatakana === 'function') {
        return wk.toKatakana(value);
    }
    return value;
}

function shouldUseKuroshiro(value) {
    try {
        // Prefer Kuroshiro only when the string contains Han characters.
        return /[\p{Script=Han}]/u.test(value);
    } catch (_) {
        // In environments without Unicode property escapes support, always use Kuroshiro.
        return true;
    }
}

async function ensureKuro() {
    if (kuroInstance) return kuroInstance;
    if (kuroInitPromise) return kuroInitPromise;

    kuroInitPromise = (async () => {
        let KuroshiroConstructor = self.Kuroshiro?.default || self.Kuroshiro;
        if (typeof KuroshiroConstructor !== 'function') {
            throw new Error('Kuroshiro constructor not found');
        }

        const Analyzer = self.KuromojiAnalyzer || self.Kuroshiro?.Analyzer?.KuromojiAnalyzer;
        if (!Analyzer) throw new Error('KuromojiAnalyzer not found');

        const k = new KuroshiroConstructor();
        await k.init(new Analyzer({ dictPath: KUROMOJI_DICT }));
        kuroInstance = k;
        return k;
    })();

    return kuroInitPromise;
}

async function convert(value, target) {
    const base = normNFKC(value);
    if (!base) return '';

    // Use light-weight path when possible
    if (!shouldUseKuroshiro(base)) {
        return fallbackConvert(base, target);
    }

    try {
        const k = await ensureKuro();
        return await k.convert(base, { to: target, mode: 'spaced' });
    } catch (err) {
        // Fall back to wanakana if Kuroshiro fails mid-stream
        console.warn('[hiragana-worker] Kuroshiro convert failed, fallback to wanakana', err);
        return fallbackConvert(base, target);
    }
}

self.onmessage = async (event) => {
    const { id, items, target = 'hiragana', chunkSize = 2000 } = event.data || {};
    if (!id || !items) return;

    try {
        const buffer = [];
        let processed = 0;
        for (const raw of items) {
            const converted = await convert(raw, target);
            if (converted) buffer.push(converted.replace(/\s+/g, ''));
            processed += 1;

            if (buffer.length >= chunkSize) {
                self.postMessage({ id, type: 'chunk', chunk: buffer.slice(), processed });
                buffer.length = 0;
            }
        }

        if (buffer.length) {
            self.postMessage({ id, type: 'chunk', chunk: buffer.slice(), processed });
        }

        self.postMessage({ id, type: 'done', processed });
    } catch (err) {
        self.postMessage({ id, type: 'error', message: err?.message || String(err) });
    }
};
