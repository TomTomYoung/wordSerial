/**
 * @fileoverview Item generators and combinatorics.
 * @summary Provides functions to generate new items or combinations from existing ones.
 * @description
 * Contains logic for N-grams, sampling, cartesian products, and anagrams.
 * These operations typically produce a different set of items than the input.
 *
 * @module core/generators
 * @requires core/utils
 * @requires core/text
 * @exports ngrams, sample, cartesian, anagram
 */

import { processWithBatching, makeSeedFromString, mulberry32 } from './utils.js';
import { normNFKC } from './text.js';

export async function ngrams(items, { n }, hooks) {
    const size = Number.isFinite(n) ? Math.max(1, n) : 1;
    return processWithBatching(items, w => {
        const norm = normNFKC(w);
        const res = [];
        if (norm && norm.length >= size) {
            for (let i = 0; i <= norm.length - size; i += 1) {
                res.push(norm.slice(i, i + size));
            }
        }
        return res;
    }, hooks);
}

export async function sample(items, { count, seed }) {
    const arr = Array.from(items);
    const safeCount = Number.isFinite(count) ? count : 0;
    const need = Math.min(Math.max(0, safeCount), arr.length);
    if (need === arr.length) return new Set(arr);

    let rand = Math.random;
    if (seed) rand = mulberry32(makeSeedFromString(seed));

    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return new Set(arr.slice(0, need));
}

export async function cartesian(itemsA, { itemsB, sep = '', limit = 10000 }, { yielder, batchSize = 200 } = {}) {
    const out = new Set();
    const arrA = Array.from(itemsA);
    const arrB = Array.from(itemsB);
    let count = 0;

    outer: for (let i = 0; i < arrA.length; i++) {
        const wa = arrA[i];
        for (const wb of arrB) {
            if (out.size >= limit) break outer;
            out.add(wa + sep + wb);
        }
        if (++count % batchSize === 0 && yielder) await yielder();
    }
    return out;
}

export async function anagram(items, _, hooks) {
    return processWithBatching(items, w => {
        const chars = Array.from(normNFKC(w));
        for (let k = chars.length - 1; k > 0; k--) {
            const j = Math.floor(Math.random() * (k + 1));
            [chars[k], chars[j]] = [chars[j], chars[k]];
        }
        return chars.join('');
    }, hooks);
}
