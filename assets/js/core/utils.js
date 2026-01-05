/**
 * @fileoverview Utility functions for generic algorithms and helpers.
 * @summary Provides batch processing, comparisons, and math utilities.
 * @description
 * This module contains pure utility functions that are not specific to the domain
 * or UI, such as Levenshtein distance, set comparison, and random number generation.
 *
 * @module core/utils
 * @requires none
 * @exports processWithBatching, makeSeedFromString, mulberry32, nowISO
 */

/**
 * Returns current ISO string without milliseconds (e.g., 2023-01-01T12:00:00Z).
 * @returns {string}
 */
export const nowISO = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');





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
export async function processWithBatching(items, processFn, { yielder, batchSize = 200, onChunk = null, concurrency = 5 } = {}) {
    console.log(`[processWithBatching] Start. Items size: ${items instanceof Set ? items.size : items.length}, BatchSize: ${batchSize}, Concurrency: ${concurrency}`);
    const out = new Set();
    let chunkBuffer = [];

    const flushChunk = () => {
        if (onChunk && chunkBuffer.length) {
            onChunk(chunkBuffer);
            chunkBuffer = [];
        }
    };

    // Convert to array to support indexed slicing for batches
    const itemsArray = Array.from(items);

    for (let i = 0; i < itemsArray.length; i += batchSize) {
        const batch = itemsArray.slice(i, i + batchSize);
        // console.log(`[processWithBatching] Processing batch ${i / batchSize + 1}, items ${i}-${i + batch.length}`);

        // Process batch with limited concurrency
        for (let j = 0; j < batch.length; j += concurrency) {
            const concurrentBatch = batch.slice(j, j + concurrency);

            const results = await Promise.all(concurrentBatch.map(async (item) => {
                try {
                    return await processFn(item);
                } catch (e) {
                    console.error("Item processing error:", e);
                    return null;
                }
            }));

            // Collect results
            for (const res of results) {
                if (res !== null && res !== undefined) {
                    if (res instanceof Set || Array.isArray(res)) {
                        for (const r of res) {
                            out.add(r);
                            if (onChunk) chunkBuffer.push(r);
                        }
                    } else {
                        out.add(res);
                        if (onChunk) chunkBuffer.push(res);
                    }
                }
            }
        }

        // Yield control to UI/GC
        if (yielder) {
            flushChunk();
            await yielder();
        }
    }
    flushChunk();
    return out;
}
