/**
 * @fileoverview Text manipulation and transformation functions.
 * @summary Provides normalization, case conversion, reversing, sorting, and replacements.
 * @description
 * Contains pure functions for manipulating string data. 
 * Includes Unicode normalization (NFKC) which is central to many other operations.
 *
 * @module core/text
 * @requires core/utils
 * @exports normNFKC, normalize, toLower, toUpper, reverse, dedupeChars, replace, append, sort
 */

import { processWithBatching } from './utils.js';

/**
 * Calculates the Levenshtein distance between two strings.
 * @param {string} s 
 * @param {string} t 
 * @returns {number}
 */
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

/* ====== Pure Helpers ====== */

/**
 * Normalizes a string to NFKC form and trims whitespace.
 * @param {string} s 
 * @returns {string}
 */
export const normNFKC = s => (s || "").normalize('NFKC').trim();

/* ====== Transformations ====== */

/**
 * Normalizes items using a specific converter (e.g. Kana).
 * @param {Iterable} items 
 * @param {object} _ options (unused)
 * @param {object} hooks - { converter, ... }
 */
export async function normalize(items, _, hooks) {
    const { converter } = hooks;
    return processWithBatching(items, async (w) => {
        const res = converter ? await converter(w) : w;
        return res ? res.replace(/\s+/g, '') : null;
    }, hooks);
}

export async function toUpper(items, _, hooks) {
    return processWithBatching(items, w => normNFKC(w).toUpperCase(), hooks);
}

export async function toLower(items, _, hooks) {
    return processWithBatching(items, w => normNFKC(w).toLowerCase(), hooks);
}

export async function reverse(items, _, hooks) {
    return processWithBatching(items, w => {
        const reversed = Array.from(normNFKC(w)).reverse().join('');
        return reversed || null;
    }, hooks);
}

export async function dedupeChars(items, _, hooks) {
    return processWithBatching(items, w => {
        const seen = new Set();
        const result = [];
        for (const ch of Array.from(normNFKC(w))) {
            if (seen.has(ch)) continue;
            seen.add(ch);
            result.push(ch);
        }
        return result.length ? result.join('') : null;
    }, hooks);
}

export async function replace(items, { from, to }, hooks) {
    const needle = normNFKC(from);
    const replacement = normNFKC(to ?? '');
    if (!needle) return new Set();
    return processWithBatching(items, w => {
        const normed = normNFKC(w);
        return normed.split(needle).join(replacement);
    }, hooks);
}

export async function append(items, { prefix = '', suffix = '' }, hooks) {
    return processWithBatching(items, w => prefix + w + suffix, hooks);
}

export async function sort(items, { order = 'asc', locale = 'ja' } = {}) {
    const arr = Array.from(items);
    arr.sort((a, b) => normNFKC(a).localeCompare(normNFKC(b), locale));
    if (order === 'desc') arr.reverse();
    return new Set(arr);
}
