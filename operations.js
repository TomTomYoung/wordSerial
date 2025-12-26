import { REG, Bag } from './models.js';
import {
    toHiragana, toKatakana, toRomaji, normNFKC, waitFrame,
    mulberry32, makeSeedFromString, setsAreEqual, levenshtein,
    nowISO, appendOpLog, setBagStatusMessage, log, getBatchSize
} from './utils.js';

async function convertItemsToHiragana(items) {
    const out = [];
    let i = 0;
    for (const w of items) {
        const h = await toHiragana(w);
        if (h) out.push(h.replace(/\s+/g, ''));
        if (++i % Math.min(getBatchSize(), 10) === 0) await waitFrame();
    }
    return out;
}

async function maybeNormalizeItems(items, shouldNormalize) {
    if (!shouldNormalize) return new Set(items);
    const arr = await convertItemsToHiragana(items);
    return new Set(arr);
}

async function maybeNormalizeBagItems(bag, shouldNormalize) {
    if (!bag) return new Set();
    return maybeNormalizeItems(bag.items, shouldNormalize);
}

async function maybeNormalizeQueryValue(value, shouldNormalize) {
    const base = normNFKC(value || '');
    if (!base) return '';
    if (!shouldNormalize) return base;
    const hira = await toHiragana(base);
    const normalized = normNFKC((hira || '').replace(/\s+/g, ''));
    return normalized || base;
}

/* ====== Ops (Serial) ====== */
export async function op_normalize_hiragana(srcBag) {
    const out = new Set();
    let i = 0;
    for (const w of srcBag.items) {
        const h = await toHiragana(w);
        if (h) out.add(h.replace(/\s+/g, ''));
        if (++i % Math.min(getBatchSize(), 10) === 0) await waitFrame();
    }
    return new Bag(`${srcBag.name} → normalize(hiragana)`, out, { op: 'normalize_hiragana', src: srcBag.id, normalized: 'hiragana' });
}
export async function op_normalize_katakana(srcBag) {
    const out = new Set();
    let i = 0;
    for (const w of srcBag.items) {
        const h = await toKatakana(w);
        if (h) out.add(h.replace(/\s+/g, ''));
        if (++i % Math.min(getBatchSize(), 10) === 0) await waitFrame();
    }
    return new Bag(`${srcBag.name} → normalize(katakana)`, out, { op: 'normalize_katakana', src: srcBag.id, normalized: 'katakana' });
}
export async function op_to_romaji(srcBag, normalizeBefore = false) {
    const srcItems = await maybeNormalizeBagItems(srcBag, normalizeBefore);
    const out = new Set();
    let i = 0;
    for (const w of srcItems) {
        const r = await toRomaji(w);
        if (r) out.add(r.replace(/\s+/g, ''));
        if (++i % Math.min(getBatchSize(), 10) === 0) await waitFrame();
    }
    return new Bag(`${srcBag.name} → to_romaji`, out, { op: 'to_romaji', src: srcBag.id, normalized: 'romaji', normalize_before: normalizeBefore });
}
export async function op_delete_chars(srcBag, chars, normalizeInput = false, normalizeBefore = false) {
    const del = normalizeInput ? await toHiragana(chars) : normNFKC(chars);
    const dels = Array.from(new Set((del || '').split('')));
    const srcItems = await maybeNormalizeBagItems(srcBag, normalizeBefore);
    const out = new Set();
    for (const w of srcItems) {
        let wNew = w;
        for (const c of dels) if (c) wNew = wNew.split(c).join('');
        if (wNew !== w) out.add(wNew);
    }
    return new Bag(`${srcBag.name} → delete(${dels.join('') || '∅'})`, out, {
        op: 'delete_chars',
        src: srcBag.id,
        deleted: dels.join(''),
        normalize_input: normalizeInput,
        normalize_before: normalizeBefore
    });
}
export async function op_to_upper(srcBag, normalizeBefore = false) {
    const srcItems = await maybeNormalizeBagItems(srcBag, normalizeBefore);
    const out = new Set();
    for (const w of srcItems) {
        out.add(normNFKC(w).toUpperCase());
    }
    return new Bag(`${srcBag.name} → upper`, out, { op: 'to_upper', src: srcBag.id, case: 'upper', normalize_before: normalizeBefore });
}
export async function op_to_lower(srcBag, normalizeBefore = false) {
    const srcItems = await maybeNormalizeBagItems(srcBag, normalizeBefore);
    const out = new Set();
    for (const w of srcItems) {
        out.add(normNFKC(w).toLowerCase());
    }
    return new Bag(`${srcBag.name} → lower`, out, { op: 'to_lower', src: srcBag.id, case: 'lower', normalize_before: normalizeBefore });
}
export async function op_reverse(srcBag, normalizeBefore = false) {
    const srcItems = await maybeNormalizeBagItems(srcBag, normalizeBefore);
    const out = new Set();
    for (const w of srcItems) {
        const reversed = Array.from(normNFKC(w)).reverse().join('');
        if (reversed) out.add(reversed);
    }
    return new Bag(`${srcBag.name} → reverse`, out, { op: 'reverse', src: srcBag.id, normalize_before: normalizeBefore });
}
export async function op_dedupe_chars(srcBag, normalizeBefore = false) {
    const srcItems = await maybeNormalizeBagItems(srcBag, normalizeBefore);
    const out = new Set();
    for (const w of srcItems) {
        const seen = new Set();
        const result = [];
        for (const ch of Array.from(normNFKC(w))) {
            if (seen.has(ch)) continue;
            seen.add(ch);
            result.push(ch);
        }
        if (result.length) out.add(result.join(''));
    }
    return new Bag(`${srcBag.name} → dedupe_chars`, out, { op: 'dedupe_chars', src: srcBag.id, normalize_before: normalizeBefore });
}
export async function op_replace(srcBag, fromValue, toValue, normalizeBefore = false) {
    const needle = normNFKC(fromValue);
    const replacement = normNFKC(toValue ?? '');
    const srcItems = await maybeNormalizeBagItems(srcBag, normalizeBefore);
    const out = new Set();
    if (!needle) return new Bag(`${srcBag.name} → replace(∅)`, out, { op: 'replace', src: srcBag.id, from: '', to: replacement, normalize_before: normalizeBefore });
    for (const w of srcItems) {
        const normed = normNFKC(w);
        const replaced = normed.split(needle).join(replacement);
        out.add(replaced);
    }
    return new Bag(`${srcBag.name} → replace(${needle}→${replacement})`, out, { op: 'replace', src: srcBag.id, from: needle, to: replacement, normalize_before: normalizeBefore });
}
export async function op_sort(srcBag, order = 'asc', locale = 'ja', normalizeBefore = false) {
    const srcItems = await maybeNormalizeBagItems(srcBag, normalizeBefore);
    const arr = Array.from(srcItems);
    arr.sort((a, b) => normNFKC(a).localeCompare(normNFKC(b), locale));
    if (order === 'desc') arr.reverse();
    return new Bag(`${srcBag.name} → sort(${order})`, new Set(arr), { op: 'sort', src: srcBag.id, order, locale, normalize_before: normalizeBefore });
}
export async function op_filter_in(srcBag, lookupBag, normalizeSrc = false, normalizeLookup = false) {
    const srcItems = await maybeNormalizeBagItems(srcBag, normalizeSrc);
    const lookupItems = await maybeNormalizeBagItems(lookupBag, normalizeLookup);
    const out = new Set();
    for (const w of srcItems) if (lookupItems.has(w)) out.add(w);
    return new Bag(`${srcBag.name} → filter_in([${lookupBag.id}:${lookupBag.name}])`, out, {
        op: 'filter_in',
        src: srcBag.id,
        lookup: lookupBag.id,
        normalize_src_before: normalizeSrc,
        normalize_lookup_before: normalizeLookup
    });
}
export async function op_union(bagA, bagB, normalizeBefore = false) {
    const srcItemsA = await maybeNormalizeBagItems(bagA, normalizeBefore);
    const srcItemsB = await maybeNormalizeBagItems(bagB, normalizeBefore);
    const out = new Set([...srcItemsA, ...srcItemsB]);
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
    const srcItemsA = await maybeNormalizeBagItems(bagA, normalizeBefore);
    const srcItemsB = await maybeNormalizeBagItems(bagB, normalizeBefore);
    const out = new Set([...srcItemsA].filter(w => !srcItemsB.has(w)));
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
    const srcItemsA = await maybeNormalizeBagItems(bagA, normalizeBefore);
    const srcItemsB = await maybeNormalizeBagItems(bagB, normalizeBefore);
    const out = new Set();
    for (const w of srcItemsA) if (srcItemsB.has(w)) out.add(w);
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
    const srcItemsA = await maybeNormalizeBagItems(bagA, normalizeBefore);
    const srcItemsB = await maybeNormalizeBagItems(bagB, normalizeBefore);
    const out = new Set();
    for (const w of srcItemsA) if (!srcItemsB.has(w)) out.add(w);
    for (const w of srcItemsB) if (!srcItemsA.has(w)) out.add(w);
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
    const srcItems = await maybeNormalizeBagItems(bag, normalizeBefore);
    const out = new Set();
    let i = 0;
    for (const w of srcItems) {
        const len = normNFKC(w).length;
        if (len >= minLen && len <= maxLen) out.add(w);
        if (++i % getBatchSize() === 0) await waitFrame();
    }
    return new Bag(`${bag.name} → length[${minLen}-${maxLen}]`, out, {
        op: 'filter_length',
        src: bag.id,
        range: `${minLen}-${maxLen}`,
        min: minLen,
        max: maxLen,
        normalize_before: normalizeBefore
    });
}
export async function op_filter_prefix(bag, prefix, normalizeBefore = false) {
    const needle = await maybeNormalizeQueryValue(prefix, normalizeBefore);
    const out = new Set();
    if (!needle) return new Bag(`${bag.name} → prefix(∅)`, out, { op: 'filter_prefix', src: bag.id, prefix: '', normalize_before: normalizeBefore });
    const srcItems = await maybeNormalizeBagItems(bag, normalizeBefore);
    let i = 0;
    for (const w of srcItems) {
        if (normNFKC(w).startsWith(needle)) out.add(w);
        if (++i % getBatchSize() === 0) await waitFrame();
    }
    return new Bag(`${bag.name} → prefix(${needle})`, out, { op: 'filter_prefix', src: bag.id, prefix: needle, normalize_before: normalizeBefore });
}
export async function op_filter_suffix(bag, suffix, normalizeBefore = false) {
    const needle = await maybeNormalizeQueryValue(suffix, normalizeBefore);
    const out = new Set();
    if (!needle) return new Bag(`${bag.name} → suffix(∅)`, out, { op: 'filter_suffix', src: bag.id, suffix: '', normalize_before: normalizeBefore });
    const srcItems = await maybeNormalizeBagItems(bag, normalizeBefore);
    let i = 0;
    for (const w of srcItems) {
        if (normNFKC(w).endsWith(needle)) out.add(w);
        if (++i % getBatchSize() === 0) await waitFrame();
    }
    return new Bag(`${bag.name} → suffix(${needle})`, out, { op: 'filter_suffix', src: bag.id, suffix: needle, normalize_before: normalizeBefore });
}
export async function op_filter_contains(bag, needleRaw, normalizeBefore = false) {
    const needle = await maybeNormalizeQueryValue(needleRaw, normalizeBefore);
    const out = new Set();
    if (!needle) return new Bag(`${bag.name} → contains(∅)`, out, { op: 'filter_contains', src: bag.id, needle: '', normalize_before: normalizeBefore });
    const srcItems = await maybeNormalizeBagItems(bag, normalizeBefore);
    let i = 0;
    for (const w of srcItems) {
        if (normNFKC(w).includes(needle)) out.add(w);
        if (++i % getBatchSize() === 0) await waitFrame();
    }
    return new Bag(`${bag.name} → contains(${needle})`, out, { op: 'filter_contains', src: bag.id, needle, normalize_before: normalizeBefore });
}
export async function op_filter_regex(bag, pattern, invert, normalizeBefore = false) {
    const srcItems = await maybeNormalizeBagItems(bag, normalizeBefore);
    const re = new RegExp(pattern, 'u');
    const out = new Set();
    let i = 0;
    for (const w of srcItems) {
        const matched = re.test(w);
        if ((matched && !invert) || (!matched && invert)) out.add(w);
        if (++i % getBatchSize() === 0) await waitFrame();
    }
    return new Bag(`${bag.name} → regex(${pattern}${invert ? ', invert' : ''})`, out, { op: 'filter_regex', src: bag.id, pattern, invert, normalize_before: normalizeBefore });
}
export async function op_ngrams(bag, n, normalizeBefore = false) {
    const srcItems = await maybeNormalizeBagItems(bag, normalizeBefore);
    const size = Number.isFinite(n) ? Math.max(1, n) : 1;
    const out = new Set();
    let k = 0;
    for (const w of srcItems) {
        const norm = normNFKC(w);
        if (!norm || norm.length < size) continue;
        for (let i = 0; i <= norm.length - size; i += 1) {
            out.add(norm.slice(i, i + size));
        }
        if (++k % getBatchSize() === 0) await waitFrame();
    }
    return new Bag(`${bag.name} → ngram(n=${size})`, out, { op: 'ngrams', src: bag.id, n: size, normalize_before: normalizeBefore });
}

export async function op_sample(bag, count, seed, normalizeBefore = false) {
    const srcItems = await maybeNormalizeBagItems(bag, normalizeBefore);
    const items = Array.from(srcItems);
    const safeCount = Number.isFinite(count) ? count : 0;
    const need = Math.min(Math.max(0, safeCount), items.length);
    if (need === items.length) {
        return new Bag(`${bag.name} → sample(all)`, new Set(items), { op: 'sample', src: bag.id, size: bag.items.size, count: need, seed: seed || null, normalize_before: normalizeBefore });
    }
    let rand = Math.random;
    if (seed) {
        rand = mulberry32(makeSeedFromString(seed));
    }
    for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    const sampled = items.slice(0, need);
    return new Bag(`${bag.name} → sample(${need})`, new Set(sampled), { op: 'sample', src: bag.id, size: bag.items.size, count: need, seed: seed || null, normalize_before: normalizeBefore });
}

/* ====== OP_REBUILDERS ====== */
export const OP_REBUILDERS = {
    async normalize_hiragana(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        return new Set(await convertItemsToHiragana(src.items));
    },
    async normalize_katakana(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const out = new Set();
        let i = 0;
        for (const w of src.items) {
            const k = await toKatakana(w);
            if (k) out.add(k.replace(/\s+/g, ''));
            if (++i % Math.min(getBatchSize(), 10) === 0) await waitFrame();
        }
        return out;
    },
    async to_romaji(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const out = new Set();
        let i = 0;
        for (const w of srcItems) {
            const r = await toRomaji(w);
            if (r) out.add(r.replace(/\s+/g, ''));
            if (++i % Math.min(getBatchSize(), 10) === 0) await waitFrame();
        }
        return out;
    },
    async delete_chars(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const dels = Array.from(new Set((meta.deleted || '').split('')));
        const out = new Set();
        for (const w of srcItems) {
            let wNew = w;
            for (const c of dels) if (c) wNew = wNew.split(c).join('');
            if (wNew !== w) out.add(wNew);
        }
        return out;
    },
    async to_upper(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const out = new Set();
        for (const w of srcItems) out.add(normNFKC(w).toUpperCase());
        return out;
    },
    async to_lower(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const out = new Set();
        for (const w of srcItems) out.add(normNFKC(w).toLowerCase());
        return out;
    },
    async reverse(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const out = new Set();
        for (const w of srcItems) {
            const reversed = Array.from(normNFKC(w)).reverse().join('');
            if (reversed) out.add(reversed);
        }
        return out;
    },
    async dedupe_chars(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const out = new Set();
        for (const w of srcItems) {
            const seen = new Set();
            const result = [];
            for (const ch of Array.from(normNFKC(w))) {
                if (seen.has(ch)) continue;
                seen.add(ch);
                result.push(ch);
            }
            if (result.length) out.add(result.join(''));
        }
        return out;
    },
    async replace(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const needle = meta.from || '';
        const replacement = meta.to || '';
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const out = new Set();
        if (!needle) return out;
        for (const w of srcItems) {
            const normed = normNFKC(w);
            const replaced = normed.split(needle).join(replacement);
            out.add(replaced);
        }
        return out;
    },
    async sort(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const order = meta.order || 'asc';
        const locale = meta.locale || 'ja';
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const arr = Array.from(srcItems);
        arr.sort((a, b) => normNFKC(a).localeCompare(normNFKC(b), locale));
        if (order === 'desc') arr.reverse();
        return new Set(arr);
    },
    async filter_in(meta) {
        const src = REG.get(meta.src);
        const lookup = REG.get(meta.lookup);
        if (!src || !lookup) throw new Error('source or lookup bag not found');
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_src_before);
        const lookupItems = await maybeNormalizeBagItems(lookup, !!meta.normalize_lookup_before);
        const out = new Set();
        for (const w of srcItems) if (lookupItems.has(w)) out.add(w);
        return out;
    },
    async union(meta) {
        const a = REG.get(meta.src_a ?? (meta.src?.split(',')[0]));
        const b = REG.get(meta.src_b ?? (meta.src?.split(',')[1]));
        if (!a || !b) throw new Error('union source missing');
        const srcItemsA = await maybeNormalizeBagItems(a, !!meta.normalize_before);
        const srcItemsB = await maybeNormalizeBagItems(b, !!meta.normalize_before);
        return new Set([...srcItemsA, ...srcItemsB]);
    },
    async difference(meta) {
        const a = REG.get(meta.src_a ?? (meta.src?.split(',')[0]));
        const b = REG.get(meta.src_b ?? (meta.src?.split(',')[1]));
        if (!a || !b) throw new Error('difference source missing');
        const srcItemsA = await maybeNormalizeBagItems(a, !!meta.normalize_before);
        const srcItemsB = await maybeNormalizeBagItems(b, !!meta.normalize_before);
        return new Set([...srcItemsA].filter(w => !srcItemsB.has(w)));
    },
    async intersection(meta) {
        const a = REG.get(meta.src_a ?? (meta.src?.split(',')[0]));
        const b = REG.get(meta.src_b ?? (meta.src?.split(',')[1]));
        if (!a || !b) throw new Error('intersection source missing');
        const srcItemsA = await maybeNormalizeBagItems(a, !!meta.normalize_before);
        const srcItemsB = await maybeNormalizeBagItems(b, !!meta.normalize_before);
        const out = new Set();
        for (const w of srcItemsA) if (srcItemsB.has(w)) out.add(w);
        return out;
    },
    async symmetric_difference(meta) {
        const a = REG.get(meta.src_a ?? (meta.src?.split(',')[0]));
        const b = REG.get(meta.src_b ?? (meta.src?.split(',')[1]));
        if (!a || !b) throw new Error('symmetric difference source missing');
        const srcItemsA = await maybeNormalizeBagItems(a, !!meta.normalize_before);
        const srcItemsB = await maybeNormalizeBagItems(b, !!meta.normalize_before);
        const out = new Set();
        for (const w of srcItemsA) if (!srcItemsB.has(w)) out.add(w);
        for (const w of srcItemsB) if (!srcItemsA.has(w)) out.add(w);
        return out;
    },
    async filter_length(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const min = Number.isFinite(meta.min) ? meta.min : Number(meta.range?.split('-')[0]) || 0;
        const max = Number.isFinite(meta.max) ? meta.max : Number(meta.range?.split('-')[1]) || min;
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const out = new Set();
        let i = 0;
        for (const w of srcItems) {
            const len = normNFKC(w).length;
            if (len >= min && len <= max) out.add(w);
            if (++i % getBatchSize() === 0) await waitFrame();
        }
        return out;
    },
    async filter_prefix(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const prefix = await maybeNormalizeQueryValue(meta.prefix || '', !!meta.normalize_before);
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const out = new Set();
        if (!prefix) return out;
        let i = 0;
        for (const w of srcItems) {
            if (normNFKC(w).startsWith(prefix)) out.add(w);
            if (++i % getBatchSize() === 0) await waitFrame();
        }
        return out;
    },
    async filter_suffix(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const suffix = await maybeNormalizeQueryValue(meta.suffix || '', !!meta.normalize_before);
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const out = new Set();
        if (!suffix) return out;
        let i = 0;
        for (const w of srcItems) {
            if (normNFKC(w).endsWith(suffix)) out.add(w);
            if (++i % getBatchSize() === 0) await waitFrame();
        }
        return out;
    },
    async filter_contains(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const needle = await maybeNormalizeQueryValue(meta.needle || meta.contains || '', !!meta.normalize_before);
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const out = new Set();
        if (!needle) return out;
        let i = 0;
        for (const w of srcItems) {
            if (normNFKC(w).includes(needle)) out.add(w);
            if (++i % getBatchSize() === 0) await waitFrame();
        }
        return out;
    },
    async filter_regex(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const pattern = meta.pattern;
        const invert = !!meta.invert;
        if (!pattern) return new Set();
        const re = new RegExp(pattern, 'u');
        const out = new Set();
        let i = 0;
        for (const w of srcItems) {
            const matched = re.test(w);
            if ((matched && !invert) || (!matched && invert)) out.add(w);
            if (++i % getBatchSize() === 0) await waitFrame();
        }
        return out;
    },
    async ngrams(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const n = Number.isFinite(meta.n) ? Math.max(1, meta.n) : 1;
        const out = new Set();
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        let k = 0;
        for (const w of srcItems) {
            const norm = normNFKC(w);
            if (norm && norm.length >= n) {
                for (let i = 0; i <= norm.length - n; i += 1) out.add(norm.slice(i, i + n));
            }
            if (++k % getBatchSize() === 0) await waitFrame();
        }
        return out;
    },
    async sample(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const items = Array.from(srcItems);
        const count = Number.isFinite(meta.count) ? meta.count : 0;
        const need = Math.min(Math.max(0, count), items.length);
        if (need === items.length) return new Set(items);
        let rand = Math.random;
        if (meta.seed) rand = mulberry32(makeSeedFromString(meta.seed));
        for (let i = items.length - 1; i > 0; i -= 1) {
            const j = Math.floor(rand() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }
        return new Set(items.slice(0, need));
    },
    async cartesian(meta) {
        const a = REG.get(meta.src_a);
        const b = REG.get(meta.src_b);
        if (!a || !b) throw new Error('source missing');
        const sep = meta.sep || '';
        const limit = meta.limit || 10000;
        const out = new Set();
        const itemsA = Array.from(await maybeNormalizeBagItems(a, !!meta.normalize_before));
        const itemsB = Array.from(await maybeNormalizeBagItems(b, !!meta.normalize_before));

        for (let i = 0; i < itemsA.length; i++) {
            if (out.size >= limit) break;
            const wa = itemsA[i];
            for (const wb of itemsB) {
                out.add(wa + sep + wb);
                if (out.size >= limit) break;
            }
            if (i % getBatchSize() === 0) await waitFrame();
        }
        return out;
    },
    async append(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const prefix = meta.prefix || '';
        const suffix = meta.suffix || '';
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const out = new Set();
        let i = 0;
        for (const w of srcItems) {
            out.add(prefix + w + suffix);
            if (++i % getBatchSize() === 0) await waitFrame();
        }
        return out;
    },
    async anagram(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const out = new Set();
        let i = 0;
        for (const w of srcItems) {
            const chars = Array.from(normNFKC(w));
            // Shuffle
            for (let k = chars.length - 1; k > 0; k--) {
                const j = Math.floor(Math.random() * (k + 1));
                [chars[k], chars[j]] = [chars[j], chars[k]];
            }
            out.add(chars.join(''));
            if (++i % getBatchSize() === 0) await waitFrame();
        }
        return out;
    },
    async filter_similarity(meta) {
        const src = REG.get(meta.src);
        if (!src) throw new Error('source bag not found');
        const target = await maybeNormalizeQueryValue(meta.target || '', !!meta.normalize_before);
        const dist = Number.isFinite(meta.dist) ? meta.dist : 2;
        const srcItems = await maybeNormalizeBagItems(src, !!meta.normalize_before);
        const out = new Set();
        if (!target) return out;

        let i = 0;
        for (const w of srcItems) {
            if (levenshtein(w, target) <= dist) out.add(w);
            if (++i % getBatchSize() === 0) await waitFrame();
        }
        return out;
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

async function recomputeBagByMeta(bag) {
    const meta = bag?.meta || {};
    const op = meta.op;
    if (!op) return { changed: false, reason: 'no-op' };
    const runner = OP_REBUILDERS[op];
    if (!runner) return { changed: false, reason: 'unsupported' };
    const before = bag.items instanceof Set ? new Set(bag.items) : new Set(Array.from(bag.items || []));
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
 * callbacks = { onUpdate: () => void, onStatus: (bagId, msg) => void }
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
            log(`再適用エラー [${bag.id}] ${bag.name}: ${e.message}`);
            appendOpLog(`× Reapply failed [${bag.id}] ${bag.name}: ${e.message}`);
            bag.meta.reapply_error = e.message;
            bag.meta.reapplied_at = nowISO();
            bag.meta.reapply_status = `× エラー: ${e.message}`;
            if (callbacks.onStatus) callbacks.onStatus(bag.id, bag.meta.reapply_status);
            break;
        }
        if (limit !== null && bag.id === limit) break;
    }
    if (updated > 0) {
        if (callbacks.onUpdate) callbacks.onUpdate();
        appendOpLog(`↻ Reapply done (${label}: ${updated} bag${updated > 1 ? 's' : ''} updated)`);
    } else {
        appendOpLog(`↻ Reapply complete (${label}: 変更なし)`);
    }
}

// NOTE: Wrapper functions for interactions (return new Bags)
export async function op_cartesian(bagA, bagB, sep, limit, normalizeBefore) {
    const out = await OP_REBUILDERS.cartesian({ src_a: bagA.id, src_b: bagB.id, items_a: bagA.items, items_b: bagB.items, sep, limit, normalize_before: normalizeBefore });
    return new Bag(`${bagA.name} x ${bagB.name}`, out, {
        op: 'cartesian',
        src: [bagA.id, bagB.id].join(','),
        src_a: bagA.id,
        src_b: bagB.id,
        sep,
        limit,
        size_a: bagA.items.size,
        size_b: bagB.items.size,
        normalize_before: normalizeBefore
    });
}
export async function op_append(srcBag, prefix, suffix, normalizeBefore) {
    const out = await OP_REBUILDERS.append({ src: srcBag.id, prefix, suffix, normalize_before: normalizeBefore });
    return new Bag(`${srcBag.name} → append`, out, { op: 'append', src: srcBag.id, prefix, suffix, normalize_before: normalizeBefore });
}
export async function op_anagram(srcBag, normalizeBefore) {
    const out = await OP_REBUILDERS.anagram({ src: srcBag.id, normalize_before: normalizeBefore });
    return new Bag(`${srcBag.name} → anagram`, out, { op: 'anagram', src: srcBag.id, normalize_before: normalizeBefore });
}
export async function op_filter_similarity(srcBag, target, dist, normalizeBefore) {
    const out = await OP_REBUILDERS.filter_similarity({ src: srcBag.id, target, dist, normalize_before: normalizeBefore });
    return new Bag(`${srcBag.name} → similarity(${target}, ${dist})`, out, { op: 'filter_similarity', src: srcBag.id, target, dist, normalize_before: normalizeBefore });
}
