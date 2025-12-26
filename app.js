/**
 * app.js
 *
 * Main entry point for the WordSerial application.
 * Handles DOM events, UI rendering, and wiring between Logic/Ops and Models.
 */

import { REG } from './models.js';
import * as Ops from './operations.js';
import { el, log, appendOpLog, normNFKC, parseIntSafe, setBagStatusMessage } from './utils.js';
import { renderBags, applyChoices } from './ui-bags.js';
import { initHistory, captureState, undo, redo } from './history.js';
import { initLoader, listJson } from './loader.js';

/* ====== General Helper - runOp ====== */
async function runOp(src, desc, action) {
    if (!src) return;
    appendOpLog(desc);
    try {
        const nb = await action();
        if (nb) {
            REG.add(nb);
            applyChoices();
            renderBags();
            captureState();
            appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
        }
    } catch (e) {
        log('Error: ' + e.message);
        appendOpLog('× Error: ' + e.message);
    }
}

/* ====== Operations ====== */
el('#btnNorm')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcNorm').value);
    runOp(src, `normalize(hiragana)… [${src?.id}] ${src?.name}`,
        () => Ops.op_normalize_hiragana(src));
});
el('#btnKatakana')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcNorm').value);
    runOp(src, `normalize(katakana)… [${src?.id}] ${src?.name}`,
        () => Ops.op_normalize_katakana(src));
});

el('#btnRomaji')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcTransform').value);
    const normBag = el('#ckPreNormTransform').checked;
    runOp(src, `to_romaji (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_to_romaji(src, normBag));
});
el('#btnUpper')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcTransform').value);
    const normBag = el('#ckPreNormTransform').checked;
    runOp(src, `to_upper (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_to_upper(src, normBag));
});
el('#btnLower')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcTransform').value);
    const normBag = el('#ckPreNormTransform').checked;
    runOp(src, `to_lower (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_to_lower(src, normBag));
});
el('#btnReverse')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcTransform').value);
    const normBag = el('#ckPreNormTransform').checked;
    runOp(src, `reverse (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_reverse(src, normBag));
});

el('#btnDel')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcDel').value);
    const chars = el('#delChars').value || '';
    const normIn = el('#ckNormDel').checked;
    const normBag = el('#ckPreNormDel').checked;
    runOp(src, `delete chars "${chars}" (normalize_input=${normIn}, bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_delete_chars(src, chars, normIn, normBag));
});

el('#btnFlt')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcFlt').value);
    const lkp = REG.get(el('#selLkpFlt').value);
    if (!src || !lkp) return;
    const normSrc = el('#ckPreNormFltSrc').checked;
    const normLookup = el('#ckPreNormFltLookup').checked;
    runOp(src, `filter_in lookup=[${lkp.id}:${lkp.name}] (bag_hira=${normSrc}, lookup_hira=${normLookup}) … [${src.id}] ${src.name}`,
        () => Ops.op_filter_in(src, lkp, normSrc, normLookup));
});

el('#btnUnion')?.addEventListener('click', () => {
    const a = REG.get(el('#selSrcUnionA').value);
    const b = REG.get(el('#selSrcUnionB').value);
    const normBag = el('#ckPreNormUnion').checked;
    if (a) runOp(a, `union (bag_hira=${normBag}) … [${a.id}] ${a.name} + [${b?.id}] ${b?.name}`,
        () => Ops.op_union(a, b, normBag));
});

el('#btnDiff')?.addEventListener('click', () => {
    const a = REG.get(el('#selSrcUnionA').value);
    const b = REG.get(el('#selSrcUnionB').value);
    const normBag = el('#ckPreNormUnion').checked;
    if (a) runOp(a, `difference (bag_hira=${normBag}) … [${a.id}] ${a.name} - [${b?.id}] ${b?.name}`,
        () => Ops.op_difference(a, b, normBag));
});

el('#btnIntersect')?.addEventListener('click', () => {
    const a = REG.get(el('#selSrcUnionA').value);
    const b = REG.get(el('#selSrcUnionB').value);
    const normBag = el('#ckPreNormUnion').checked;
    if (a) runOp(a, `intersection (bag_hira=${normBag}) … [${a.id}] ${a.name} ∩ [${b?.id}] ${b?.name}`,
        () => Ops.op_intersection(a, b, normBag));
});

el('#btnSymDiff')?.addEventListener('click', () => {
    const a = REG.get(el('#selSrcUnionA').value);
    const b = REG.get(el('#selSrcUnionB').value);
    const normBag = el('#ckPreNormUnion').checked;
    if (a) runOp(a, `symmetric difference (bag_hira=${normBag}) … [${a.id}] ${a.name} △ [${b?.id}] ${b?.name}`,
        () => Ops.op_symmetric_difference(a, b, normBag));
});

el('#btnLengthFilter')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcLen').value);
    const min = Math.max(0, parseIntSafe(el('#lenMin').value, 0));
    const max = Math.max(min, parseIntSafe(el('#lenMax').value, min));
    const normBag = el('#ckPreNormLen').checked;
    runOp(src, `filter length [${min}, ${max}] (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_filter_length(src, min, max, normBag));
});

el('#btnPrefix')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcAffix').value);
    const prefixRaw = el('#prefixValue').value;
    const prefix = normNFKC(prefixRaw);
    if (!prefix) { log('prefix を入力してください'); return; }
    const normBag = el('#ckPreNormAffix').checked;
    runOp(src, `filter prefix "${prefix}" (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_filter_prefix(src, prefixRaw, normBag));
});

el('#btnSuffix')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcAffix').value);
    const suffixRaw = el('#suffixValue').value;
    const suffix = normNFKC(suffixRaw);
    if (!suffix) { log('suffix を入力してください'); return; }
    const normBag = el('#ckPreNormAffix').checked;
    runOp(src, `filter suffix "${suffix}" (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_filter_suffix(src, suffixRaw, normBag));
});

el('#btnContains')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcContains').value);
    const needleRaw = el('#containsValue').value;
    const needle = normNFKC(needleRaw);
    if (!needle) { log('検索文字列を入力してください'); return; }
    const normBag = el('#ckPreNormContains').checked;
    runOp(src, `filter contains "${needle}" (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_filter_contains(src, needleRaw, normBag));
});

el('#btnRegex')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcRegex').value);
    const pattern = el('#regexPattern').value;
    const invert = el('#regexInvert').checked;
    if (!pattern) { log('正規表現を入力してください'); return; }
    const invertLabel = invert ? ' (invert)' : '';
    const normBag = el('#ckPreNormRegex').checked;
    runOp(src, `filter_regex /${pattern}/${invertLabel} (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_filter_regex(src, pattern, invert, normBag));
});

el('#btnDedupe')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcFormat').value);
    const normBag = el('#ckPreNormFormat').checked;
    runOp(src, `dedupe_chars (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_dedupe_chars(src, normBag));
});

el('#btnSortAsc')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcFormat').value);
    const normBag = el('#ckPreNormFormat').checked;
    runOp(src, `sort asc (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_sort(src, 'asc', 'ja', normBag));
});
el('#btnSortDesc')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcFormat').value);
    const normBag = el('#ckPreNormFormat').checked;
    runOp(src, `sort desc (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_sort(src, 'desc', 'ja', normBag));
});

el('#btnReplace')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcFormat').value);
    const fromRaw = el('#replaceFrom').value;
    const toRaw = el('#replaceTo').value || '';
    const from = normNFKC(fromRaw);
    const to = normNFKC(toRaw);
    if (!from) { log('置換対象 (from) を入力してください'); return; }
    const normBag = el('#ckPreNormFormat').checked;
    runOp(src, `replace "${from}" → "${to}" (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_replace(src, fromRaw, toRaw, normBag));
});

el('#btnNgram')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcNgram').value);
    const n = Math.max(1, parseIntSafe(el('#ngramN').value, 2));
    const normBag = el('#ckPreNormNgram').checked;
    runOp(src, `ngrams n=${n} (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_ngrams(src, n, normBag));
});

el('#btnSample')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcSample').value);
    const count = Math.max(1, parseIntSafe(el('#sampleCount').value, 20));
    const seedRaw = normNFKC(el('#sampleSeed').value);
    const seedInfo = seedRaw ? ` seed=${seedRaw}` : '';
    const normBag = el('#ckPreNormSample').checked;
    runOp(src, `sample count=${count}${seedInfo} (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_sample(src, count, seedRaw || null, normBag));
});

/* ====== New Operations: Cartesian, Append, Anagram, Similarity ====== */
el('#btnCartesian')?.addEventListener('click', () => {
    const a = REG.get(el('#selSrcCartesianA').value);
    const b = REG.get(el('#selSrcCartesianB').value);
    const sep = el('#cartesianSep') ? el('#cartesianSep').value : el('#cartesianJoiner').value;
    const limit = Math.max(1, parseIntSafe(el('#cartesianLimit').value, 10000));
    const normBag = el('#ckPreNormCartesian').checked;
    if (a) runOp(a, `cartesian (bag_hira=${normBag}) … [${a.id}] x [${b?.id}] (limit=${limit})`,
        () => Ops.op_cartesian(a, b, sep, limit, normBag));
});

el('#btnAppend')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcAppend').value);
    const prefix = el('#appendPrefix').value || '';
    const suffix = el('#appendSuffix').value || '';
    const normBag = el('#ckPreNormAppend').checked;
    runOp(src, `append (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_append(src, prefix, suffix, normBag));
});

el('#btnAnagram')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcAnagram').value);
    const normBag = el('#ckPreNormAnagram').checked;
    runOp(src, `anagram (bag_hira=${normBag}) … [${src?.id}] ${src?.name}`,
        () => Ops.op_anagram(src, normBag));
});

el('#btnSimilarity')?.addEventListener('click', () => {
    const src = REG.get(el('#selSrcSimilarity').value);
    const target = el('#simTarget') ? el('#simTarget').value : el('#similarityTarget').value; // Check ID consistency
    const dist = parseIntSafe(el('#simDist') ? el('#simDist').value : el('#similarityDist').value, 2);
    const normBag = el('#ckPreNormSimilarity').checked;
    runOp(src, `similarity … [${src?.id}] target=${target}, dist=${dist}`,
        () => Ops.op_filter_similarity(src, target, dist, normBag));
});

/* ====== Undo / Redo Binding ====== */
el('#btnUndo')?.addEventListener('click', () => {
    undo();
    appendOpLog('⮪ Undo');
});
el('#btnRedo')?.addEventListener('click', () => {
    redo();
    appendOpLog('⮫ Redo');
});

el('#btnApplyAll')?.addEventListener('click', async () => {
    const btn = el('#btnApplyAll');
    if (!btn) return;
    btn.disabled = true;
    try {
        await Ops.reapplySeries(null, {
            onStatus: (bagId, msg) => setBagStatusMessage(bagId, msg),
            onUpdate: () => {
                renderBags();
                applyChoices();
                captureState();
            }
        });
    } finally {
        btn.disabled = false;
    }
});

/* ====== Initialization ====== */
window.addEventListener('DOMContentLoaded', () => {
    initHistory();
    initLoader();
    listJson().then(() => {
        // Init complete
    });

    /* ====== Tabs ====== */
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            const panel = document.querySelector(`.tab-panel[data-panel="${tab}"]`);
            if (panel) panel.classList.add('active');
        });
    });
});
