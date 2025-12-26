/**
 * @fileoverview Wraps Kuroshiro/Kuromoji logic.
 * @summary Provides text conversion (Hiragana/Katakana/Romaji) via Kuroshiro.
 * @description
 * Initialises the Kuroshiro library with the Kuromoji analyzer.
 * Handles loading states and provides a simplified API for text conversion.
 * 
 * @module infra/kuro-wrapper
 * @requires kuroshiro (global)
 * @requires kuroshiro-analyzer-kuromoji (global)
 * @exports toHiragana, toKatakana, toRomaji, ensureKuro, getK
 */

let _kuro = null;
let _initPromise = null;

export async function ensureKuro() {
    if (_kuro) return _kuro;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        // Wait for script global if needed
        if (!window.Kuroshiro) await new Promise(r => setTimeout(r, 500));

        let KuroshiroConstructor = window.Kuroshiro;
        if (typeof KuroshiroConstructor !== 'function' && KuroshiroConstructor?.default) {
            KuroshiroConstructor = KuroshiroConstructor.default;
        }
        if (typeof KuroshiroConstructor !== 'function') throw new Error("window.Kuroshiro is not a constructor");

        let Analyzer = window.KuromojiAnalyzer || window.Kuroshiro.Analyzer?.KuromojiAnalyzer;
        if (!Analyzer) throw new Error("KuromojiAnalyzer not found");

        const k = new KuroshiroConstructor();
        await k.init(new Analyzer({ dictPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/" }));
        _kuro = k;
        return k;
    })();
    return _initPromise;
}

export function getK() {
    if (!_kuro) throw new Error("Kuroshiro not initialized. Call ensureKuro() first.");
    return _kuro;
}

export async function toHiragana(s) {
    if (!s) return "";
    await ensureKuro();
    return _kuro.convert(s, { to: 'hiragana', mode: 'spaced' });
}

export async function toKatakana(s) {
    if (!s) return "";
    await ensureKuro();
    return _kuro.convert(s, { to: 'katakana', mode: 'spaced' });
}

export async function toRomaji(s) {
    if (!s) return "";
    await ensureKuro();
    return _kuro.convert(s, { to: 'romaji', mode: 'spaced' });
}
