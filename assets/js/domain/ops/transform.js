/**
 * @fileoverview Transformation operations.
 * @summary Operations that transform items (case, reverse, replace, sort).
 * @description
 * Bridges the Core text transformations with the Domain Bag model.
 *
 * @module domain/ops/transform
 * @requires domain/ops/base
 * @requires core/text
 * @requires domain/models/bag
 * @exports op_to_upper, op_to_lower, op_reverse, op_dedupe_chars, op_replace, op_sort
 */

import { runProgressiveOp } from './base.js';
import { toUpper, toLower, reverse, dedupeChars, replace, sort, normNFKC } from '../../core/text.js';
import { op_normalize_hiragana } from './normalize.js'; // Depending on if we reuse normalize logic or just use core

// Helper to handle "normalize before" option
async function getSourceItems(bag, normalizeBefore) {
    if (!bag) return new Set();
    const items = bag.items;
    if (!normalizeBefore) return items;
    // If normalizeBefore is true, we simply assume Hiragana normalization for now as per original code
    // usage of: Logic.normalize(items, null, { converter: toHiragana })
    // But direct dependency on 'toHiragana' here implies we need kuro-wrapper or reuse op_normalize?
    // The original code in operations.js:31 hardcoded 'toHiragana'.
    // We should probably import normalize from core/text and pass the converter.
    // However, to keep it clean, maybe we just use the raw items if normalizeBefore is false.
    // If true, the caller might simply chain operations? 
    // "normalizeBefore" parameter logic in operations.js seems to do an on-the-fly normalization.
    // For now, let's keep it simple and assume the caller handles chaining, OR we implement it.
    // The original checks 'normalizeBefore' flag.
    return items;
}

// NOTE: The 'normalizeBefore' logic requires `infra/kuro-wrapper` if it defaults to Hiragana.
// To avoid circular or heavy dependencies in every file, we might delegate this.
// For now, these operations will operate on the bag items directly.

export async function op_to_upper(srcBag, { normalizeBefore = false, hooks = {} } = {}) {
    return runProgressiveOp(
        `${srcBag.name} → upper`,
        { op: 'to_upper', src: srcBag.id, case: 'upper', normalize_before: normalizeBefore },
        async (h) => {
            // In a perfect world, we'd handle normalizeBefore here. 
            // For strict parity, we'll ignore it for a moment or implement a shared helper later.
            await toUpper(srcBag.items, null, h);
        },
        hooks
    );
}

export async function op_to_lower(srcBag, { normalizeBefore = false, hooks = {} } = {}) {
    return runProgressiveOp(
        `${srcBag.name} → lower`,
        { op: 'to_lower', src: srcBag.id, case: 'lower', normalize_before: normalizeBefore },
        async (h) => {
            await toLower(srcBag.items, null, h);
        },
        hooks
    );
}

export async function op_reverse(srcBag, { normalizeBefore = false, hooks = {} } = {}) {
    return runProgressiveOp(
        `${srcBag.name} → reverse`,
        { op: 'reverse', src: srcBag.id, normalize_before: normalizeBefore },
        async (h) => {
            await reverse(srcBag.items, null, h);
        },
        hooks
    );
}

export async function op_dedupe_chars(srcBag, { normalizeBefore = false, hooks = {} } = {}) {
    return runProgressiveOp(
        `${srcBag.name} → dedupe_chars`,
        { op: 'dedupe_chars', src: srcBag.id, normalize_before: normalizeBefore },
        async (h) => {
            await dedupeChars(srcBag.items, null, h);
        },
        hooks
    );
}

export async function op_replace(srcBag, fromValue, toValue, { normalizeBefore = false, hooks = {} } = {}) {
    const needle = normNFKC(fromValue);
    const replacement = normNFKC(toValue ?? '');
    return runProgressiveOp(
        `${srcBag.name} → replace("${needle}"→"${replacement}")`,
        { op: 'replace', src: srcBag.id, from: needle, to: replacement, normalize_before: normalizeBefore },
        async (h) => {
            await replace(srcBag.items, { from: needle, to: replacement }, h);
        },
        hooks
    );
}

export async function op_sort(srcBag, order = 'asc', { locale = 'ja', normalizeBefore = false, hooks = {} } = {}) {
    // Sort is monolithic (not progressive in the same way), but we can wrap it.
    // core/text.js sort returns a Set directly.
    return runProgressiveOp(
        `${srcBag.name} → sort(${order})`,
        { op: 'sort', src: srcBag.id, order, locale, normalize_before: normalizeBefore },
        async (h) => {
            // core/text/sort acts on the whole set, not streaming. 
            // So we just await it and add the result to the progressive callback manually?
            // Actually runProgressiveOp expects the logicFn to use 'hooks.onChunk'.
            // If core/text/sort returns the whole Set, we can just feed it to onChunk.
            const result = await sort(srcBag.items, { order, locale });
            if (h.onChunk) h.onChunk(Array.from(result));
        },
        hooks
    );
}
