/**
 * @fileoverview Operations Panel Logic.
 * @summary Wires DOM events to Domain Operations.
 * @description
 * Maps all the buttons in the Operations pane to their respective
 * Async Operation functions in the Domain layer. 
 * Handles generic error catching and logging for operations.
 *
 * @module ui/panels/operations
 * @requires ui/dom
 * @requires domain/models/registry
 * @requires ui/components/bag-list
 * @requires store/history
 * @requires domain/ops/*
 * @requires core/text
 * @exports initOperationsPanel
 */

import { el, log, appendOpLog, getBatchSize, waitFrame } from '../dom.js';
import { REG } from '../../domain/models/registry.js';
import { renderBags, applyChoices } from '../components/bag-list.js';
import { captureState } from '../../store/history.js';
import { normNFKC } from '../../core/text.js';

// Import All Ops
import { op_normalize_hiragana, op_normalize_katakana, op_normalize_romaji } from '../../domain/ops/normalize.js';
import { op_to_upper, op_to_lower, op_reverse, op_dedupe_chars, op_replace, op_sort } from '../../domain/ops/transform.js';
import { op_union, op_difference, op_intersection, op_symmetric_difference } from '../../domain/ops/sets.js';
import {
    op_filter_length, op_filter_prefix, op_filter_suffix, op_filter_contains, op_filter_regex, op_filter_similarity, op_filter_in,
    op_filter_normalized_equals, op_filter_normalized_contains,
    op_filter_script, op_filter_unicode_property,
    op_filter_subsequence, op_filter_char_at,
    op_filter_ngram_jaccard, op_filter_hamming,
    op_filter_pattern_preset
} from '../../domain/ops/filters.js';
import { op_ngrams, op_sample, op_cartesian, op_append, op_anagram } from '../../domain/ops/generators.js';

/* ====== Generic Runner Wrapper ====== */
async function runOp(src, desc, action) {
    if (!src) return;
    appendOpLog(desc);
    try {
        const nb = await action();
        if (nb) {
            // nb is likely 'processing' status. 
            // REG.add(nb) happens inside runProgressiveOp usually?
            // Checking base.js... Yes, REG.add(bag) is called there.
            // So we don't need to add it again, but we should ensure UI updates.
            applyChoices();
            renderBags();
            captureState();
            appendOpLog(`→ start: [${nb.id}] ${nb.name}`);
        }
    } catch (e) {
        log('Error: ' + e.message);
        appendOpLog('× Error: ' + e.message);
    }
}

function getHooks() {
    return {
        yielder: waitFrame,
        batchSize: getBatchSize()
    };
}

export function initOperationsPanel() {
    el('#btnNorm')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcNorm').value);
        if (!src) return;
        runOp(src, `normalize(hiragana)… [${src.id}]`,
            () => op_normalize_hiragana(src, { hooks: getHooks() }));
    });

    el('#btnKatakana')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcNorm').value);
        if (!src) return;
        runOp(src, `normalize(katakana)… [${src.id}]`,
            () => op_normalize_katakana(src, { hooks: getHooks() }));
    });

    el('#btnRomaji')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcTransform').value);
        if (!src) return;
        runOp(src, `normalize(romaji)… [${src.id}]`,
            () => op_normalize_romaji(src, { hooks: getHooks() }));
    });

    /* === Transform === */
    el('#btnUpper')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcTransform').value);
        const normBag = el('#ckPreNormTransform').checked;
        runOp(src, `to_upper`, () => op_to_upper(src, { normalizeBefore: normBag, hooks: getHooks() }));
    });
    el('#btnLower')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcTransform').value);
        const normBag = el('#ckPreNormTransform').checked;
        runOp(src, `to_lower`, () => op_to_lower(src, { normalizeBefore: normBag, hooks: getHooks() }));
    });
    el('#btnReverse')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcTransform').value);
        const normBag = el('#ckPreNormTransform').checked;
        runOp(src, `reverse`, () => op_reverse(src, { normalizeBefore: normBag, hooks: getHooks() }));
    });
    el('#btnDedupe')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcFormat').value);
        const normBag = el('#ckPreNormFormat').checked;
        runOp(src, `dedupe_chars`, () => op_dedupe_chars(src, { normalizeBefore: normBag, hooks: getHooks() }));
    });
    el('#btnReplace')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcFormat').value);
        const fromRaw = el('#replaceFrom').value;
        const toRaw = el('#replaceTo').value || '';
        const normBag = el('#ckPreNormFormat').checked;
        runOp(src, `replace`, () => op_replace(src, fromRaw, toRaw, { normalizeBefore: normBag, hooks: getHooks() }));
    });
    el('#btnSortAsc')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcFormat').value);
        const normBag = el('#ckPreNormFormat').checked;
        runOp(src, `sort asc`, () => op_sort(src, 'asc', { normalizeBefore: normBag, hooks: getHooks() }));
    });
    el('#btnSortDesc')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcFormat').value);
        const normBag = el('#ckPreNormFormat').checked;
        runOp(src, `sort desc`, () => op_sort(src, 'desc', { normalizeBefore: normBag, hooks: getHooks() }));
    });

    /* === Sets === */
    el('#btnUnion')?.addEventListener('click', () => {
        const a = REG.get(el('#selSrcUnionA').value);
        const b = REG.get(el('#selSrcUnionB').value);
        if (a && b) runOp(a, `union`, () => op_union(a, b, { hooks: getHooks() }));
    });
    el('#btnDiff')?.addEventListener('click', () => {
        const a = REG.get(el('#selSrcUnionA').value);
        const b = REG.get(el('#selSrcUnionB').value);
        if (a && b) runOp(a, `diff`, () => op_difference(a, b, { hooks: getHooks() }));
    });
    el('#btnIntersect')?.addEventListener('click', () => {
        const a = REG.get(el('#selSrcUnionA').value);
        const b = REG.get(el('#selSrcUnionB').value);
        if (a && b) runOp(a, `intersect`, () => op_intersection(a, b, { hooks: getHooks() }));
    });
    el('#btnSymDiff')?.addEventListener('click', () => {
        const a = REG.get(el('#selSrcUnionA').value);
        const b = REG.get(el('#selSrcUnionB').value);
        if (a && b) runOp(a, `sym_diff`, () => op_symmetric_difference(a, b, { hooks: getHooks() }));
    });

    /* === Filters === */
    el('#btnLengthFilter')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcLen').value);
        const min = Math.max(0, parseInt(el('#lenMin').value, 10) || 0);
        const max = Math.max(min, parseInt(el('#lenMax').value, 10) || min);
        const normBag = el('#ckPreNormLen').checked;
        runOp(src, `length[${min}-${max}]`, () => op_filter_length(src, min, max, { normalizeBefore: normBag, hooks: getHooks() }));
    });
    el('#btnPrefix')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcAffix').value);
        const val = el('#prefixValue').value;
        const normBag = el('#ckPreNormAffix').checked;
        runOp(src, `prefix`, () => op_filter_prefix(src, val, { normalizeBefore: normBag, hooks: getHooks() }));
    });
    el('#btnSuffix')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcAffix').value);
        const val = el('#suffixValue').value;
        const normBag = el('#ckPreNormAffix').checked;
        runOp(src, `suffix`, () => op_filter_suffix(src, val, { normalizeBefore: normBag, hooks: getHooks() }));
    });
    el('#btnContains')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcContains').value);
        const val = el('#containsValue').value;
        const normBag = el('#ckPreNormContains').checked;
        runOp(src, `contains`, () => op_filter_contains(src, val, { normalizeBefore: normBag, hooks: getHooks() }));
    });
    el('#btnRegex')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcRegex').value);
        const pat = el('#regexPattern').value;
        const inv = el('#regexInvert').checked;
        const normBag = el('#ckPreNormRegex').checked;
        runOp(src, `regex`, () => op_filter_regex(src, pat, inv, { normalizeBefore: normBag, hooks: getHooks() }));
    });
    el('#btnSimilarity')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcSimilarity').value);
        const kTarget = el('#simTarget') ? '#simTarget' : '#similarityTarget';
        const kDist = el('#simDist') ? '#simDist' : '#similarityDist';
        const target = el(kTarget).value;
        const dist = parseFloat(el(kDist).value) || 2; // Allow float for Jaro/Dice
        const metric = el('#selSimilarityMetric')?.value || 'levenshtein';
        const normBag = el('#ckPreNormSimilarity').checked;
        runOp(src, `similarity`, () => op_filter_similarity(src, target, dist, { normalizeBefore: normBag, metric, hooks: getHooks() }));
    });
    el('#btnFlt')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcFlt').value);
        const lkp = REG.get(el('#selLkpFlt').value);
        if (!src || !lkp) return;
        const normSrc = el('#ckPreNormFltSrc').checked;
        const normLookup = el('#ckPreNormFltLookup').checked;
        runOp(src, `filter_in`, () => op_filter_in(src, lkp, { normalizeSrc: normSrc, normalizeLookup: normLookup, hooks: getHooks() }));
    });



    /* === Advanced Filters === */
    el('#btnPreset')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcAdv').value);
        const preset = el('#selPreset').value;
        const invert = el('#presetInvert').checked;
        const normBag = el('#ckPreNormAdv').checked;
        runOp(src, `preset(${preset})`, () => op_filter_pattern_preset(src, preset, invert, { normalizeBefore: normBag, hooks: getHooks() }));
    });
    el('#btnScript')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcAdv').value);
        const script = el('#scriptName').value;
        // const normBag = el('#ckPreNormAdv').checked;
        runOp(src, `script(${script})`, () => op_filter_script(src, script, false, { hooks: getHooks() }));
    });
    el('#btnUniProp')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcAdv').value);
        const prop = el('#uniProp').value;
        runOp(src, `prop(${prop})`, () => op_filter_unicode_property(src, prop, false, { hooks: getHooks() }));
    });
    el('#btnNormEq')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcAdv').value);
        const target = el('#normTarget').value;
        runOp(src, `norm_eq`, () => op_filter_normalized_equals(src, target, { hooks: getHooks() }));
    });
    el('#btnNormCont')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcAdv').value);
        const needle = el('#normTarget').value;
        runOp(src, `norm_cont`, () => op_filter_normalized_contains(src, needle, { hooks: getHooks() }));
    });
    el('#btnSubseq')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcAdv').value);
        const needle = el('#subseqNeedle').value;
        runOp(src, `subseq`, () => op_filter_subsequence(src, needle, { normalize: true, hooks: getHooks() }));
    });
    el('#btnCharAt')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcAdv').value);
        const idx = parseInt(el('#charAtIdx').value, 10) || 0;
        const char = el('#charAtChar').value;
        runOp(src, `char_at`, () => op_filter_char_at(src, idx, char, { hooks: getHooks() }));
    });
    el('#btnNgramJac')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcAdv').value);
        const target = el('#fuzzyTarget').value;
        runOp(src, `jaccard`, () => op_filter_ngram_jaccard(src, target, 2, 0.5, { hooks: getHooks() }));
    });
    el('#btnHamming')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcAdv').value);
        const target = el('#fuzzyTarget').value;
        runOp(src, `hamming`, () => op_filter_hamming(src, target, 1, false, { hooks: getHooks() }));
    });

    /* === Generators === */
    el('#btnNgram')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcNgram').value);
        const n = Math.max(1, parseInt(el('#ngramN').value, 10) || 2);
        const normBag = el('#ckPreNormNgram').checked;
        runOp(src, `ngram(${n})`, () => op_ngrams(src, n, { normalizeBefore: normBag, hooks: getHooks() }));
    });
    el('#btnSample')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcSample').value);
        const count = Math.max(1, parseInt(el('#sampleCount').value, 10) || 20);
        const seed = el('#sampleSeed').value;
        const normBag = el('#ckPreNormSample').checked;
        runOp(src, `sample`, () => op_sample(src, count, seed, { normalizeBefore: normBag, hooks: getHooks() }));
    });
    el('#btnCartesian')?.addEventListener('click', () => {
        const a = REG.get(el('#selSrcCartesianA').value);
        const b = REG.get(el('#selSrcCartesianB').value);
        const sep = el('#cartesianSep') ? el('#cartesianSep').value : el('#cartesianJoiner').value;
        const limit = parseInt(el('#cartesianLimit').value, 10) || 10000;
        const normBag = el('#ckPreNormCartesian').checked;
        runOp(a, `cartesian`, () => op_cartesian(a, b, sep, limit, { normalizeBefore: normBag, hooks: getHooks() }));
    });
    el('#btnAppend')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcAppend').value);
        const pre = el('#appendPrefix').value || '';
        const suf = el('#appendSuffix').value || '';
        const normBag = el('#ckPreNormAppend').checked;
        runOp(src, `append`, () => op_append(src, pre, suf, { normalizeBefore: normBag, hooks: getHooks() }));
    });
    el('#btnAnagram')?.addEventListener('click', () => {
        const src = REG.get(el('#selSrcAnagram').value);
        const normBag = el('#ckPreNormAnagram').checked;
        runOp(src, `anagram`, () => op_anagram(src, { normalizeBefore: normBag, hooks: getHooks() }));
    });
}
