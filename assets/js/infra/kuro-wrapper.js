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
let _failed = false;

export async function ensureKuro() {
    if (_kuro) return _kuro;
    if (_failed) throw new Error("Kuroshiro initialization failed previously");
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        try {
            // Match the working single-file version exactly
            if (!window.Kuroshiro || !window.Kuroshiro.Analyzer || !window.Kuroshiro.Analyzer.KuromojiAnalyzer) {
                throw new Error('Kuroshiro or KuromojiAnalyzer not loaded');
            }

            const k = new window.Kuroshiro();
            const Analyzer = window.Kuroshiro.Analyzer.KuromojiAnalyzer;
            await k.init(new Analyzer({ dictPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict' }));

            _kuro = k;
            return k;
        } catch (e) {
            _failed = true;
            console.error("Kuroshiro init failed:", e);
            throw e;
        } finally {
            _initPromise = null;
        }
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
