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
import { runProgressiveOp } from './base.js';
import { normalize, normNFKC } from '../../core/text.js';
// Imports removed (unused)

// Re-implementing logic-side getHooks locally or importing? 
// The original operations.js used utils.js for getBatchSize.
// Ideally, domain ops shouldn't depend on UI utils.
// For now, I'll allow hook injection from the caller (Controller/UI layer), 
// but provide defaults here for testing if possible.
// Wait, getBatchSize reads from DOM. This logic should be passed in.

export async function op_normalize_hiragana(srcBag, { hooks } = {}) {
    console.log('[op_normalize_hiragana] Waiting for Kuro...');
    await ensureKuro();
    console.log('[op_normalize_hiragana] Kuro ready.');
    const K = getK();

    const fastConverter = async (s) => await K.convert(normNFKC(s), { to: 'hiragana', mode: 'spaced' });

    return runProgressiveOp(
        `${srcBag.name} → normalize(hiragana)`,
        { op: 'normalize_hiragana', src: srcBag.id, normalized: 'hiragana' },
        async (h) => {
            await normalize(srcBag.items, null, { ...h, converter: fastConverter });
        },
        hooks
    );
}

export async function op_normalize_katakana(srcBag, { hooks } = {}) {
    await ensureKuro();
    const K = getK();
    const fastConverter = async (s) => await K.convert(normNFKC(s), { to: 'katakana', mode: 'spaced' });

    return runProgressiveOp(
        `${srcBag.name} → normalize(katakana)`,
        { op: 'normalize_katakana', src: srcBag.id, normalized: 'katakana' },
        async (h) => {
            await normalize(srcBag.items, null, { ...h, converter: fastConverter });
        },
        hooks
    );
}
