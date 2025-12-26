/**
 * @fileoverview Filter operations.
 * @summary Provides various filtering strategies for string collections.
 * @description
 * Contains filtering logic based on string properties (length, containment),
 * regular expressions, and similarity metrics.
 *
 * @module core/filters
 * @requires core/utils
 * @requires core/text
 * @exports filterLength, filterPrefix, filterSuffix, filterContains, filterRegex, filterSimilarity
 */

import { processWithBatching, levenshtein } from './utils.js';
import { normNFKC } from './text.js';

export async function filterLength(items, { min, max }, hooks) {
    return processWithBatching(items, w => {
        const len = normNFKC(w).length;
        return (len >= min && len <= max) ? w : null;
    }, hooks);
}

export async function filterPrefix(items, { prefix }, hooks) {
    if (!prefix) return new Set();
    return processWithBatching(items, w => normNFKC(w).startsWith(prefix) ? w : null, hooks);
}

export async function filterSuffix(items, { suffix }, hooks) {
    if (!suffix) return new Set();
    return processWithBatching(items, w => normNFKC(w).endsWith(suffix) ? w : null, hooks);
}

export async function filterContains(items, { needle }, hooks) {
    if (!needle) return new Set();
    return processWithBatching(items, w => normNFKC(w).includes(needle) ? w : null, hooks);
}

export async function filterRegex(items, { pattern, invert }, hooks) {
    if (!pattern) return new Set();
    const re = new RegExp(pattern, 'u');
    return processWithBatching(items, w => {
        const matched = re.test(w);
        return ((matched && !invert) || (!matched && invert)) ? w : null;
    }, hooks);
}

export async function filterSimilarity(items, { target, dist }, hooks) {
    if (!target) return new Set();
    const d = Number.isFinite(dist) ? dist : 2;
    return processWithBatching(items, w => {
        return levenshtein(w, target) <= d ? w : null;
    }, hooks);
}
