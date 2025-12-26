import { REG, Bag } from './models.js';
import {
    toHiragana, toKatakana, toRomaji, waitFrame,
    nowISO, appendOpLog, getBatchSize
} from './utils.js';
import * as Kuro from '../lib/kuro.js';
import { Logic, normNFKC, setsAreEqual } from './logic.js';

/* ====== Helpers ====== */

// Bridge to provide logic hooks
const getHooks = () => ({
    yielder: waitFrame,
    batchSize: getBatchSize()
});

const getConverter = (type) => {
    if (type === 'hiragana') return toHiragana;
    if (type === 'katakana') return toKatakana;
    if (type === 'romaji') return toRomaji;
    return async s => s;
};

// Common normalization wrapper
async function getSourceItems(bag, normalizeBefore) {
    if (!bag) return new Set();
    const items = bag.items;
    if (!normalizeBefore) return items;
    return await Logic.normalize(items, null, {
        ...getHooks(),
        converter: toHiragana
    });
}

// Common query normalizer
async function normQuery(val, normalizeBefore) {
    const base = normNFKC(val || '');
    if (!base) return '';
    if (!normalizeBefore) return base;
    const h = await toHiragana(base);
    return normNFKC((h || '').replace(/\s+/g, ''));
}

/* ====== Ops (Serial) ====== */

// Helper to run operations progressively
async function runProgressiveOp(bagName, meta, logicFn) {
    // Create Bag in 'processing' state
    const bag = new Bag(bagName, [], { ...meta, status: 'processing' });
    REG.add(bag); // Register immediately so it appears in UI

    // Run logic in background
    (async () => {
        try {
            const onChunk = (chunk) => {
                for (const item of chunk) bag.items.add(item);
                bag.updateProgress(bag.items.size, 0); // Total unknown for filters, or we could pass src size
                // Trigger UI update check? Ideally UI polls or we have an event. 
                // For now, simple object update. UI needs to react.
            };

            // Inject onChunk into hooks
            const hooks = { ...getHooks(), onChunk };

            await logicFn(hooks);

            bag.finish();
        } catch (e) {
            console.error("Progressive Op Failed", e);
            bag.meta.status = 'error';
            bag.meta.error = e.message;
        }
    })();

    return bag;
}

export async function op_clone(srcBag) {
    // Special Case: Clone works on Processing bags too (Snapshot)
    const items = new Set(srcBag.items); // Snapshot current items
    const name = `${srcBag.name} (copy)`;
    return new Bag(name, items, {
        op: 'clone',
        src: srcBag.id,
        status: 'ready' // Explicitly ready
    });
}

export async function op_normalize_hiragana(srcBag) {
    await Kuro.ensureKuro();
    const K = Kuro.getK();
    const fastConverter = async (s) => await K.convert(normNFKC(s), { to: 'hiragana', mode: 'spaced' });

    return runProgressiveOp(`${srcBag.name} → normalize(hiragana)`,
        { op: 'normalize_hiragana', src: srcBag.id, normalized: 'hiragana' },
        async (hooks) => {
            await Logic.normalize(srcBag.items, null, { ...hooks, converter: fastConverter });
        }
    );
}

export async function op_normalize_katakana(srcBag) {
    await Kuro.ensureKuro();
    const K = Kuro.getK();
    const fastConverter = async (s) => await K.convert(normNFKC(s), { to: 'katakana', mode: 'spaced' });

    return runProgressiveOp(`${srcBag.name} → normalize(katakana)`,
        { op: 'normalize_katakana', src: srcBag.id, normalized: 'katakana' },
        async (hooks) => {
            await Logic.normalize(srcBag.items, null, { ...hooks, converter: fastConverter });
        }
    );
}

export async function op_to_upper(srcBag, normalizeBefore = false) {
    const srcItems = await getSourceItems(srcBag, normalizeBefore);
    const out = await Logic.toUpper(srcItems, null, getHooks());
    return new Bag(`${srcBag.name} → upper`, out, { op: 'to_upper', src: srcBag.id, case: 'upper', normalize_before: normalizeBefore });
}

export async function op_to_lower(srcBag, normalizeBefore = false) {
    const srcItems = await getSourceItems(srcBag, normalizeBefore);
    const out = await Logic.toLower(srcItems, null, getHooks());
    return new Bag(`${srcBag.name} → lower`, out, { op: 'to_lower', src: srcBag.id, case: 'lower', normalize_before: normalizeBefore });
}

export async function op_reverse(srcBag, normalizeBefore = false) {
    const srcItems = await getSourceItems(srcBag, normalizeBefore);
    const out = await Logic.reverse(srcItems, null, getHooks());
    return new Bag(`${srcBag.name} → reverse`, out, { op: 'reverse', src: srcBag.id, normalize_before: normalizeBefore });
}

export async function op_dedupe_chars(srcBag, normalizeBefore = false) {
    const srcItems = await getSourceItems(srcBag, normalizeBefore);
    const out = await Logic.dedupeChars(srcItems, null, getHooks());
    return new Bag(`${srcBag.name} → dedupe_chars`, out, { op: 'dedupe_chars', src: srcBag.id, normalize_before: normalizeBefore });
}

export async function op_replace(srcBag, fromValue, toValue, normalizeBefore = false) {
    const needle = normNFKC(fromValue);
    const replacement = normNFKC(toValue ?? '');
    const srcItems = await getSourceItems(srcBag, normalizeBefore);
    const out = await Logic.replace(srcItems, { from: needle, to: replacement }, getHooks());
    return new Bag(`${srcBag.name} → replace(${needle}→${replacement})`, out, { op: 'replace', src: srcBag.id, from: needle, to: replacement, normalize_before: normalizeBefore });
}

export async function op_sort(srcBag, order = 'asc', locale = 'ja', normalizeBefore = false) {
    const srcItems = await getSourceItems(srcBag, normalizeBefore);
    const out = await Logic.sort(srcItems, { order, locale });
    return new Bag(`${srcBag.name} → sort(${order})`, out, { op: 'sort', src: srcBag.id, order, locale, normalize_before: normalizeBefore });
}

export async function op_filter_in(srcBag, lookupBag, normalizeSrc = false, normalizeLookup = false) {
    const srcItems = await getSourceItems(srcBag, normalizeSrc);
    const lookupItems = await getSourceItems(lookupBag, normalizeLookup);
    const out = await Logic.filterIn(srcItems, { lookup: lookupItems }, getHooks());
    return new Bag(`${srcBag.name} → filter_in([${lookupBag.id}:${lookupBag.name}])`, out, {
        op: 'filter_in',
        src: srcBag.id,
        lookup: lookupBag.id,
        normalize_src_before: normalizeSrc,
        normalize_lookup_before: normalizeLookup
    });
}

export async function op_union(bagA, bagB, normalizeBefore = false) {
    const srcItemsA = await getSourceItems(bagA, normalizeBefore);
    const srcItemsB = await getSourceItems(bagB, normalizeBefore);
    const out = await Logic.union(srcItemsA, { itemsB: srcItemsB }, getHooks());
    return new Bag(`${bagA.name} ∪ ${bagB.name}`, out, {
        op: 'union',
        src: [bagA.id, bagB.id].join(','),
        src_a: bagA.id,
        src_b: bagB.id,
        size_a: bagA.items.size,
        size_b: bagB.items.size,
        normalize_before: normalizeBefore
    });
}

export async function op_difference(bagA, bagB, normalizeBefore = false) {
    const srcItemsA = await getSourceItems(bagA, normalizeBefore);
    const srcItemsB = await getSourceItems(bagB, normalizeBefore);
    const out = await Logic.difference(srcItemsA, { itemsB: srcItemsB }, getHooks());
    return new Bag(`${bagA.name} - ${bagB.name}`, out, {
        op: 'difference',
        src: [bagA.id, bagB.id].join(','),
        src_a: bagA.id,
        src_b: bagB.id,
        size_a: bagA.items.size,
        size_b: bagB.items.size,
        normalize_before: normalizeBefore
    });
}

export async function op_intersection(bagA, bagB, normalizeBefore = false) {
    const srcItemsA = await getSourceItems(bagA, normalizeBefore);
    const srcItemsB = await getSourceItems(bagB, normalizeBefore);
    const out = await Logic.intersection(srcItemsA, { itemsB: srcItemsB }, getHooks());
    return new Bag(`${bagA.name} ∩ ${bagB.name}`, out, {
        op: 'intersection',
        src: [bagA.id, bagB.id].join(','),
        src_a: bagA.id,
        src_b: bagB.id,
        size_a: bagA.items.size,
        size_b: bagB.items.size,
        normalize_before: normalizeBefore
    });
}

export async function op_symmetric_difference(bagA, bagB, normalizeBefore = false) {
    const srcItemsA = await getSourceItems(bagA, normalizeBefore);
    const srcItemsB = await getSourceItems(bagB, normalizeBefore);
    const out = await Logic.symmetricDifference(srcItemsA, { itemsB: srcItemsB }, getHooks());
    return new Bag(`${bagA.name} △ ${bagB.name}`, out, {
        op: 'symmetric_difference',
        src: [bagA.id, bagB.id].join(','),
        src_a: bagA.id,
        src_b: bagB.id,
        size_a: bagA.items.size,
        size_b: bagB.items.size,
        normalize_before: normalizeBefore
    });
}

export async function op_filter_length(bag, minLen, maxLen, normalizeBefore = false) {
    const srcItems = await getSourceItems(bag, normalizeBefore);
    const out = await Logic.filterLength(srcItems, { min: minLen, max: maxLen }, getHooks());
    return new Bag(`${bag.name} → length[${minLen}-${maxLen}]`, out, {
        op: 'filter_length',
        src: bag.id,
        range: `${minLen}-${maxLen}`,
        min: minLen,
        max: maxLen,
        normalize_before: normalizeBefore
    });
}

export async function op_filter_prefix(bag, prefixRaw, normalizeBefore = false) {
    const needle = await normQuery(prefixRaw, normalizeBefore);
    const srcItems = await getSourceItems(bag, normalizeBefore);
    const out = await Logic.filterPrefix(srcItems, { prefix: needle }, getHooks());
    return new Bag(`${bag.name} → prefix(${needle || '∅'})`, out, { op: 'filter_prefix', src: bag.id, prefix: needle, normalize_before: normalizeBefore });
}

export async function op_filter_suffix(bag, suffixRaw, normalizeBefore = false) {
    const needle = await normQuery(suffixRaw, normalizeBefore);
    const srcItems = await getSourceItems(bag, normalizeBefore);
    const out = await Logic.filterSuffix(srcItems, { suffix: needle }, getHooks());
    return new Bag(`${bag.name} → suffix(${needle || '∅'})`, out, { op: 'filter_suffix', src: bag.id, suffix: needle, normalize_before: normalizeBefore });
}

export async function op_filter_contains(bag, needleRaw, normalizeBefore = false) {
    const needle = await normQuery(needleRaw, normalizeBefore);
    const srcItems = await getSourceItems(bag, normalizeBefore);
    const out = await Logic.filterContains(srcItems, { needle }, getHooks());
    return new Bag(`${bag.name} → contains(${needle || '∅'})`, out, { op: 'filter_contains', src: bag.id, needle, normalize_before: normalizeBefore });
}

export async function op_filter_regex(bag, pattern, invert, normalizeBefore = false) {
    const srcItems = await getSourceItems(bag, normalizeBefore);
    const out = await Logic.filterRegex(srcItems, { pattern, invert }, getHooks());
    return new Bag(`${bag.name} → regex(${pattern}${invert ? ', invert' : ''})`, out, { op: 'filter_regex', src: bag.id, pattern, invert, normalize_before: normalizeBefore });
}

export async function op_ngrams(bag, n, normalizeBefore = false) {
    const srcItems = await getSourceItems(bag, normalizeBefore);
    const out = await Logic.ngrams(srcItems, { n }, getHooks());
    return new Bag(`${bag.name} → ngram(n=${n})`, out, { op: 'ngrams', src: bag.id, n, normalize_before: normalizeBefore });
}

export async function op_sample(bag, count, seed, normalizeBefore = false) {
    const srcItems = await getSourceItems(bag, normalizeBefore);
    const out = await Logic.sample(srcItems, { count, seed });
    return new Bag(`${bag.name} → sample(${out.size})`, out, { op: 'sample', src: bag.id, size: bag.items.size, count, seed: seed || null, normalize_before: normalizeBefore });
}

export async function op_cartesian(bagA, bagB, sep, limit, normalizeBefore = false) {
    const srcItemsA = await getSourceItems(bagA, normalizeBefore);
    const srcItemsB = await getSourceItems(bagB, normalizeBefore);
    const out = await Logic.cartesian(srcItemsA, { itemsB: srcItemsB, sep, limit }, getHooks());
    return new Bag(`${bagA.name} x ${bagB.name}`, out, {
        op: 'cartesian',
        src: [bagA.id, bagB.id].join(','),
        src_a: bagA.id,
        src_b: bagB.id,
        sep,
        limit,
        normalize_before: normalizeBefore
    });
}

export async function op_append(bag, prefix, suffix, normalizeBefore = false) {
    const srcItems = await getSourceItems(bag, normalizeBefore);
    const out = await Logic.append(srcItems, { prefix, suffix }, getHooks());
    return new Bag(`${bag.name} → append`, out, { op: 'append', src: bag.id, prefix, suffix, normalize_before: normalizeBefore });
}

export async function op_anagram(bag, normalizeBefore = false) {
    const srcItems = await getSourceItems(bag, normalizeBefore);
    const out = await Logic.anagram(srcItems, null, getHooks());
    return new Bag(`${bag.name} → anagram`, out, { op: 'anagram', src: bag.id, normalize_before: normalizeBefore });
}

export async function op_filter_similarity(bag, targetRaw, dist, normalizeBefore = false) {
    const target = await normQuery(targetRaw, normalizeBefore);
    const srcItems = await getSourceItems(bag, normalizeBefore);
    const out = await Logic.filterSimilarity(srcItems, { target, dist }, getHooks());
    return new Bag(`${bag.name} → similarity(${target},${dist})`, out, { op: 'filter_similarity', src: bag.id, target, dist, normalize_before: normalizeBefore });
}

/* ====== OP_REBUILDERS ====== */
/* ====== Re-exports for Runner ====== */
export { getHooks, getSourceItems, normQuery };
