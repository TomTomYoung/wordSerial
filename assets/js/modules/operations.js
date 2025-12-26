import { REG, Bag } from './models.js';
import {
    toHiragana, toKatakana, toRomaji, waitFrame,
    nowISO, appendOpLog, getBatchSize
} from './utils.js';
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

export async function op_normalize_hiragana(srcBag) {
    const out = await Logic.normalize(srcBag.items, null, {
        ...getHooks(),
        converter: toHiragana
    });
    return new Bag(`${srcBag.name} → normalize(hiragana)`, out, { op: 'normalize_hiragana', src: srcBag.id, normalized: 'hiragana' });
}

export async function op_normalize_katakana(srcBag) {
    // Logic.normalize uses converter, so we can reuse it with katakana converter?
    // Logic.normalize implementation: const res = converter ? await converter(w) : w; return res ? res.replace(/\s+/g, '') : null;
    // Yes, essentially same structure.
    const out = await Logic.normalize(srcBag.items, null, {
        ...getHooks(),
        converter: toKatakana
    });
    return new Bag(`${srcBag.name} → normalize(katakana)`, out, { op: 'normalize_katakana', src: srcBag.id, normalized: 'katakana' });
}

export async function op_to_romaji(srcBag, normalizeBefore = false) {
    const srcItems = await getSourceItems(srcBag, normalizeBefore);
    const out = await Logic.toRomaji(srcItems, null, {
        ...getHooks(),
        converter: toRomaji
    });
    return new Bag(`${srcBag.name} → to_romaji`, out, { op: 'to_romaji', src: srcBag.id, normalized: 'romaji', normalize_before: normalizeBefore });
}

export async function op_delete_chars(srcBag, chars, normalizeInput = false, normalizeBefore = false) {
    const del = normalizeInput ? await toHiragana(chars) : normNFKC(chars);
    const srcItems = await getSourceItems(srcBag, normalizeBefore);
    const out = await Logic.deleteChars(srcItems, { chars: del }, getHooks());

    // Logic.deleteChars returns modified items. 
    // Original op_delete_chars logic: "if (wNew !== w) out.add(wNew);" -> Only added if changed?
    // Wait, original line 80: `if (wNew !== w) out.add(wNew);`
    // Yes. My Logic.deleteChars implementation does `return wNew !== w ? wNew : null`.
    // So if it returns a Set of non-nulls, it matches the original behavior.

    return new Bag(`${srcBag.name} → delete(${del || '∅'})`, out, {
        op: 'delete_chars',
        src: srcBag.id,
        deleted: del,
        normalize_input: normalizeInput,
        normalize_before: normalizeBefore
    });
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
