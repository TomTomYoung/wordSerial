/**
 * @fileoverview Utility functions for generic algorithms and helpers.
 * @summary Provides batch processing, comparisons, and math utilities.
 * @description
 * This module contains pure utility functions that are not specific to the domain
 * or UI, such as Levenshtein distance, set comparison, and random number generation.
 *
 * @module core/utils
 * @requires none
 * @exports processWithBatching, setsAreEqual, levenshtein, makeSeedFromString, mulberry32, nowISO
 */

/**
 * Returns current ISO string without milliseconds (e.g., 2023-01-01T12:00:00Z).
 * @returns {string}
 */
export const nowISO = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * Checks if two sets contain exactly the same values.
 * @param {Set} a 
 * @param {Set} b 
 * @returns {boolean}
 */
export function setsAreEqual(a, b) {
    if (a === b) return true;
    if (!(a instanceof Set) || !(b instanceof Set)) return false;
    if (a.size !== b.size) return false;
    for (const value of a) {
        if (!b.has(value)) return false;
    }
    return true;
}

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

/**
 * Generates a integer hash/seed from a string.
 * @param {string} seed 
 * @returns {number}
 */
export function makeSeedFromString(seed) {
    if (typeof seed === 'number') return seed >>> 0;
    let h = 1779033703 ^ (seed?.length || 0);
    for (let i = 0; i < (seed?.length || 0); i += 1) {
        h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return (Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0;
}

/**
 * Creates a seeded random number generator (Mulberry32).
 * @param {number} a Seed value
 * @returns {function(): number}
 */
export function mulberry32(a) {
    return function () {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Helper to iterate over items with batching options to prevent UI blocking.
 * @param {Iterable} items - Source items (Set or Array)
 * @param {function(string): Promise<any>} processFn - Async function to process each item. Returns null to skip.
 * @param {object} options - Options
 * @param {function(): Promise<void>} [options.yielder] - Function to yield control (e.g., waitFrame)
 * @param {number} [options.batchSize=200] - Number of items to process before yielding
 * @param {function(Array): void} [options.onChunk] - Callback for progressive updates
 * @returns {Promise<Set<any>>}
 */
export async function processWithBatching(items, processFn, { yielder, batchSize = 200, onChunk = null } = {}) {
    // console.log(`[processWithBatching] Start. Items size: ${items instanceof Set ? items.size : items.length}, BatchSize: ${batchSize}`);
    const out = new Set();
    let i = 0;
    let chunkBuffer = [];

    const flushChunk = () => {
        if (onChunk && chunkBuffer.length) {
            onChunk(chunkBuffer);
            chunkBuffer = [];
        }
    };

    for (const item of items) {
        const results = await processFn(item);
        if (results !== null && results !== undefined) {
            if (results instanceof Set || Array.isArray(results)) {
                for (const r of results) {
                    out.add(r);
                    if (onChunk) chunkBuffer.push(r);
                }
            } else {
                out.add(results);
                if (onChunk) chunkBuffer.push(results);
            }
        }
        if (yielder && ++i % batchSize === 0) {
            flushChunk();
            await yielder();
        }
    }
    flushChunk();
    return out;
}
