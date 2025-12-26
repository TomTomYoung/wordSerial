/**
 * @fileoverview Set operations (Union, Intersection, etc).
 * @summary Operations that combine or compare two bags.
 * @description
 * Bridges Core set comparison logic with Domain Bag models.
 *
 * @module domain/ops/sets
 * @requires domain/ops/base
 * @requires core/sets
 * @exports op_union, op_difference, op_intersection, op_symmetric_difference
 */

import { runProgressiveOp } from './base.js';
import { union, difference, intersection, symmetricDifference } from '../../core/sets.js';

export async function op_union(bagA, bagB, { hooks = {} } = {}) {
    return runProgressiveOp(
        `${bagA.name} ∪ ${bagB.name}`,
        {
            op: 'union',
            src: [bagA.id, bagB.id].join(','),
            src_a: bagA.id,
            src_b: bagB.id,
            size_a: bagA.items.size,
            size_b: bagB.items.size
        },
        async (h) => {
            // core/sets/union returns a Set immediately (not micro-batched yet in core implementation if it just spreads).
            // Actually core/sets.js union uses spreading: new Set([...a, ...b]). 
            // So we simulate chunking or just return it.
            const result = await union(bagA.items, { itemsB: bagB.items }, h);
            if (h.onChunk) h.onChunk(Array.from(result));
        },
        hooks
    );
}

export async function op_difference(bagA, bagB, { hooks = {} } = {}) {
    return runProgressiveOp(
        `${bagA.name} - ${bagB.name}`,
        {
            op: 'difference',
            src: [bagA.id, bagB.id].join(','),
            src_a: bagA.id,
            src_b: bagB.id
        },
        async (h) => {
            await difference(bagA.items, { itemsB: bagB.items }, h);
        },
        hooks
    );
}

export async function op_intersection(bagA, bagB, { hooks = {} } = {}) {
    return runProgressiveOp(
        `${bagA.name} ∩ ${bagB.name}`,
        {
            op: 'intersection',
            src: [bagA.id, bagB.id].join(','),
            src_a: bagA.id,
            src_b: bagB.id
        },
        async (h) => {
            await intersection(bagA.items, { itemsB: bagB.items }, h);
        },
        hooks
    );
}

export async function op_symmetric_difference(bagA, bagB, { hooks = {} } = {}) {
    return runProgressiveOp(
        `${bagA.name} △ ${bagB.name}`,
        {
            op: 'symmetric_difference',
            src: [bagA.id, bagB.id].join(','),
            src_a: bagA.id,
            src_b: bagB.id
        },
        async (h) => {
            // core/sets/symmetricDifference executes locally using batching hooks.
            await symmetricDifference(bagA.items, { itemsB: bagB.items }, h);
        },
        hooks
    );
}
