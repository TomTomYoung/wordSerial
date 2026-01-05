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
