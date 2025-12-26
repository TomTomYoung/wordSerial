
import { REG } from './models.js';
import {
    waitFrame, nowISO, appendOpLog
} from './utils.js';
import { Logic, setsAreEqual } from './logic.js';
import { getHooks, getSourceItems, normQuery } from './operations.js';
import * as Kuro from '../lib/kuro.js';
import { normNFKC } from './logic.js'; // Ensure normNFKC is available

/* ====== OP_REBUILDERS ====== */
export const OP_REBUILDERS = {
    async normalize_hiragana(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        await Kuro.ensureKuro();
        const K = Kuro.getK();
        const fastConverter = async (s) => await K.convert(normNFKC(s), { to: 'hiragana', mode: 'spaced' });
        return Logic.normalize(src.items, null, { ...getHooks(), converter: fastConverter });
    },
    async normalize_katakana(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        await Kuro.ensureKuro();
        const K = Kuro.getK();
        const fastConverter = async (s) => await K.convert(normNFKC(s), { to: 'katakana', mode: 'spaced' });
        return Logic.normalize(src.items, null, { ...getHooks(), converter: fastConverter });
    },
    async to_romaji(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        await Kuro.ensureKuro();
        const K = Kuro.getK();
        const fastConverter = async (s) => await K.convert(normNFKC(s), { to: 'romaji', mode: 'spaced' });
        return Logic.toRomaji(await getSourceItems(src, !!meta.normalize_before), null, { ...getHooks(), converter: fastConverter });
    },
    async delete_chars(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const srcItems = await getSourceItems(src, !!meta.normalize_before);
        return Logic.deleteChars(srcItems, { chars: meta.deleted }, getHooks());
    },
    async to_upper(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        return Logic.toUpper(await getSourceItems(src, !!meta.normalize_before), null, getHooks());
    },
    async to_lower(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        return Logic.toLower(await getSourceItems(src, !!meta.normalize_before), null, getHooks());
    },
    async reverse(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        return Logic.reverse(await getSourceItems(src, !!meta.normalize_before), null, getHooks());
    },
    async dedupe_chars(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        return Logic.dedupeChars(await getSourceItems(src, !!meta.normalize_before), null, getHooks());
    },
    async replace(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        return Logic.replace(await getSourceItems(src, !!meta.normalize_before), { from: meta.from, to: meta.to }, getHooks());
    },
    async sort(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        return Logic.sort(await getSourceItems(src, !!meta.normalize_before), { order: meta.order, locale: meta.locale });
    },
    async filter_in(meta) {
        const src = REG.get(meta.src);
        const lookup = REG.get(meta.lookup);
        if (!src || !lookup) throw new Error('source or lookup bag not found');
        const srcItems = await getSourceItems(src, !!meta.normalize_src_before);
        const lookupItems = await getSourceItems(lookup, !!meta.normalize_lookup_before);
        return Logic.filterIn(srcItems, { lookup: lookupItems }, getHooks());
    },
    async union(meta) {
        const a = REG.get(meta.src_a ?? (meta.src?.split(',')[0]));
        const b = REG.get(meta.src_b ?? (meta.src?.split(',')[1]));
        if (!a || !b) throw new Error('union source missing');
        const itemsA = await getSourceItems(a, !!meta.normalize_before);
        const itemsB = await getSourceItems(b, !!meta.normalize_before);
        return Logic.union(itemsA, { itemsB }, getHooks());
    },
    async difference(meta) {
        const a = REG.get(meta.src_a ?? (meta.src?.split(',')[0]));
        const b = REG.get(meta.src_b ?? (meta.src?.split(',')[1]));
        if (!a || !b) throw new Error('difference source missing');
        const itemsA = await getSourceItems(a, !!meta.normalize_before);
        const itemsB = await getSourceItems(b, !!meta.normalize_before);
        return Logic.difference(itemsA, { itemsB }, getHooks());
    },
    async intersection(meta) {
        const a = REG.get(meta.src_a ?? (meta.src?.split(',')[0]));
        const b = REG.get(meta.src_b ?? (meta.src?.split(',')[1]));
        if (!a || !b) throw new Error('intersection source missing');
        const itemsA = await getSourceItems(a, !!meta.normalize_before);
        const itemsB = await getSourceItems(b, !!meta.normalize_before);
        return Logic.intersection(itemsA, { itemsB }, getHooks());
    },
    async symmetric_difference(meta) {
        const a = REG.get(meta.src_a ?? (meta.src?.split(',')[0]));
        const b = REG.get(meta.src_b ?? (meta.src?.split(',')[1]));
        if (!a || !b) throw new Error('symmetric difference source missing');
        const itemsA = await getSourceItems(a, !!meta.normalize_before);
        const itemsB = await getSourceItems(b, !!meta.normalize_before);
        return Logic.symmetricDifference(itemsA, { itemsB }, getHooks());
    },
    async filter_length(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const min = Number.isFinite(meta.min) ? meta.min : Number(meta.range?.split('-')[0]) || 0;
        const max = Number.isFinite(meta.max) ? meta.max : Number(meta.range?.split('-')[1]) || min;
        return Logic.filterLength(await getSourceItems(src, !!meta.normalize_before), { min, max }, getHooks());
    },
    async filter_prefix(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const prefix = await normQuery(meta.prefix || '', !!meta.normalize_before);
        return Logic.filterPrefix(await getSourceItems(src, !!meta.normalize_before), { prefix }, getHooks());
    },
    async filter_suffix(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const suffix = await normQuery(meta.suffix || '', !!meta.normalize_before);
        return Logic.filterSuffix(await getSourceItems(src, !!meta.normalize_before), { suffix }, getHooks());
    },
    async filter_contains(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const needle = await normQuery(meta.needle || meta.contains || '', !!meta.normalize_before);
        return Logic.filterContains(await getSourceItems(src, !!meta.normalize_before), { needle }, getHooks());
    },
    async filter_regex(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        return Logic.filterRegex(await getSourceItems(src, !!meta.normalize_before), { pattern: meta.pattern, invert: !!meta.invert }, getHooks());
    },
    async ngrams(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        return Logic.ngrams(await getSourceItems(src, !!meta.normalize_before), { n: meta.n }, getHooks());
    },
    async sample(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        return Logic.sample(await getSourceItems(src, !!meta.normalize_before), { count: meta.count, seed: meta.seed });
    },
    async cartesian(meta) {
        const a = REG.get(meta.src_a);
        const b = REG.get(meta.src_b);
        if (!a || !b) throw new Error('source missing');
        const itemsA = await getSourceItems(a, !!meta.normalize_before);
        const itemsB = await getSourceItems(b, !!meta.normalize_before);
        return Logic.cartesian(itemsA, { itemsB, sep: meta.sep, limit: meta.limit }, getHooks());
    },
    async append(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        return Logic.append(await getSourceItems(src, !!meta.normalize_before), { prefix: meta.prefix, suffix: meta.suffix }, getHooks());
    },
    async anagram(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        return Logic.anagram(await getSourceItems(src, !!meta.normalize_before), null, getHooks());
    },
    async filter_similarity(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const target = await normQuery(meta.target || '', !!meta.normalize_before);
        return Logic.filterSimilarity(await getSourceItems(src, !!meta.normalize_before), { target, dist: meta.dist }, getHooks());
    },
    async clone(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('clone source not found');
        return new Set(src.items);
    },
    async manual_edit() {
        return null;
    }
};

/* Recompute Helpers */
async function recomputeBagByMeta(bag) {
    const meta = bag?.meta || {};
    const op = meta.op;
    if (!op) return { changed: false, reason: 'no-op' };
    const runner = OP_REBUILDERS[op];
    if (!runner) return { changed: false, reason: 'unsupported' };

    const before = bag.items instanceof Set ? new Set(bag.items) : new Set(Array.from(bag.items || []));

    // Execute logic
    const result = await runner(meta);
    if (!result) {
        bag.meta.reapplied_at = nowISO();
        return { changed: false, reason: 'no-change' };
    }

    const nextItems = result instanceof Set ? result : new Set(result);
    const changed = !setsAreEqual(before, nextItems);
    bag.items = nextItems;
    bag.meta.size = bag.items.size;
    bag.meta.reapplied_at = nowISO();
    if (changed) bag.meta.updated_at = nowISO();
    return { changed, reason: changed ? 'updated' : 'no-change' };
}

/* 
 * Reapply Series Orchestrator
 */
export async function reapplySeries(limitBagId = null, callbacks = {}) {
    const limit = limitBagId === null ? null : Number(limitBagId);
    const label = limit === null ? 'all bags' : `bag ${limit}`;
    appendOpLog(`↻ Reapply start (${label})`);
    const bags = REG.all();
    let updated = 0;
    for (const bag of bags) {
        try {
            const runnable = bag?.meta?.op && OP_REBUILDERS[bag.meta.op];
            if (!runnable) {
                bag.meta.reapply_status = '⏭ 再適用対象外';
                delete bag.meta.reapply_error;
                if (callbacks.onStatus) callbacks.onStatus(bag.id, bag.meta.reapply_status);
            } else {
                bag.meta.reapply_status = '⟳ 再適用中…';
                if (callbacks.onStatus) callbacks.onStatus(bag.id, bag.meta.reapply_status);

                const result = await recomputeBagByMeta(bag);

                delete bag.meta.reapply_error;
                if (result.changed) {
                    updated += 1;
                    bag.meta.reapply_status = `✓ 更新(${bag.items.size})`;
                } else {
                    bag.meta.reapply_status = '＝ 変更なし';
                }
                if (callbacks.onStatus) callbacks.onStatus(bag.id, bag.meta.reapply_status);
            }
        } catch (e) {
            console.error(e);
            const msg = e.message || e.toString();
            appendOpLog(`× Reapply failed [${bag.id}] ${bag.name}: ${msg}`);
            bag.meta.reapply_error = msg;
            bag.meta.reapplied_at = nowISO();
            bag.meta.reapply_status = `× エラー: ${msg}`;
            if (callbacks.onStatus) callbacks.onStatus(bag.id, bag.meta.reapply_status);
            break;
        }
        if (limit !== null && bag.id === limit) break;
    }
    if (updated > 0) {
        appendOpLog(`✓ Reapply finished (updated ${updated})`);
    } else {
        appendOpLog(`✓ Reapply finished (no changes)`);
    }
    if (callbacks.onUpdate) callbacks.onUpdate();
}
