/**
 * @fileoverview Generator operations.
 * @summary Operations that generate new items (N-grams, Cartesian, Sampling).
 * @description
 * Domain adapters for Core generator generation logic.
 *
 * @module domain/ops/generators
 * @requires domain/ops/base
 * @requires core/generators
 * @requires core/text
 * @exports op_ngrams, op_sample, op_cartesian, op_append, op_anagram
 */

import { runProgressiveOp } from './base.js';
import { ngrams, sample, cartesian, anagram } from '../../core/generators.js';
import { append } from '../../core/text.js'; // append is in text.js in core

export async function op_ngrams(bag, n, { normalizeBefore = false, hooks = {} } = {}) {
    return runProgressiveOp(
        `${bag.name} → ngram(n=${n})`,
        { op: 'ngrams', src: bag.id, n, normalize_before: normalizeBefore },
        async (h) => {
            await ngrams(bag.items, { n }, h);
        },
        hooks
    );
}

export async function op_sample(bag, count, seed, { normalizeBefore = false, hooks = {} } = {}) {
    const size = bag.items.size;
    return runProgressiveOp(
        `${bag.name} → sample`,
        { op: 'sample', src: bag.id, size, count, seed: seed || null, normalize_before: normalizeBefore },
        async (h) => {
            // sample returns a Set, not chunked. 
            const result = await sample(bag.items, { count, seed });
            if (h.onChunk) h.onChunk(Array.from(result));
        },
        hooks
    );
}

export async function op_cartesian(bagA, bagB, sep, limit, { normalizeBefore = false, hooks = {} } = {}) {
    return runProgressiveOp(
        `${bagA.name} x ${bagB.name}`,
        {
            op: 'cartesian',
            src: [bagA.id, bagB.id].join(','),
            src_a: bagA.id,
            src_b: bagB.id,
            sep,
            limit,
            normalize_before: normalizeBefore
        },
        async (h) => {
            // cartesian supports yielder but not onChunk explicitly in core/generators yet?
            // Re-checking core/generators.js...
            // "if (++count % batchSize === 0 && yielder) await yielder();"
            // It doesn't yield chunks, it builds a massive set 'out' and returns it.
            // Domain wrapper needs to adapt. 
            // If core/generators returns 'out', we just onChunk(out).
            // For true progressiveness, core/generators needs update, but for now we wrap.
            const result = await cartesian(bagA.items, { itemsB: bagB.items, sep, limit }, h);
            if (h.onChunk) h.onChunk(Array.from(result));
        },
        hooks
    );
}

export async function op_append(bag, prefix, suffix, { normalizeBefore = false, hooks = {} } = {}) {
    return runProgressiveOp(
        `${bag.name} → append`,
        { op: 'append', src: bag.id, prefix, suffix, normalize_before: normalizeBefore },
        async (h) => {
            await append(bag.items, { prefix, suffix }, h);
        },
        hooks
    );
}

export async function op_anagram(bag, { normalizeBefore = false, hooks = {} } = {}) {
    return runProgressiveOp(
        `${bag.name} → anagram`,
        { op: 'anagram', src: bag.id, normalize_before: normalizeBefore },
        async (h) => {
            await anagram(bag.items, null, h);
        },
        hooks
    );
}
