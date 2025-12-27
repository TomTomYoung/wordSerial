/**
 * @fileoverview Normalization operations.
 * @summary Operations to convert bags to Hiragana or Katakana.
 * @description
 * Uses the Kuroshiro infrastructure to asynchronously normalization text items.
 *
 * @module domain/ops/normalize
 * @requires infra/kuro-wrapper
 * @requires core/text
 * @requires domain/ops/base
 * @requires core/utils
 * @exports op_normalize_hiragana, op_normalize_katakana
 */

import { ensureKuro, getK } from '../../infra/kuro-wrapper.js';
import { convertInWorker } from '../../infra/hiragana-worker-client.js';
import { runProgressiveOp } from './base.js';
import { normalize, normNFKC } from '../../core/text.js';
import { Bag } from '../models/bag.js';


// Imports removed (unused)

// Re-implementing logic-side getHooks locally or importing? 
// The original operations.js used utils.js for getBatchSize.
// Ideally, domain ops shouldn't depend on UI utils.
// For now, I'll allow hook injection from the caller (Controller/UI layer), 
// but provide defaults here for testing if possible.
// Wait, getBatchSize reads from DOM. This logic should be passed in.

/**
 * Hiragana Normalization
 * Reverted to Progressive Op with Timeout (Step 161 state).
 */
export async function op_normalize_hiragana(srcBag, { hooks } = {}) {
    console.log('[op_normalize_hiragana] Waiting for Kuro...');
    await ensureKuro();
    console.log('[op_normalize_hiragana] Kuro ready.');
    const K = getK();

    // 高速化のため、ラップ関数(toHiragana)を経由せずKuroshiroインスタンスを直接使うコンバータを定義
    const fastConverter = async (s) => await K.convert(normNFKC(s), { to: 'hiragana', mode: 'spaced' });

    const logic = async (h) => {
        // Try Web Worker first to avoid blocking the main thread.
        try {
            await convertInWorker(srcBag.items, 'hiragana', { onChunk: h.onChunk });
            return;
        } catch (err) {
            console.warn('[op_normalize_hiragana] Worker fallback to main thread', err);
        }

        await normalize(srcBag.items, null, { ...h, converter: fastConverter });
    };

    return runProgressiveOp(
        `${srcBag.name} → normalize(hiragana)`,
        { op: 'normalize_hiragana', src: srcBag.id, normalized: 'hiragana' },
        logic,
        hooks
    );
}

export async function op_normalize_katakana(srcBag, { hooks } = {}) {
    await ensureKuro();
    const K = getK();
    const fastConverter = async (s) => await K.convert(normNFKC(s), { to: 'katakana', mode: 'spaced' });

    const logic = async (h) => {
        try {
            await convertInWorker(srcBag.items, 'katakana', { onChunk: h.onChunk });
            return;
        } catch (err) {
            console.warn('[op_normalize_katakana] Worker fallback to main thread', err);
        }

        await normalize(srcBag.items, null, { ...h, converter: fastConverter });
    };

    return runProgressiveOp(
        `${srcBag.name} → normalize(katakana)`,
        { op: 'normalize_katakana', src: srcBag.id, normalized: 'katakana' },
        logic,
        hooks
    );
}
