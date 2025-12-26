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
 * @param {number} [options.concurrency=5] - Max number of items to process concurrently within a batch
 * @param {function(Array): void} [options.onChunk] - Callback for progressive updates
 * @returns {Promise<Set<any>>}
 */
export async function processWithBatching(items, processFn, { yielder, batchSize = 200, onChunk = null, concurrency = 5 } = {}) {
    console.log(`[processWithBatching] Start. Items size: ${items instanceof Set ? items.size : items.length}, BatchSize: ${batchSize}, Concurrency: ${concurrency}`);
    const itemsArray = Array.from(items);
    let processedCount = 0;

    for (let i = 0; i < itemsArray.length; i += batchSize) {
        const batch = itemsArray.slice(i, i + batchSize);
        console.log(`[processWithBatching] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(itemsArray.length / batchSize)}, items ${i}-${i + batch.length}`);

        // Process batch with limited concurrency
        for (let j = 0; j < batch.length; j += concurrency) {
            const concurrentBatch = batch.slice(j, j + concurrency);
            const results = await Promise.all(concurrentBatch.map(item => processFn(item).catch(err => {
                console.warn(`[processWithBatching] Error processing item:`, err);
                return null;
            })));

            // Stream results immediately to onChunk (no buffering)
            if (onChunk) {
                const chunk = [];
                for (const result of results) {
                    if (result !== null && result !== undefined) {
                        if (result instanceof Set || Array.isArray(result)) {
                            for (const r of result) chunk.push(r);
                        } else {
                            chunk.push(result);
                        }
                    }
                }
                if (chunk.length > 0) {
                    onChunk(chunk);
                    processedCount += chunk.length;
                }
            }
        }

        // Yield control to allow UI updates and GC
        if (yielder) {
            await yielder();
        }
    }

    console.log(`[processWithBatching] Complete. Processed ${processedCount} items`);
    // Return empty set since results are streamed via onChunk
    return new Set();
}
