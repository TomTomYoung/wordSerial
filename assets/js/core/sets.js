/**
 * @fileoverview Set theory operations.
 * @summary Provides union, intersection, difference, and symmetric difference.
 * @description
 * Implements standard mathematical set operations. 
 * Most operations support batch processing to avoid blocking the main thread.
 *
 * @module core/sets
 * @requires core/utils
 * @exports union, difference, intersection, symmetricDifference
 */

import { processWithBatching } from './utils.js';

export async function union(itemsA, { itemsB }, _) {
    return new Set([...itemsA, ...itemsB]);
}

export async function difference(itemsA, { itemsB }, hooks) {
    return processWithBatching(itemsA, w => !itemsB.has(w) ? w : null, hooks);
}

export async function intersection(itemsA, { itemsB }, hooks) {
    return processWithBatching(itemsA, w => itemsB.has(w) ? w : null, hooks);
}

export async function symmetricDifference(itemsA, { itemsB }, hooks) {
    const out = new Set();
    // Two-pass approach. 
    // We manually accumulate to 'out' instead of returning a new Set from processWithBatching 
    // to combine results efficiently.

    await processWithBatching(itemsA, w => {
        if (!itemsB.has(w)) out.add(w);
    }, hooks);

    await processWithBatching(itemsB, w => {
        if (!itemsA.has(w)) out.add(w);
    }, hooks);

    return out;
}
