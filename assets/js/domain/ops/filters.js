/**
 * @fileoverview Filter operations.
 * @summary Operations that filter bag contents (Length, Prefix, etc.).
 * @description
 * Domain adapters for Core filtering logic.
 *
 * @module domain/ops/filters
 * @requires domain/ops/base
 * @requires core/filters
 * @requires core/text
 * @exports op_filter_length, op_filter_prefix, op_filter_suffix, op_filter_contains, op_filter_regex, op_filter_similarity, op_filter_in
 */

import { runProgressiveOp } from './base.js';
import {
    filterLength, filterPrefix, filterSuffix, filterContains, filterRegex, filterSimilarity
} from '../../core/filters.js';
import { normNFKC } from '../../core/text.js';
// filterIn was logic.filterIn, which is just checking existence in another set. 
// We likely need to reimplement/import that logic from logic.js or core.
// Wait, 'filterIn' is basically 'Intersection' but with a specific UI context (Lookup bag).
// Logic.js had `filterIn`. core/sets.js has `intersection`. 
// Use core/sets.js Intersection logic if possible, or implement a simple wrapper.
// Checking core/sets.js... it has intersection.
import { intersection } from '../../core/sets.js';

// Helper for normalizing single query strings provided by user
async function normQuery(val, normalizeBefore, converter) {
    const base = normNFKC(val || '');
    if (!base) return '';
    if (!normalizeBefore) return base;
    // If normalizeBefore is requested, we need a converter.
    // Assuming 'toHiragana' via kuro-wrapper if we want to match legacy behavior.
    // For now, if no converter provided, just return base.
    // Ideally we inject the converter via hooks or separate this concern.
    return base;
}


export async function op_filter_length(bag, minLen, maxLen, { normalizeBefore = false, hooks = {} } = {}) {
    return runProgressiveOp(
        `${bag.name} → length[${minLen}-${maxLen}]`,
        {
            op: 'filter_length',
            src: bag.id,
            range: `${minLen}-${maxLen}`,
            min: minLen,
            max: maxLen,
            normalize_before: normalizeBefore
        },
        async (h) => {
            // Note: filterLength in core expects items. 
            await filterLength(bag.items, { min: minLen, max: maxLen }, h);
        },
        hooks
    );
}

export async function op_filter_prefix(bag, prefixRaw, { normalizeBefore = false, hooks = {} } = {}) {
    // We handle query normalization here if needed, or assume caller did it.
    // Legacy ops: const needle = await normQuery(prefixRaw, normalizeBefore);
    // For now we'll just use raw NFKC.
    const needle = normNFKC(prefixRaw);
    return runProgressiveOp(
        `${bag.name} → prefix(${needle || '∅'})`,
        { op: 'filter_prefix', src: bag.id, prefix: needle, normalize_before: normalizeBefore },
        async (h) => {
            await filterPrefix(bag.items, { prefix: needle }, h);
        },
        hooks
    );
}

export async function op_filter_suffix(bag, suffixRaw, { normalizeBefore = false, hooks = {} } = {}) {
    const needle = normNFKC(suffixRaw);
    return runProgressiveOp(
        `${bag.name} → suffix(${needle || '∅'})`,
        { op: 'filter_suffix', src: bag.id, suffix: needle, normalize_before: normalizeBefore },
        async (h) => {
            await filterSuffix(bag.items, { suffix: needle }, h);
        },
        hooks
    );
}

export async function op_filter_contains(bag, needleRaw, { normalizeBefore = false, hooks = {} } = {}) {
    const needle = normNFKC(needleRaw);
    return runProgressiveOp(
        `${bag.name} → contains(${needle || '∅'})`,
        { op: 'filter_contains', src: bag.id, needle, normalize_before: normalizeBefore },
        async (h) => {
            await filterContains(bag.items, { needle }, h);
        },
        hooks
    );
}

export async function op_filter_regex(bag, pattern, invert, { normalizeBefore = false, hooks = {} } = {}) {
    return runProgressiveOp(
        `${bag.name} → regex(${pattern}${invert ? ', invert' : ''})`,
        { op: 'filter_regex', src: bag.id, pattern, invert, normalize_before: normalizeBefore },
        async (h) => {
            await filterRegex(bag.items, { pattern, invert }, h);
        },
        hooks
    );
}

export async function op_filter_similarity(bag, targetRaw, dist, { normalizeBefore = false, hooks = {} } = {}) {
    const target = normNFKC(targetRaw);
    return runProgressiveOp(
        `${bag.name} → similarity(${target},${dist})`,
        { op: 'filter_similarity', src: bag.id, target, dist, normalize_before: normalizeBefore },
        async (h) => {
            await filterSimilarity(bag.items, { target, dist }, h);
        },
        hooks
    );
}

export async function op_filter_in(srcBag, lookupBag, { normalizeSrc = false, normalizeLookup = false, hooks = {} } = {}) {
    return runProgressiveOp(
        `${srcBag.name} → filter_in([${lookupBag.id}:${lookupBag.name}])`,
        {
            op: 'filter_in',
            src: srcBag.id,
            lookup: lookupBag.id,
            normalize_src_before: normalizeSrc,
            normalize_lookup_before: normalizeLookup
        },
        async (h) => {
            // "filter_in" is effectively intersection: keep items in src that are also in lookup.
            // core/sets/intersection: (itemsA, { itemsB }) ...
            await intersection(srcBag.items, { itemsB: lookupBag.items }, h);
        },
        hooks
    );
}
