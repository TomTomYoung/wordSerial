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
        const cleaned = res ? res.replace(/\s+/g, '') : '';
        return cleaned || null;  // Return null if empty string
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
