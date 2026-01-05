/**
 * @fileoverview Text manipulation and transformation functions.
 * @summary Provides normalization, case conversion, reversing, sorting, and replacements.
 * @description
 * Contains pure functions for manipulating string data.
 * Includes Unicode normalization (NFKC) which is central to many other operations.
 *
 * @module core/text
 * @requires core/utils
 * @exports
 *  normNFKC, normalize, toLower, toUpper, reverse, dedupeChars, replace, append, sort,
 *  normalizeSpaces, stripPunctuation, normalizeDashes,
 *  toHiragana, toKatakana, normalizeKana,
 *  take, drop, slice,
 *  extractRegex, replaceRegex, replaceMap,
 *  pipe,
 *  uniqueNormalized,
 *  sortByLength, sortNatural, sortLocale,
 *  fingerprint,
 *  commonPrefix, commonSuffix,
 *  levenshtein, damerauLevenshtein, jaroWinkler, diceCoefficient
 */

import { processWithBatching } from './utils.js';

/**
 * Calculates the Levenshtein distance between two strings.
 * @param {string} s
 * @param {string} t
 * @returns {number}
 */
export function levenshtein(s, t) {
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

/* ====== Pure Helpers ====== */

/**
 * Normalizes a string to NFKC form and trims whitespace.
 * @param {string} s
 * @returns {string}
 */
export const normNFKC = s => (s || "").normalize('NFKC').trim();

/* ====== Transformations ====== */

/**
 * Normalizes items using a specific converter (e.g. Kana).
 * @param {Iterable} items
 * @param {object} _ options (unused)
 * @param {object} hooks - { converter, ... }
 */
export async function normalize(items, _, hooks) {
    const { converter } = hooks;
    return processWithBatching(items, async (w) => {
        const res = converter ? await converter(w) : w;
        return res ? res.replace(/\s+/g, '') : null;
    }, hooks);
}

export async function toUpper(items, _, hooks) {
    return processWithBatching(items, w => normNFKC(w).toUpperCase(), hooks);
}

export async function toLower(items, _, hooks) {
    return processWithBatching(items, w => normNFKC(w).toLowerCase(), hooks);
}

export async function reverse(items, _, hooks) {
    return processWithBatching(items, w => {
        const reversed = Array.from(normNFKC(w)).reverse().join('');
        return reversed || null;
    }, hooks);
}

export async function dedupeChars(items, _, hooks) {
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
}

export async function replace(items, { from, to }, hooks) {
    const needle = normNFKC(from);
    const replacement = normNFKC(to ?? '');
    if (!needle) return new Set();
    return processWithBatching(items, w => {
        const normed = normNFKC(w);
        return normed.split(needle).join(replacement);
    }, hooks);
}

export async function append(items, { prefix = '', suffix = '' }, hooks) {
    return processWithBatching(items, w => prefix + w + suffix, hooks);
}

export async function sort(items, { order = 'asc', locale = 'ja' } = {}) {
    const arr = Array.from(items);
    arr.sort((a, b) => normNFKC(a).localeCompare(normNFKC(b), locale));
    if (order === 'desc') arr.reverse();
    return new Set(arr);
}

/* ====== Added Transformations ====== */

function ensureFlags(flags, required) {
    const s = String(flags ?? '');
    const set = new Set(s.split(''));
    for (const ch of required) set.add(ch);
    return Array.from(set).join('');
}

function toCodePoints(s) {
    return Array.from(String(s ?? ''));
}

function clampIndex(i, len) {
    const idx = i < 0 ? len + i : i;
    return Math.max(0, Math.min(len, idx));
}

/**
 * 空白の扱いを統一するための変換。
 * 原理: NFKC 正規化後、Unicode 空白（\s）を正規表現で処理して「削除」「1個に畳み込み」を行う。
 * なにをする: mode='remove' なら空白を全削除、mode='collapse' なら連続空白を1個にし両端を trim。
 * @param {Iterable} items
 * @param {object} params - { mode: 'remove' | 'collapse' }
 * @param {object} hooks
 */
export async function normalizeSpaces(items, { mode = 'remove' } = {}, hooks) {
    return processWithBatching(items, w => {
        const s = normNFKC(w);
        if (!s) return null;
        if (mode === 'collapse') return s.replace(/\s+/g, ' ').trim() || null;
        return s.replace(/\s+/g, '') || null;
    }, hooks);
}

/**
 * 句読点・記号を除去して「文字の骨格」を作るための変換。
 * 原理: Unicode プロパティ（P=punctuation, S=symbol）に一致する文字を正規表現で削除する。
 * なにをする: removeSymbols=true なら記号も削除、false なら句読点のみ削除（両方ともNFKC後に適用）。
 * @param {Iterable} items
 * @param {object} params - { removeSymbols?: boolean }
 * @param {object} hooks
 */
export async function stripPunctuation(items, { removeSymbols = true } = {}, hooks) {
    const re = removeSymbols ? /[\p{P}\p{S}]+/gu : /[\p{P}]+/gu;
    return processWithBatching(items, w => {
        const s = normNFKC(w);
        const out = s.replace(re, '');
        return out ? out : null;
    }, hooks);
}

/**
 * ダッシュ・波線の表記揺れを統一するための変換。
 * 原理: 代表的なダッシュ類・波線類のコードポイント集合を、指定の代表文字に置換する。
 * なにをする: dashChars を dash に、tildeChars を tilde に一括変換（NFKC後に適用）。
 * @param {Iterable} items
 * @param {object} params - { dash?: string, tilde?: string }
 * @param {object} hooks
 */
export async function normalizeDashes(items, { dash = '-', tilde = '~' } = {}, hooks) {
    // dash variants (hyphen/minus, en/em dash, fullwidth, etc.)
    const dashRe = /[‐-‒–—―−﹣－]/gu;
    // tilde variants (wave dash, fullwidth tilde, similar)
    const tildeRe = /[〜～∼∾]/gu;

    const d = String(dash);
    const t = String(tilde);

    return processWithBatching(items, w => {
        const s = normNFKC(w);
        if (!s) return null;
        const out = s.replace(dashRe, d).replace(tildeRe, t);
        return out ? out : null;
    }, hooks);
}

/**
 * カタカナをひらがなへ変換するための変換。
 * 原理: Unicode の対応範囲（カタカナ U+30A1..U+30F6）をコードポイント差分（-0x60）で変換する。
 * なにをする: NFKC後、該当範囲のカタカナだけをひらがなへ置換し、それ以外は保持する。
 * @param {Iterable} items
 * @param {object} _
 * @param {object} hooks
 */
export async function toHiragana(items, _, hooks) {
    return processWithBatching(items, w => {
        const s = normNFKC(w);
        if (!s) return null;
        const cps = toCodePoints(s).map(ch => {
            const c = ch.codePointAt(0);
            if (c >= 0x30A1 && c <= 0x30F6) return String.fromCodePoint(c - 0x60);
            return ch;
        });
        const out = cps.join('');
        return out ? out : null;
    }, hooks);
}

/**
 * ひらがなをカタカナへ変換するための変換。
 * 原理: Unicode の対応範囲（ひらがな U+3041..U+3096）をコードポイント差分（+0x60）で変換する。
 * なにをする: NFKC後、該当範囲のひらがなだけをカタカナへ置換し、それ以外は保持する。
 * @param {Iterable} items
 * @param {object} _
 * @param {object} hooks
 */
export async function toKatakana(items, _, hooks) {
    return processWithBatching(items, w => {
        const s = normNFKC(w);
        if (!s) return null;
        const cps = toCodePoints(s).map(ch => {
            const c = ch.codePointAt(0);
            if (c >= 0x3041 && c <= 0x3096) return String.fromCodePoint(c + 0x60);
            return ch;
        });
        const out = cps.join('');
        return out ? out : null;
    }, hooks);
}

const SMALL_TO_LARGE = new Map([
    // Hiragana
    ['ぁ', 'あ'], ['ぃ', 'い'], ['ぅ', 'う'], ['ぇ', 'え'], ['ぉ', 'お'],
    ['っ', 'つ'], ['ゃ', 'や'], ['ゅ', 'ゆ'], ['ょ', 'よ'], ['ゎ', 'わ'],
    ['ゕ', 'か'], ['ゖ', 'け'],
    // Katakana
    ['ァ', 'ア'], ['ィ', 'イ'], ['ゥ', 'ウ'], ['ェ', 'エ'], ['ォ', 'オ'],
    ['ッ', 'ツ'], ['ャ', 'ヤ'], ['ュ', 'ユ'], ['ョ', 'ヨ'], ['ヮ', 'ワ'],
    ['ヵ', 'カ'], ['ヶ', 'ケ'],
]);

/**
 * かな表記の検索用・比較用の揺れを減らすための変換。
 * 原理: (1) NFKC 正規化、(2) かな種（ひらがな/カタカナ）の統一、(3) 小書きかなの正規化、(4) 必要なら濁点/半濁点を分解して除去、を段階的に行う。
 * なにをする:
 *  - to: 'hiragana'|'katakana' でかな種を統一
 *  - smallToLarge=true で小書きかなを大文字へ寄せる
 *  - removeVoicingMarks=true で結合分解後に U+3099/U+309A を削除して再合成する
 * @param {Iterable} items
 * @param {object} params - { to?: 'hiragana'|'katakana', smallToLarge?: boolean, removeVoicingMarks?: boolean }
 * @param {object} hooks
 */
export async function normalizeKana(items, { to, smallToLarge = false, removeVoicingMarks = false } = {}, hooks) {
    return processWithBatching(items, w => {
        let s = normNFKC(w);
        if (!s) return null;

        if (to === 'hiragana') {
            s = toCodePoints(s).map(ch => {
                const c = ch.codePointAt(0);
                if (c >= 0x30A1 && c <= 0x30F6) return String.fromCodePoint(c - 0x60);
                return ch;
            }).join('');
        } else if (to === 'katakana') {
            s = toCodePoints(s).map(ch => {
                const c = ch.codePointAt(0);
                if (c >= 0x3041 && c <= 0x3096) return String.fromCodePoint(c + 0x60);
                return ch;
            }).join('');
        }

        if (smallToLarge) {
            s = toCodePoints(s).map(ch => SMALL_TO_LARGE.get(ch) ?? ch).join('');
        }

        if (removeVoicingMarks) {
            // NFD で濁点/半濁点（結合文字）に分解し、U+3099/U+309A を除去して NFC へ戻す
            s = s.normalize('NFD').replace(/[\u3099\u309A]/g, '').normalize('NFC');
        }

        return s ? s : null;
    }, hooks);
}

/**
 * 文字列の先頭/末尾を切り出すための変換。
 * 原理: Array.from によりコードポイント列として扱い、先頭から n 個を取得する。
 * なにをする: NFKC後、先頭 n 文字だけを返す（n<=0 は null）。
 * @param {Iterable} items
 * @param {object} params - { n: number }
 * @param {object} hooks
 */
export async function take(items, { n }, hooks) {
    const k = Number.isFinite(n) ? Math.trunc(n) : 0;
    if (k <= 0) return new Set();
    return processWithBatching(items, w => {
        const s = normNFKC(w);
        if (!s) return null;
        const out = toCodePoints(s).slice(0, k).join('');
        return out ? out : null;
    }, hooks);
}

/**
 * 文字列の先頭/末尾を削るための変換。
 * 原理: Array.from によりコードポイント列として扱い、先頭から n 個を捨てる。
 * なにをする: NFKC後、先頭 n 文字を除いた残りを返す（空なら null）。
 * @param {Iterable} items
 * @param {object} params - { n: number }
 * @param {object} hooks
 */
export async function drop(items, { n }, hooks) {
    const k = Number.isFinite(n) ? Math.trunc(n) : 0;
    if (k < 0) return new Set();
    return processWithBatching(items, w => {
        const s = normNFKC(w);
        if (!s) return null;
        const cps = toCodePoints(s);
        const out = cps.slice(Math.min(k, cps.length)).join('');
        return out ? out : null;
    }, hooks);
}

/**
 * 任意範囲を切り出すための変換。
 * 原理: Array.from によりコードポイント列として扱い、slice(start,end) を負インデックス対応で適用する。
 * なにをする: NFKC後、[start,end) を切り出して返す（空なら null）。
 * @param {Iterable} items
 * @param {object} params - { start?: number, end?: number }
 * @param {object} hooks
 */
export async function slice(items, { start = 0, end } = {}, hooks) {
    const st = Number.isFinite(start) ? Math.trunc(start) : 0;
    const ed = (end === undefined || end === null) ? null : (Number.isFinite(end) ? Math.trunc(end) : null);

    return processWithBatching(items, w => {
        const s = normNFKC(w);
        if (!s) return null;
        const cps = toCodePoints(s);
        const a = clampIndex(st, cps.length);
        const b = (ed === null) ? cps.length : clampIndex(ed, cps.length);
        const out = cps.slice(a, b).join('');
        return out ? out : null;
    }, hooks);
}

/**
 * 正規表現のキャプチャを抽出するための変換。
 * 原理: pattern を RegExp 化し、最初の一致のキャプチャ group を取り出す（未一致なら null）。
 * なにをする: NFKC後の文字列に対して一致を取り、group 番号（0=全体）を返す。
 * @param {Iterable} items
 * @param {object} params - { pattern: string, group?: number, flags?: string }
 * @param {object} hooks
 */
export async function extractRegex(items, { pattern, group = 0, flags = 'u' } = {}, hooks) {
    if (!pattern) return new Set();

    let re;
    try {
        const fl = ensureFlags(flags, 'u');
        re = new RegExp(pattern, fl);
    } catch {
        return new Set();
    }

    const g = Number.isFinite(group) ? Math.trunc(group) : 0;

    return processWithBatching(items, w => {
        const s = normNFKC(w);
        if (!s) return null;
        const m = s.match(re);
        if (!m) return null;
        const out = m[g] ?? null;
        return out ? out : null;
    }, hooks);
}

/**
 * 正規表現置換を行うための変換。
 * 原理: pattern を RegExp 化し、String.prototype.replace で置換する（global 等は flags に依存）。
 * なにをする: NFKC後の文字列に対して置換し、結果を返す（pattern 不正なら空集合）。
 * @param {Iterable} items
 * @param {object} params - { pattern: string, to: string, flags?: string }
 * @param {object} hooks
 */
export async function replaceRegex(items, { pattern, to, flags = 'gu' } = {}, hooks) {
    if (!pattern) return new Set();

    let re;
    try {
        const fl = ensureFlags(flags, 'u');
        re = new RegExp(pattern, fl);
    } catch {
        return new Set();
    }

    const replacement = normNFKC(to ?? '');

    return processWithBatching(items, w => {
        const s = normNFKC(w);
        if (!s) return null;
        const out = s.replace(re, replacement);
        return out ? out : null;
    }, hooks);
}

function normalizeReplacePairs(mapLike) {
    if (!mapLike) return [];
    if (mapLike instanceof Map) {
        return Array.from(mapLike.entries()).map(([k, v]) => [normNFKC(k), normNFKC(v ?? '')]);
    }
    if (typeof mapLike === 'object') {
        return Object.entries(mapLike).map(([k, v]) => [normNFKC(k), normNFKC(v ?? '')]);
    }
    return [];
}

/**
 * 置換表による一括（リテラル）置換を行うための変換。
 * 原理: (from,to) のペアを長いキー優先で順に split/join し、複数のリテラル置換を合成する。
 * なにをする: NFKC後の文字列に対して、置換表のキー文字列をすべて置換する（キーが空のものは無視）。
 * @param {Iterable} items
 * @param {object} params - { map: Map<string,string> | Record<string,string> }
 * @param {object} hooks
 */
export async function replaceMap(items, { map } = {}, hooks) {
    const pairs = normalizeReplacePairs(map)
        .filter(([from]) => !!from)
        .sort((a, b) => b[0].length - a[0].length);

    if (pairs.length === 0) return new Set();

    return processWithBatching(items, w => {
        let s = normNFKC(w);
        if (!s) return null;
        for (const [from, to] of pairs) {
            if (!from) continue;
            s = s.split(from).join(to);
        }
        return s ? s : null;
    }, hooks);
}

/**
 * 複数の変換を順番に合成するための変換。
 * 原理: hooks.transforms に並んだ関数列を左から順に適用し、途中で null が出たら打ち切る。
 * なにをする: transforms の各関数（同期/非同期）で逐次変換し、最終結果を返す。
 * @param {Iterable} items
 * @param {object} _ options (unused)
 * @param {object} hooks - { transforms: Array<(s:string)=> (string|null|Promise<string|null>)> }
 */
export async function pipe(items, _, hooks) {
    const transforms = Array.isArray(hooks?.transforms) ? hooks.transforms : [];
    if (transforms.length === 0) return new Set();

    return processWithBatching(items, async (w) => {
        let cur = w;
        for (const fn of transforms) {
            if (cur === null || cur === undefined) return null;
            if (typeof fn !== 'function') continue;
            cur = await fn(cur);
        }
        return cur ? String(cur) : null;
    }, hooks);
}

/**
 * 正規化キーで集合全体の重複を落とすための変換。
 * 原理: key=normNFKC(item) を用いて「同じキーを二度採用しない」ことで、表記揺れを潰しつつユニーク化する。
 * なにをする: 最初に出現した表記を残し、同一キーの後続要素は捨てる（順序は入力順）。
 * @param {Iterable} items
 * @param {object} _
 * @param {object} hooks
 */
export async function uniqueNormalized(items, _, hooks) {
    const out = new Set();
    const seen = new Set();
    for (const w of items ?? []) {
        const key = normNFKC(w);
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.add(w);
    }
    return out;
}

/**
 * 文字数を主キーにして並べ替えるためのソート。
 * 原理: key1=正規化後の長さ、key2=localeCompare による辞書順で安定化する。
 * なにをする: 長さ昇順（または降順）で並べ、同長ならロケール比較で並べる。
 * @param {Iterable} items
 * @param {object} params - { order?: 'asc'|'desc', locale?: string }
 */
export async function sortByLength(items, { order = 'asc', locale = 'ja' } = {}) {
    const arr = Array.from(items);
    arr.sort((a, b) => {
        const sa = normNFKC(a);
        const sb = normNFKC(b);
        const da = sa.length - sb.length;
        if (da !== 0) return da;
        return sa.localeCompare(sb, locale);
    });
    if (order === 'desc') arr.reverse();
    return new Set(arr);
}

/**
 * 自然順（例: a2 < a10）で並べ替えるためのソート。
 * 原理: Intl.Collator の numeric:true を用いて、数字部分を数値として比較する。
 * なにをする: 正規化後の文字列で自然順比較し、昇順/降順で Set を返す。
 * @param {Iterable} items
 * @param {object} params - { order?: 'asc'|'desc', locale?: string, sensitivity?: Intl.CollatorOptions['sensitivity'] }
 */
export async function sortNatural(items, { order = 'asc', locale = 'ja', sensitivity = 'variant' } = {}) {
    const arr = Array.from(items);
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity });
    arr.sort((a, b) => collator.compare(normNFKC(a), normNFKC(b)));
    if (order === 'desc') arr.reverse();
    return new Set(arr);
}

/**
 * ロケール・感度などの比較設定を明示して並べ替えるためのソート。
 * 原理: Intl.Collator を使い、locale/sensitivity/caseFirst/ignorePunctuation 等の比較規則を選択可能にする。
 * なにをする: 指定オプションで比較して並べ、昇順/降順で Set を返す。
 * @param {Iterable} items
 * @param {object} params - { order?: 'asc'|'desc', locale?: string, sensitivity?: string, caseFirst?: string, ignorePunctuation?: boolean, numeric?: boolean }
 */
export async function sortLocale(items, {
    order = 'asc',
    locale = 'ja',
    sensitivity = 'variant',
    caseFirst = 'false',
    ignorePunctuation = false,
    numeric = false
} = {}) {
    const arr = Array.from(items);
    const collator = new Intl.Collator(locale, { sensitivity, caseFirst, ignorePunctuation, numeric });
    arr.sort((a, b) => collator.compare(normNFKC(a), normNFKC(b)));
    if (order === 'desc') arr.reverse();
    return new Set(arr);
}

/**
 * 検索・照合用のキー（指紋）を作るための変換。
 * 原理: NFKC→小文字化→空白除去→（任意で）句読点/記号除去、で比較耐性の高いキーを作る。
 * なにをする: removeSymbols=true なら \p{P}\p{S} を除去し、空なら null を返す。
 * @param {Iterable} items
 * @param {object} params - { removeSymbols?: boolean }
 * @param {object} hooks
 */
export async function fingerprint(items, { removeSymbols = true } = {}, hooks) {
    const re = removeSymbols ? /[\p{P}\p{S}]+/gu : /[\p{P}]+/gu;
    return processWithBatching(items, w => {
        let s = normNFKC(w);
        if (!s) return null;
        s = s.toLowerCase().replace(/\s+/g, '');
        s = s.replace(re, '');
        return s ? s : null;
    }, hooks);
}

/**
 * 指定 target との共通接頭辞を抽出するための変換。
 * 原理: NFKC 正規化後、左から同じ文字が続く限り走査して最長共通接頭辞を得る。
 * なにをする: item と target の最長共通接頭辞文字列を返す（空なら null）。
 * @param {Iterable} items
 * @param {object} params - { target: string }
 * @param {object} hooks
 */
export async function commonPrefix(items, { target } = {}, hooks) {
    const t = normNFKC(target);
    if (!t) return new Set();

    const tc = toCodePoints(t);

    return processWithBatching(items, w => {
        const s = normNFKC(w);
        if (!s) return null;
        const sc = toCodePoints(s);
        const L = Math.min(sc.length, tc.length);
        let i = 0;
        for (; i < L; i++) {
            if (sc[i] !== tc[i]) break;
        }
        const out = sc.slice(0, i).join('');
        return out ? out : null;
    }, hooks);
}

/**
 * 指定 target との共通接尾辞を抽出するための変換。
 * 原理: NFKC 正規化後、右から同じ文字が続く限り走査して最長共通接尾辞を得る。
 * なにをする: item と target の最長共通接尾辞文字列を返す（空なら null）。
 * @param {Iterable} items
 * @param {object} params - { target: string }
 * @param {object} hooks
 */
export async function commonSuffix(items, { target } = {}, hooks) {
    const t = normNFKC(target);
    if (!t) return new Set();

    const tc = toCodePoints(t);

    return processWithBatching(items, w => {
        const s = normNFKC(w);
        if (!s) return null;
        const sc = toCodePoints(s);
        let i = sc.length - 1;
        let j = tc.length - 1;
        while (i >= 0 && j >= 0 && sc[i] === tc[j]) {
            i--; j--;
        }
        const out = sc.slice(i + 1).join('');
        return out ? out : null;
    }, hooks);
}

/* ====== Distance Metrics ====== */

/**
 * Calculates the Damerau-Levenshtein distance (edit distance with transpositions).
 * @param {string} s
 * @param {string} t
 * @returns {number}
 */
export function damerauLevenshtein(s, t) {
    if (!s) return t ? t.length : 0;
    if (!t) return s.length;

    // Convert to code points for correct Unicode handling (surrogate pairs)
    const source = toCodePoints(s);
    const target = toCodePoints(t);

    const n = source.length;
    const m = target.length;
    const INF = n + m;

    const h = new Array(n + 2).fill(0).map(() => new Array(m + 2).fill(0));
    const da = new Map();

    // Initialize
    for (let i = 0; i <= n; i++) {
        h[i + 1][0] = INF;
        h[i + 1][1] = i;
    }
    for (let j = 0; j <= m; j++) {
        h[0][j + 1] = INF;
        h[1][j + 1] = j;
    }

    // Fill
    for (let i = 1; i <= n; i++) {
        let db = 0;
        for (let j = 1; j <= m; j++) {
            const i1 = da.get(target[j - 1]) || 0;
            const j1 = db;
            let cost = 1;

            if (source[i - 1] === target[j - 1]) {
                cost = 0;
                db = j;
            }

            h[i + 1][j + 1] = Math.min(
                h[i][j] + cost,                 // substitution
                h[i + 1][j] + 1,               // insertion
                h[i][j + 1] + 1,               // deletion
                h[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1) // transposition
            );
        }
        da.set(source[i - 1], i);
    }

    return h[n + 1][m + 1];
}

/**
 * Calculates the Jaro-Winkler similarity distance (1 - similarity).
 * Returns between 0 (exact match) and 1 (no match), to align with "distance" concept.
 * Note: Typically Jaro-Winkler returns similarity (0 to 1), so we invert it.
 * @param {string} s
 * @param {string} t
 * @returns {number}
 */
export function jaroWinkler(s, t) {
    if (s === t) return 0;
    if (!s || !t) return 1;

    const jaro = (s, t) => {
        const sLen = s.length;
        const tLen = t.length;
        if (sLen === 0 || tLen === 0) return 0;

        const matchDist = Math.floor(Math.max(sLen, tLen) / 2) - 1;
        const sMatches = new Array(sLen).fill(false);
        const tMatches = new Array(tLen).fill(false);

        let matches = 0;
        for (let i = 0; i < sLen; i++) {
            const start = Math.max(0, i - matchDist);
            const end = Math.min(i + matchDist + 1, tLen);
            for (let j = start; j < end; j++) {
                if (!tMatches[j] && s[i] === t[j]) {
                    sMatches[i] = true;
                    tMatches[j] = true;
                    matches++;
                    break;
                }
            }
        }

        if (matches === 0) return 0;

        let k = 0;
        let transpositions = 0;
        for (let i = 0; i < sLen; i++) {
            if (sMatches[i]) {
                while (!tMatches[k]) k++;
                if (s[i] !== t[k]) transpositions++;
                k++;
            }
        }

        return ((matches / sLen) + (matches / tLen) + ((matches - transpositions / 2) / matches)) / 3;
    };

    const j = jaro(s, t);
    if (j < 0.7) return 1 - j;

    let prefix = 0;
    const maxPrefix = Math.min(s.length, t.length, 4);
    for (let i = 0; i < maxPrefix; i++) {
        if (s[i] === t[i]) prefix++;
        else break;
    }

    const jw = j + prefix * 0.1 * (1 - j);
    return 1 - jw; // Return distance (0 = match, 1 = mismatch)
}

/**
 * Calculates the Sørensen–Dice coefficient distance (1 - coefficient).
 * Uses bigrams by default.
 * @param {string} s
 * @param {string} t
 * @returns {number} 0 to 1
 */
export function diceCoefficient(s, t) {
    if (s === t) return 0;
    if (!s || !t) return 1;

    const getBigrams = (str) => {
        const bigrams = new Map();
        for (let i = 0; i < str.length - 1; i++) {
            const bg = str.slice(i, i + 2);
            bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
        }
        return bigrams;
    };

    const sBi = getBigrams(s);
    const tBi = getBigrams(t);
    const sSize = s.length - 1;
    const tSize = t.length - 1;

    if (sSize < 1 || tSize < 1) return 1; // Cannot form bigrams

    let intersection = 0;
    for (const [bg, count] of sBi) {
        if (tBi.has(bg)) {
            intersection += Math.min(count, tBi.get(bg));
        }
    }

    const dice = (2 * intersection) / (sSize + tSize);
    return 1 - dice;
}



