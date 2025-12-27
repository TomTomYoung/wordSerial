/**
 * @fileoverview Operations Runner.
 * @summary Orchestrates re-application of operations.
 * @description
 * Handles the logic for re-calculating bags based on their metadata (Op Rebuild).
 * Maps meta operation names to actual Domain Operation function calls.
 *
 * @module domain/ops/runner
 * @requires domain/models/registry
 * @requires domain/ops/*
 * @requires core/utils
 * @requires core/sets
 * @requires infra/kuro-wrapper
 * @exports reapplySeries, OP_REBUILDERS
 */

import { REG } from '../models/registry.js';
import { nowISO, setsAreEqual } from '../../core/utils.js';
import { appendOpLog, getBatchSize, waitFrame } from '../../ui/dom.js';
// Note: ui/dom dependency in domain layer slightly breaks strict layering,
// but runner heavily relies on logging to UI.
// Ideally, we'd pass a logger callback. For now, we import appendOpLog to match legacy features.

import { convertInWorker } from '../../infra/hiragana-worker-client.js';

// Generic hooks provider
function getHooks() {
    return {
        yielder: waitFrame,
        batchSize: getBatchSize() // This also reads from DOM. Consider passing in via config.
        // For refactoring speed, we accept this coupling for now.
    };
}

// Import all ops to map them
import * as NormOps from './normalize.js';
import * as TransOps from './transform.js';
import * as SetOps from './sets.js';
import * as FilterOps from './filters.js';
import * as GenOps from './generators.js';

// Map op name (from meta.op) to actual function call
// In v1, operations.js exported individual functions like op_to_upper.
// Here we map them back.
const OP_MAP = {
    'normalize_hiragana': NormOps.op_normalize_hiragana,
    'normalize_katakana': NormOps.op_normalize_katakana,
    'to_upper': TransOps.op_to_upper,
    'to_lower': TransOps.op_to_lower,
    'reverse': TransOps.op_reverse,
    'dedupe_chars': TransOps.op_dedupe_chars,
    'replace': TransOps.op_replace,
    'sort': TransOps.op_sort,
    'union': SetOps.op_union,
    'intersection': SetOps.op_intersection,
    'difference': SetOps.op_difference,
    'symmetric_difference': SetOps.op_symmetric_difference,
    'filter_length': FilterOps.op_filter_length,
    'filter_prefix': FilterOps.op_filter_prefix,
    'filter_suffix': FilterOps.op_filter_suffix,
    'filter_contains': FilterOps.op_filter_contains,
    'filter_regex': FilterOps.op_filter_regex,
    'filter_similarity': FilterOps.op_filter_similarity,
    // 'filter_in' is special, mapped below
    'ngrams': GenOps.op_ngrams,
    'sample': GenOps.op_sample,
    'cartesian': GenOps.op_cartesian,
    'append': GenOps.op_append,
    'anagram': GenOps.op_anagram
};

// Re-builder functions that take 'meta' and call the appropriate Domain Op.
// Unlike legacy runner which called Logic directly, we call Domain Ops to get the progressive behavior benefits?
// Actually, `reapply` acts synchronously-ish in concept, but progressive implementation is fine.
// BUT: Domain Ops create NEW bags usually (`runProgressiveOp`).
// Reapply means UPDATE existing bag.
// The legacy runner.js updated the existing bag in place: `bag.items = nextItems`.
// Our new `runProgressiveOp` CREATES a new bag.
// This is a mismatch.
// If we use Domain Ops, we get new bags.
// We need "Compute Logic" separate from "Create Bag Wrapper".
// The Domain Ops in `domain/ops/*.js` are wrappers that do: `runProgressiveOp(...)`.
// They call Core Logic inside.
// We should call Core Logic here OR refactor Domain Ops to allow targeting an existing bag?
// The easiest path: Call Core Logic here, just like legacy runner did.
// This means we duplicate the "glue" code (extracting params from meta), but that's what runner.js did.
// We import Core functions directly.

import * as CoreText from '../../core/text.js';
import * as CoreSets from '../../core/sets.js';
import * as CoreFilters from '../../core/filters.js';
import * as CoreGens from '../../core/generators.js';
import { ensureKuro, getK } from '../../infra/kuro-wrapper.js';

async function convertWithWorker(items, target) {
    const out = new Set();
    await convertInWorker(items, target, {
        onChunk: (chunk) => {
            for (const c of chunk || []) out.add(c);
        }
    });
    return out;
}

// Helper to get items from src ID in meta
async function getItems(bagId, normalizeBefore = false) {
    const bag = REG.get(bagId);
    if (!bag) throw new Error(`Bag ${bagId} not found`);
    // normalizeBefore logic...
    // If true, we need to convert to items normalized.
    // For now, return raw items. Parity with `domain/ops/transform.js` decision.
    return bag.items;
}

export const OP_REBUILDERS = {
    async normalize_hiragana(meta) {
        const items = await getItems(meta.src);
        try {
            return await convertWithWorker(items, 'hiragana');
        } catch (err) {
            console.warn('[runner] Worker normalize_hiragana fallback', err);
        }

        await ensureKuro();
        const K = getK();
        const fastConverter = async (s) => await K.convert(CoreText.normNFKC(s), { to: 'hiragana', mode: 'spaced' });
        return CoreText.normalize(items, null, { ...getHooks(), converter: fastConverter });
    },
    async normalize_katakana(meta) {
        const items = await getItems(meta.src);
        try {
            return await convertWithWorker(items, 'katakana');
        } catch (err) {
            console.warn('[runner] Worker normalize_katakana fallback', err);
        }

        await ensureKuro();
        const K = getK();
        const fastConverter = async (s) => await K.convert(CoreText.normNFKC(s), { to: 'katakana', mode: 'spaced' });
        return CoreText.normalize(items, null, { ...getHooks(), converter: fastConverter });
    },
    async to_upper(meta) {
        return CoreText.toUpper(await getItems(meta.src, meta.normalize_before), null, getHooks());
    },
    async to_lower(meta) {
        return CoreText.toLower(await getItems(meta.src, meta.normalize_before), null, getHooks());
    },
    async reverse(meta) {
        return CoreText.reverse(await getItems(meta.src, meta.normalize_before), null, getHooks());
    },
    async dedupe_chars(meta) {
        return CoreText.dedupeChars(await getItems(meta.src, meta.normalize_before), null, getHooks());
    },
    async replace(meta) {
        return CoreText.replace(await getItems(meta.src, meta.normalize_before), { from: meta.from, to: meta.to }, getHooks());
    },
    async sort(meta) {
        return CoreText.sort(await getItems(meta.src, meta.normalize_before), { order: meta.order, locale: meta.locale });
    },
    async union(meta) {
        const itemsA = await getItems(meta.src_a);
        const itemsB = await getItems(meta.src_b);
        return CoreSets.union(itemsA, { itemsB }, getHooks());
    },
    async intersection(meta) {
        const itemsA = await getItems(meta.src_a);
        const itemsB = await getItems(meta.src_b);
        return CoreSets.intersection(itemsA, { itemsB }, getHooks());
    },
    async difference(meta) {
        const itemsA = await getItems(meta.src_a);
        const itemsB = await getItems(meta.src_b);
        return CoreSets.difference(itemsA, { itemsB }, getHooks());
    },
    async symmetric_difference(meta) {
        const itemsA = await getItems(meta.src_a);
        const itemsB = await getItems(meta.src_b);
        return CoreSets.symmetricDifference(itemsA, { itemsB }, getHooks());
    },
    async filter_length(meta) {
        return CoreFilters.filterLength(await getItems(meta.src, meta.normalize_before), { min: meta.min, max: meta.max }, getHooks());
    },
    async filter_prefix(meta) {
        return CoreFilters.filterPrefix(await getItems(meta.src, meta.normalize_before), { prefix: meta.prefix }, getHooks());
    },
    async filter_suffix(meta) {
        return CoreFilters.filterSuffix(await getItems(meta.src, meta.normalize_before), { suffix: meta.suffix }, getHooks());
    },
    async filter_contains(meta) {
        return CoreFilters.filterContains(await getItems(meta.src, meta.normalize_before), { needle: meta.needle || meta.contains }, getHooks());
    },
    async filter_regex(meta) {
        return CoreFilters.filterRegex(await getItems(meta.src, meta.normalize_before), { pattern: meta.pattern, invert: meta.invert }, getHooks());
    },
    async filter_similarity(meta) {
        return CoreFilters.filterSimilarity(await getItems(meta.src, meta.normalize_before), { target: meta.target, dist: meta.dist }, getHooks());
    },
    async filter_in(meta) {
        const itemsA = await getItems(meta.src, meta.normalize_src_before);
        const itemsB = await getItems(meta.lookup, meta.normalize_lookup_before);
        return CoreSets.intersection(itemsA, { itemsB }, getHooks());
    },
    async ngrams(meta) {
        return CoreGens.ngrams(await getItems(meta.src, meta.normalize_before), { n: meta.n }, getHooks());
    },
    async sample(meta) {
        return CoreGens.sample(await getItems(meta.src, meta.normalize_before), { count: meta.count, seed: meta.seed });
    },
    async cartesian(meta) {
        const itemsA = await getItems(meta.src_a);
        const itemsB = await getItems(meta.src_b);
        return CoreGens.cartesian(itemsA, { itemsB, sep: meta.sep, limit: meta.limit }, getHooks());
    },
    async append(meta) {
        return CoreText.append(await getItems(meta.src, meta.normalize_before), { prefix: meta.prefix, suffix: meta.suffix }, getHooks());
    },
    async anagram(meta) {
        return CoreGens.anagram(await getItems(meta.src, meta.normalize_before), null, getHooks());
    }
};

async function recomputeBagByMeta(bag) {
    const meta = bag?.meta || {};
    const op = meta.op;
    if (!op) return { changed: false, reason: 'no-op' };

    const runner = OP_REBUILDERS[op];
    if (!runner) return { changed: false, reason: 'unsupported' };

    const before = bag.items instanceof Set ? new Set(bag.items) : new Set(Array.from(bag.items || []));
    const result = await runner(meta);

    if (!result) return { changed: false, reason: 'no-change' };

    const nextItems = result instanceof Set ? result : new Set(result);
    // setsAreEqual from core/utils checks size and content
    const changed = !setsAreEqual(before, nextItems);

    if (changed) {
        bag.items = nextItems;
        bag.meta.size = bag.items.size;
        bag.meta.reapplied_at = nowISO();
        bag.meta.updated_at = nowISO();
    } else {
        bag.meta.reapplied_at = nowISO();
    }

    return { changed, reason: changed ? 'updated' : 'no-change' };
}

export async function reapplySeries(limitBagId = null, callbacks = {}) {
    const limit = limitBagId === null ? null : Number(limitBagId);
    appendOpLog(`↻ Reapply start`);

    const bags = REG.all();
    let updated = 0;

    for (const bag of bags) {
        try {
            const runnable = bag?.meta?.op && OP_REBUILDERS[bag.meta.op];
            if (!runnable) {
                bag.meta.reapply_status = '⏭ Skip';
                if (callbacks.onStatus) callbacks.onStatus(bag.id, bag.meta.reapply_status);
            } else {
                bag.meta.reapply_status = '⟳ Running...';
                if (callbacks.onStatus) callbacks.onStatus(bag.id, bag.meta.reapply_status);

                const result = await recomputeBagByMeta(bag);

                bag.meta.reapply_status = result.changed ? `✓ Updated(${bag.items.size})` : '＝ No Change';
                if (result.changed) updated++;

                if (callbacks.onStatus) callbacks.onStatus(bag.id, bag.meta.reapply_status);
            }
        } catch (e) {
            console.error(e);
            bag.meta.reapply_status = `× Error: ${e.message}`;
            bag.meta.reapply_error = e.message;
            if (callbacks.onStatus) callbacks.onStatus(bag.id, bag.meta.reapply_status);
            // Don't break loop? or break? Original broke.
            break;
        }
        if (limit !== null && bag.id === limit) break;
    }

    appendOpLog(`✓ Reapply finished (updated ${updated})`);
    if (callbacks.onUpdate) callbacks.onUpdate();
}
