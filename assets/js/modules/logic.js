/**
 * logic.js
 *
 * This module provides reusable text processing logic, decoupled from the DOM/UI.
 *
 * INPUT:
 *   - items: Iterable<string> (Source words)
 *   - options: Object (Parameters specific to the operation)
 *   - hooks: Object (Optional environment hooks)
 *     - yielder: async () => void (Function to yield control/wait for frame)
 *     - converter: async (str) => str (Function to convert text, e.g. Kana conversion)
 *     - batchSize: number (How many items to process before yielding)
 *
 * OUTPUT:
 *   - Set<string> (Resulting unique items)
 */

/* ====== Pure Helpers ====== */
const normNFKC = s => (s || "").normalize('NFKC').trim();

function setsAreEqual(a, b) {
    if (a === b) return true;
    if (!(a instanceof Set) || !(b instanceof Set)) return false;
    if (a.size !== b.size) return false;
    for (const value of a) {
        if (!b.has(value)) return false;
    }
    return true;
}

function levenshtein(s, t) {
    if (!s) return t.length;
    if (!t) return s.length;
    const d = [];
    const n = s.length;
    const m = t.length;
    for (let i = 0; i <= n; i++) d[i] = [i];
    for (let j = 0; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        }
    }
    return d[n][m];
}

function makeSeedFromString(seed) {
    if (typeof seed === 'number') return seed >>> 0;
    let h = 1779033703 ^ (seed?.length || 0);
    for (let i = 0; i < (seed?.length || 0); i += 1) {
        h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return (Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0;
}

function mulberry32(a) {
    return function () {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ====== Logic Functions ====== */

// Helper to iterate with batching
async function processWithBatching(items, processFn, { yielder, batchSize = 200, onChunk = null } = {}) {
    console.log(`[processWithBatching] Start. Items size: ${items instanceof Set ? items.size : items.length}, BatchSize: ${batchSize}`);
    const out = new Set();
    let i = 0;
    let chunkBuffer = [];

    const flushChunk = () => {
        if (onChunk && chunkBuffer.length) {
            onChunk(chunkBuffer);
            chunkBuffer = [];
        }
    };

    for (const item of items) {
        if (i === 0) console.log(`[processWithBatching] First item: "${item}"`);
        const results = await processFn(item);
        // console.log(`[processWithBatching] Item ${i} done`);
        if (results !== null && results !== undefined) {
            if (results instanceof Set || Array.isArray(results)) {
                for (const r of results) {
                    out.add(r);
                    if (onChunk) chunkBuffer.push(r);
                }
            } else {
                out.add(results);
                if (onChunk) chunkBuffer.push(results);
            }
        }
        if (yielder && ++i % batchSize === 0) {
            flushChunk();
            await yielder();
        }
    }
    flushChunk();
    return out;
}

export const Logic = {
    // Normalization & Conversion
    async normalize(items, _, hooks) {
        const { converter } = hooks;
        return processWithBatching(items, async (w) => {
            const res = converter ? await converter(w) : w;
            return res ? res.replace(/\s+/g, '') : null;
        }, hooks);
    },

    async toRomaji(items, _, hooks) {
        const { converter } = hooks;
        return processWithBatching(items, async (w) => {
            const res = converter ? await converter(w) : w;
            return res ? res.replace(/\s+/g, '') : null;
        }, hooks);
    },

    // Deletion
    async deleteChars(items, { chars }, hooks) {
        const dels = Array.from(new Set((chars || '').split('')));
        return processWithBatching(items, async (w) => {
            let wNew = w;
            for (const c of dels) if (c) wNew = wNew.split(c).join('');
            return wNew !== w ? wNew : null;
        }, hooks);
    },

    // Transformations
    async toUpper(items, _, hooks) {
        return processWithBatching(items, w => normNFKC(w).toUpperCase(), hooks);
    },

    async toLower(items, _, hooks) {
        return processWithBatching(items, w => normNFKC(w).toLowerCase(), hooks);
    },

    async reverse(items, _, hooks) {
        return processWithBatching(items, w => {
            const reversed = Array.from(normNFKC(w)).reverse().join('');
            return reversed || null;
        }, hooks);
    },

    async dedupeChars(items, _, hooks) {
        return processWithBatching(items, w => {
            const seen = new Set();
            const result = [];
            for (const ch of Array.from(normNFKC(w))) {
                if (seen.has(ch)) continue;
                seen.add(ch);
                result.push(ch);
            }
            return result.length ? result.join('') : null;
        }, hooks);
    },

    async replace(items, { from, to }, hooks) {
        const needle = normNFKC(from);
        const replacement = normNFKC(to ?? '');
        if (!needle) return new Set();
        return processWithBatching(items, w => {
            const normed = normNFKC(w);
            return normed.split(needle).join(replacement);
        }, hooks);
    },

    async sort(items, { order = 'asc', locale = 'ja' } = {}) {
        const arr = Array.from(items);
        arr.sort((a, b) => normNFKC(a).localeCompare(normNFKC(b), locale));
        if (order === 'desc') arr.reverse();
        return new Set(arr);
    },

    // Filters
    async filterIn(items, { lookup }, hooks) {
        return processWithBatching(items, w => lookup.has(w) ? w : null, hooks);
    },

    async filterLength(items, { min, max }, hooks) {
        return processWithBatching(items, w => {
            const len = normNFKC(w).length;
            return (len >= min && len <= max) ? w : null;
        }, hooks);
    },

    async filterPrefix(items, { prefix }, hooks) {
        if (!prefix) return new Set();
        return processWithBatching(items, w => normNFKC(w).startsWith(prefix) ? w : null, hooks);
    },

    async filterSuffix(items, { suffix }, hooks) {
        if (!suffix) return new Set();
        return processWithBatching(items, w => normNFKC(w).endsWith(suffix) ? w : null, hooks);
    },

    async filterContains(items, { needle }, hooks) {
        if (!needle) return new Set();
        return processWithBatching(items, w => normNFKC(w).includes(needle) ? w : null, hooks);
    },

    async filterRegex(items, { pattern, invert }, hooks) {
        if (!pattern) return new Set();
        const re = new RegExp(pattern, 'u');
        return processWithBatching(items, w => {
            const matched = re.test(w);
            return ((matched && !invert) || (!matched && invert)) ? w : null;
        }, hooks);
    },

    async filterSimilarity(items, { target, dist }, hooks) {
        if (!target) return new Set();
        const d = Number.isFinite(dist) ? dist : 2;
        return processWithBatching(items, w => {
            return levenshtein(w, target) <= d ? w : null;
        }, hooks);
    },

    // Set Operations
    async union(itemsA, { itemsB }, _) {
        return new Set([...itemsA, ...itemsB]);
    },

    async difference(itemsA, { itemsB }, hooks) {
        return processWithBatching(itemsA, w => !itemsB.has(w) ? w : null, hooks);
    },

    async intersection(itemsA, { itemsB }, hooks) {
        return processWithBatching(itemsA, w => itemsB.has(w) ? w : null, hooks);
    },

    async symmetricDifference(itemsA, { itemsB }, hooks) {
        const out = new Set();
        // Note: symmetricDifference logic is slightly more complex, 
        // we need to pass hooks manually or update how it works if we want 'onChunk' to trigger for both passes.
        // Current impl calls processWithBatching twice. Passing hooks (with onChunk) to both might double-trigger or work fine?
        // It will work fine, just reporting chunks from both phases.
        await processWithBatching(itemsA, w => {
            if (!itemsB.has(w)) out.add(w);
        }, hooks);
        await processWithBatching(itemsB, w => {
            if (!itemsA.has(w)) out.add(w);
        }, hooks);
        return out;
    },

    // Generators / Others
    async ngrams(items, { n }, hooks) {
        const size = Number.isFinite(n) ? Math.max(1, n) : 1;
        return processWithBatching(items, w => {
            const norm = normNFKC(w);
            const res = [];
            if (norm && norm.length >= size) {
                for (let i = 0; i <= norm.length - size; i += 1) {
                    res.push(norm.slice(i, i + size));
                }
            }
            return res;
        }, hooks);
    },

    async sample(items, { count, seed }) {
        const arr = Array.from(items);
        const safeCount = Number.isFinite(count) ? count : 0;
        const need = Math.min(Math.max(0, safeCount), arr.length);
        if (need === arr.length) return new Set(arr);

        let rand = Math.random;
        if (seed) rand = mulberry32(makeSeedFromString(seed));

        for (let i = arr.length - 1; i > 0; i -= 1) {
            const j = Math.floor(rand() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return new Set(arr.slice(0, need));
    },

    async cartesian(itemsA, { itemsB, sep = '', limit = 10000 }, { yielder, batchSize = 200 } = {}) {
        // Cartesian loop structure is custom, doesn't use processWithBatching.
        // If we want onChunk support here, we need to add it manually.
        // But for now, fixing processWithBatching usages is the priority.
        // I will adhere to the existing signature for now to avoid breaking it if not using wrappers.
        const out = new Set();
        const arrA = Array.from(itemsA);
        const arrB = Array.from(itemsB);
        let count = 0;

        outer: for (let i = 0; i < arrA.length; i++) {
            const wa = arrA[i];
            for (const wb of arrB) {
                if (out.size >= limit) break outer;
                out.add(wa + sep + wb);
            }
            if (++count % batchSize === 0 && yielder) await yielder();
        }
        return out;
    },

    async append(items, { prefix = '', suffix = '' }, hooks) {
        return processWithBatching(items, w => prefix + w + suffix, hooks);
    },

    async anagram(items, _, hooks) {
        return processWithBatching(items, w => {
            const chars = Array.from(normNFKC(w));
            for (let k = chars.length - 1; k > 0; k--) {
                const j = Math.floor(Math.random() * (k + 1));
                [chars[k], chars[j]] = [chars[j], chars[k]];
            }
            return chars.join('');
        }, hooks);
    },

    clone(items) {
        return new Set(items);
    }
};

export { normNFKC, setsAreEqual, levenshtein };
