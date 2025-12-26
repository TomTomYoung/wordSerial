/**
 * @fileoverview Base operation utilities.
 * @summary Helper functions for running and composing operations.
 * @description
 * Provides `runProgressiveOp` to handle asynchronous background processing
 * of large datasets without blocking the UI.
 *
 * @module domain/ops/base
 * @requires domain/models/bag
 * @requires domain/models/registry
 * @exports runProgressiveOp, op_clone
 */

import { Bag } from '../models/bag.js';
import { REG } from '../models/registry.js';

/**
 * Runs a logic function progressively, creating a Bag in 'processing' state.
 * @param {string} bagName Name of the new bag
 * @param {object} meta Metadata for the bag
 * @param {function(object): Promise<void>} logicFn (hooks) => Promise
 * @param {object} hooks Hooks to inject (yielder, batchSize, etc.)
 * @returns {Promise<Bag>} The new bag instance (initially processing)
 */
export async function runProgressiveOp(bagName, meta, logicFn, hooks = {}) {
    // Create Bag in 'processing' state
    const bag = new Bag(bagName, [], { ...meta, status: 'processing' });
    REG.add(bag); // Register immediately

    // Run logic in background
    (async () => {
        try {
            console.log(`[Progressive] Start: ${bagName}`);
            const onChunk = (chunk) => {
                for (const item of chunk) bag.items.add(item);
                bag.updateProgress(bag.items.size, 0);
            };

            // Inject onChunk into hooks
            const combinedHooks = { ...hooks, onChunk };

            await logicFn(combinedHooks);

            console.log(`[Progressive] Finish: ${bagName}, Size=${bag.items.size}`);
            bag.finish();
            REG.notify(); // Trigger UI update
        } catch (e) {
            console.error("Progressive Op Failed", e);
            bag.meta.status = 'error';
            bag.meta.error = e.message;
        }
    })();

    return bag;
}

export async function op_clone(srcBag) {
    const items = new Set(srcBag.items); // Snapshot
    const name = `${srcBag.name} (copy)`;
    return new Bag(name, items, {
        op: 'clone',
        src: srcBag.id,
        status: 'ready'
    });
}
