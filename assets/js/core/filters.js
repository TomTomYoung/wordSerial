/**
 * @fileoverview Filter operations.
 * @summary Provides various filtering strategies for string collections.
 * @description
 * Contains filtering logic based on string properties (length, containment),
 * regular expressions, and similarity metrics.
 *
 * @module core/filters
 * @requires core/utils
 * @requires core/text
 * @exports
 *  filterLength, filterPrefix, filterSuffix, filterContains, filterRegex, filterSimilarity,
 *  filterNormalizedEquals, filterNormalizedContains,
 *  filterScript, filterUnicodeProperty,
 *  filterSubsequence, filterCharAt,
 *  filterNgramJaccard, filterHamming,
 *  filterPatternPreset,
 *  filterIntersection, filterDifference
 */

import { processWithBatching } from './utils.js';
import { normNFKC, levenshtein } from './text.js';

export async function filterLength(items, { min, max }, hooks) {
    return processWithBatching(items, w => {
        const len = normNFKC(w).length;
        return (len >= min && len <= max) ? w : null;
    }, hooks);
}

export async function filterPrefix(items, { prefix }, hooks) {
    if (!prefix) return new Set();
    return processWithBatching(items, w => normNFKC(w).startsWith(prefix) ? w : null, hooks);
}

export async function filterSuffix(items, { suffix }, hooks) {
    if (!suffix) return new Set();
    return processWithBatching(items, w => normNFKC(w).endsWith(suffix) ? w : null, hooks);
}

export async function filterContains(items, { needle }, hooks) {
    if (!needle) return new Set();
    return processWithBatching(items, w => normNFKC(w).includes(needle) ? w : null, hooks);
}

export async function filterRegex(items, { pattern, invert }, hooks) {
    if (!pattern) return new Set();
    const re = new RegExp(pattern, 'u');
    return processWithBatching(items, w => {
        const matched = re.test(w);
        return ((matched && !invert) || (!matched && invert)) ? w : null;
    }, hooks);
}

/**
 * Filters items by Levenshtein distance (edit distance).
 * Keeps items where distance to target is <= dist.
 * @param {Iterable} items
 * @param {object} params - { target, dist }
 * @param {object} hooks
 */
export async function filterSimilarity(items, { target, dist }, hooks) {
    if (!target) return new Set();
    const d = Number.isFinite(dist) ? dist : 2;
    return processWithBatching(items, w => {
        return levenshtein(w, target) <= d ? w : null;
    }, hooks);
}

/**
 * Filters items by normalized equality (NFKC).
 * Keeps items where normNFKC(item) === normNFKC(target).
 * Useful for collapsing fullwidth/halfwidth, composed/decomposed variants, etc.
 * @param {Iterable} items
 * @param {object} params - { target }
 * @param {object} hooks
 */
export async function filterNormalizedEquals(items, { target }, hooks) {
    if (!target) return new Set();
    const t = normNFKC(target);
    return processWithBatching(items, w => (normNFKC(w) === t) ? w : null, hooks);
}

/**
 * Filters items by normalized containment (NFKC).
 * Keeps items where normNFKC(item).includes(normNFKC(needle)).
 * @param {Iterable} items
 * @param {object} params - { needle }
 * @param {object} hooks
 */
export async function filterNormalizedContains(items, { needle }, hooks) {
    if (!needle) return new Set();
    const n = normNFKC(needle);
    return processWithBatching(items, w => (normNFKC(w).includes(n)) ? w : null, hooks);
}

/**
 * Filters items by Unicode Script / Emoji presence using Unicode property escapes.
 * Keeps items if they contain at least one character of the given script (or emoji-like).
 * Supported examples:
 *  script: "Hiragana" | "Katakana" | "Han" | "Latin" | "Cyrillic" | ...
 *  script: "Emoji" (uses Extended_Pictographic)
 * @param {Iterable} items
 * @param {object} params - { script, invert }
 * @param {object} hooks
 */
export async function filterScript(items, { script, invert }, hooks) {
    if (!script) return new Set();

    let re;
    if (script === 'Emoji') {
        re = /\p{Extended_Pictographic}/u;
    } else {
        // Examples: \p{Script=Hiragana}, \p{Script=Han}
        re = new RegExp(`\\p{Script=${script}}`, 'u');
    }

    return processWithBatching(items, w => {
        const matched = re.test(w);
        return ((matched && !invert) || (!matched && invert)) ? w : null;
    }, hooks);
}

/**
 * Filters items by an arbitrary Unicode property escape test.
 * Keeps items if they contain at least one character matching \p{property}.
 * Examples:
 *  property: "Letter"
 *  property: "Number"
 *  property: "Script=Hiragana"
 *  property: "General_Category=Decimal_Number"
 * @param {Iterable} items
 * @param {object} params - { property, invert }
 * @param {object} hooks
 */
export async function filterUnicodeProperty(items, { property, invert }, hooks) {
    if (!property) return new Set();

    let re;
    try {
        re = new RegExp(`\\p{${property}}`, 'u');
    } catch (e) {
        // Invalid property expression: treat as no-op (empty result) rather than throwing.
        return new Set();
    }

    return processWithBatching(items, w => {
        const matched = re.test(w);
        return ((matched && !invert) || (!matched && invert)) ? w : null;
    }, hooks);
}

/**
 * Filters items by subsequence match (ordered, not necessarily contiguous).
 * Keeps items where all characters of needle appear in order within the item.
 * Useful for fuzzy "typeahead" matching without full edit distance.
 * @param {Iterable} items
 * @param {object} params - { needle, normalize=true }
 * @param {object} hooks
 */
export async function filterSubsequence(items, { needle, normalize = true }, hooks) {
    if (!needle) return new Set();

    const n = normalize ? normNFKC(needle) : String(needle);
    if (n.length === 0) return new Set();

    return processWithBatching(items, w => {
        const s = normalize ? normNFKC(w) : String(w);

        let i = 0;
        for (let j = 0; j < s.length && i < n.length; j++) {
            if (s[j] === n[i]) i++;
        }
        return (i === n.length) ? w : null;
    }, hooks);
}

/**
 * Filters items by a specific character at a specific index (after normalization).
 * Supports negative indices (e.g., -1 is last character).
 * @param {Iterable} items
 * @param {object} params - { index, char }
 * @param {object} hooks
 */
export async function filterCharAt(items, { index, char }, hooks) {
    if (!Number.isInteger(index)) return new Set();
    if (char === undefined || char === null) return new Set();

    const c = normNFKC(String(char));
    if (c.length === 0) return new Set();

    return processWithBatching(items, w => {
        const s = normNFKC(w);
        const idx = index < 0 ? (s.length + index) : index;
        if (idx < 0 || idx >= s.length) return null;
        return (s[idx] === c) ? w : null;
    }, hooks);
}

function ngramsOf(s, n) {
    const out = new Set();
    if (!Number.isInteger(n) || n <= 0) return out;
    if (s.length < n) return out;
    for (let i = 0; i <= s.length - n; i++) out.add(s.slice(i, i + n));
    return out;
}

function jaccard(a, b) {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;

    let inter = 0;
    // iterate smaller set for speed
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    for (const x of small) if (large.has(x)) inter++;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : (inter / union);
}

/**
 * Filters items by n-gram Jaccard similarity against a target (after normalization).
 * Keeps items where similarity >= min.
 * Typical settings: n=2..3, min=0.3..0.7 depending on strictness.
 * @param {Iterable} items
 * @param {object} params - { target, n=2, min=0.5 }
 * @param {object} hooks
 */
export async function filterNgramJaccard(items, { target, n = 2, min = 0.5 }, hooks) {
    if (!target) return new Set();
    const nn = Number.isFinite(n) ? Math.trunc(n) : 2;
    const thr = Number.isFinite(min) ? min : 0.5;

    const t = normNFKC(target);
    const tg = ngramsOf(t, nn);

    return processWithBatching(items, w => {
        const s = normNFKC(w);
        const sg = ngramsOf(s, nn);
        return (jaccard(sg, tg) >= thr) ? w : null;
    }, hooks);
}

/**
 * Filters items by Hamming-like distance to a target (after normalization).
 * Default behavior requires equal length; optionally count length difference as distance.
 * Keeps items where distance <= max.
 * @param {Iterable} items
 * @param {object} params - { target, max=1, allowDifferentLength=false }
 * @param {object} hooks
 */
export async function filterHamming(items, { target, max = 1, allowDifferentLength = false }, hooks) {
    if (!target) return new Set();
    const m = Number.isFinite(max) ? Math.trunc(max) : 1;

    const t = normNFKC(target);

    return processWithBatching(items, w => {
        const s = normNFKC(w);

        if (!allowDifferentLength && s.length !== t.length) return null;

        const L = Math.min(s.length, t.length);
        let d = 0;

        for (let i = 0; i < L; i++) {
            if (s[i] !== t[i]) {
                d++;
                if (d > m) return null;
            }
        }

        if (allowDifferentLength) {
            d += Math.abs(s.length - t.length);
        }

        return (d <= m) ? w : null;
    }, hooks);
}

function presetRegex(preset) {
    switch (preset) {
        case 'email':
            // Pragmatic (not fully RFC), but useful for filtering candidates.
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

        case 'url':
            // Loose URL filter: requires scheme.
            return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+$/u;

        case 'integer':
            return /^[+-]?\d+$/u;

        case 'number':
            // integers or decimals
            return /^[+-]?(?:\d+|\d*\.\d+)$/u;

        case 'date_ymd':
            // YYYY-MM-DD (no calendar validation)
            return /^\d{4}-\d{2}-\d{2}$/u;

        case 'uuid':
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

        case 'hiragana':
            return /^\p{Script=Hiragana}+$/u;

        case 'katakana':
            return /^\p{Script=Katakana}+$/u;

        case 'kanji':
            return /^\p{Script=Han}+$/u;

        case 'kana':
            // Hiragana or Katakana (fullwidth); includes prolonged sound mark.
            return /^(?:\p{Script=Hiragana}|\p{Script=Katakana}|ー)+$/u;

        default:
            return null;
    }
}

/**
 * Filters items by a named preset pattern (common validation-ish filters).
 * Presets: email, url, integer, number, date_ymd, uuid, hiragana, katakana, kanji, kana.
 * Keeps items where the preset regex matches; invert flips the sense.
 * @param {Iterable} items
 * @param {object} params - { preset, invert }
 * @param {object} hooks
 */
export async function filterPatternPreset(items, { preset, invert }, hooks) {
    if (!preset) return new Set();
    const re = presetRegex(preset);
    if (!re) return new Set();

    return processWithBatching(items, w => {
        const matched = re.test(normNFKC(w));
        return ((matched && !invert) || (!matched && invert)) ? w : null;
    }, hooks);
}

/**
 * Filters items by set intersection with a reference collection.
 * Keeps items that exist in `withSet` (by === / SameValueZero via Set semantics).
 * @param {Iterable} items
 * @param {object} params - { withSet: Iterable }
 * @param {object} hooks
 */
export async function filterIntersection(items, { withSet }, hooks) {
    if (!withSet) return new Set();
    const ref = (withSet instanceof Set) ? withSet : new Set(withSet);

    return processWithBatching(items, w => (ref.has(w) ? w : null), hooks);
}

/**
 * Filters items by set difference against a reference collection.
 * Keeps items that do NOT exist in `withoutSet`.
 * @param {Iterable} items
 * @param {object} params - { withoutSet: Iterable }
 * @param {object} hooks
 */
export async function filterDifference(items, { withoutSet }, hooks) {
    if (!withoutSet) return new Set();
    const ref = (withoutSet instanceof Set) ? withoutSet : new Set(withoutSet);

    return processWithBatching(items, w => (!ref.has(w) ? w : null), hooks);
}
