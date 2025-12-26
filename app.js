/**
 * app.js
 *
 * Main entry point for the WordSerial application.
 * Handles DOM events, UI rendering, and wiring between Logic/Ops and Models.
 *
 * INPUT:
 *   - User interaction (Clicks, Inputs, File drops).
 *
 * OUTPUT:
 *   - DOM updates (HTML rendering, Status messages).
 */

/* ====== 履歴管理 ====== */
import { REG, Bag } from './models.js';
import * as Ops from './operations.js';
import {
    el, log, appendOpLog, uniq, normNFKC, parseIntSafe, nowISO,
    setSelectOptions, describeBagLifecycle, setBagStatusMessage
} from './utils.js';

const history = [];
let historyIndex = -1;

function captureState() {
    const snapshot = REG.serialize();
    history.splice(historyIndex + 1);
    history.push(snapshot);
    historyIndex = history.length - 1;
    updateUndoRedoButtons();
}

function restoreFromHistory() {
    if (historyIndex < 0 || historyIndex >= history.length) return;
    const snapshot = history[historyIndex];
    REG.restore(snapshot);
    renderBags();
    applyChoices();
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    const undoBtn = el('#btnUndo');
    const redoBtn = el('#btnRedo');
    if (undoBtn) undoBtn.disabled = historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = historyIndex >= history.length - 1;
}

function initHistory() {
    captureState();
}

/* ====== JSON列挙・ロード（bag/*.json） ====== */
const BAG_DIR = './bag/';

export function applyChoices() {
    const choices = REG.choices();
    const ids = ['#selSrcNorm', '#selSrcTransform', '#selSrcDel', '#selSrcFlt', '#selLkpFlt', '#selSrcUnionA',
        '#selSrcUnionB', '#selSrcLen', '#selSrcAffix', '#selSrcContains', '#selSrcRegex', '#selSrcFormat',
        '#selSrcNgram', '#selSrcSample', '#selExport', '#selSrcCartesianA', '#selSrcCartesianB', '#selSrcAppend',
        '#selSrcAnagram', '#selSrcSimilarity'
    ];
    ids.forEach(id => setSelectOptions(el(id), choices));
}

function addBagFromWords(name, words, meta) {
    const b = new Bag(name, uniq(words.map(normNFKC).filter(Boolean)), meta || {});
    REG.add(b);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`+ Bag [${b.id}] '${b.name}' size=${b.items.size}`);
    return b;
}

async function listJson() {
    const sel = el('#selFile');
    if (!sel) return;
    sel.innerHTML = '';
    try {
        const r = await fetch(BAG_DIR + '_files.txt', {
            cache: 'no-cache'
        });
        if (r.ok) {
            const t = await r.text();
            const files = t.split(/\r?\n/).map(s => s.trim()).filter(s => s && /\.json$/i.test(s));
            if (files.length) {
                setSelectOptions(sel, files.map(f => ({
                    label: f,
                    value: f
                })));
                log('一覧: _files.txt から ' + files.length + ' 件');
                return;
            }
        }
    } catch (_) { }
    try {
        const r = await fetch(BAG_DIR, {
            cache: 'no-cache'
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const html = await r.text();
        const files = [...html.matchAll(/href="([^"]+?\.json)"/gi)].map(m =>
            decodeURIComponent(m[1].split('/').pop()));
        const files2 = [...html.matchAll(/href='([^']+?\.json)'/gi)].map(m =>
            decodeURIComponent(m[1].split('/').pop()));
        const all = uniq([...(files || []), ...(files2 || [])]);
        if (all.length) {
            setSelectOptions(sel, all.map(f => ({
                label: f,
                value: f
            })));
            log('一覧: ディレクトリ HTML から ' + all.length + ' 件');
            return;
        }
        throw new Error('解析失敗');
    } catch (e) {
        log('列挙失敗: ' + e.message + '（bag/_files.txt を置くか、HTTP サーバのディレクトリ一覧を有効にしろ）');
    }
}

async function loadSelectedJson() {
    const sel = el('#selFile');
    const f = sel && sel.value;
    if (!f) {
        log('ファイル未選択');
        return;
    }
    try {
        const r = await fetch(BAG_DIR + f, {
            cache: 'no-cache'
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const raw = await r.text();
        const head = raw.trim()[0];
        if (head !== '[' && head !== '{') throw new Error('JSON ではなく HTML 等が返っている');
        const data = JSON.parse(raw);
        const words = [];
        for (const obj of (Array.isArray(data) ? data : [data])) {
            if (obj && Array.isArray(obj.lemmas)) words.push(...obj.lemmas);
        }
        addBagFromWords(f.replace(/\.json$/i, ''), words, {
            from: 'json',
            format: 'lemmas'
        });
        log(`読み込み OK: ${f} | 語数=${words.length}`);
    } catch (e) {
        log('読み込み失敗: ' + e.message);
    }
}

/* ====== 手動アップロード / 貼り付け ====== */
el('#filePick')?.addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
        const txt = await f.text();
        const head = txt.trim()[0];
        if (head !== '[' && head !== '{') throw new Error('JSON でない');
        const data = JSON.parse(txt);
        const words = [];
        for (const obj of (Array.isArray(data) ? data : [data])) {
            if (obj && Array.isArray(obj.lemmas)) words.push(...obj.lemmas);
        }
        addBagFromWords(f.name.replace(/\.json$/i, ''), words, {
            from: 'upload',
            format: 'lemmas'
        });
        log(`手動読み込み OK: ${f.name} | 語数=${words.length}`);
    } catch (e) {
        log('手動読み込み失敗: ' + e.message);
    }
});
el('#btnMakeBagFromText')?.addEventListener('click', () => {
    const name = normNFKC(el('#bagNameInput').value) || 'input bag';
    const words = uniq(el('#pasteArea').value.split(/\r?\n/).map(s => normNFKC(s)).filter(Boolean));
    if (!words.length) {
        el('#importLog').textContent += (el('#importLog').textContent ? '\n' : '') + '空入力';
        return;
    }
    addBagFromWords(name, words, {
        from: 'paste',
        normalized: 'NFKC'
    });
});

/* ====== 操作ボタン ====== */
el('#btnNorm')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcNorm').value);
    if (!src) return;
    appendOpLog(`normalize(hiragana)… [${src.id}] ${src.name}`);
    const nb = await Ops.op_normalize_hiragana(src);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnKatakana')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcNorm').value);
    if (!src) return;
    appendOpLog(`normalize(katakana)… [${src.id}] ${src.name}`);
    const nb = await Ops.op_normalize_katakana(src);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnRomaji')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcTransform').value);
    if (!src) return;
    const normBag = el('#ckPreNormTransform').checked;
    appendOpLog(`to_romaji (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    const nb = await Ops.op_to_romaji(src, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnUpper')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcTransform').value);
    if (!src) return;
    const normBag = el('#ckPreNormTransform').checked;
    appendOpLog(`to_upper (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    const nb = await Ops.op_to_upper(src, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnLower')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcTransform').value);
    if (!src) return;
    const normBag = el('#ckPreNormTransform').checked;
    appendOpLog(`to_lower (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    const nb = await Ops.op_to_lower(src, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnReverse')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcTransform').value);
    if (!src) return;
    const normBag = el('#ckPreNormTransform').checked;
    appendOpLog(`reverse (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    const nb = await Ops.op_reverse(src, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnDel')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcDel').value);
    if (!src) return;
    const chars = el('#delChars').value || '';
    const normIn = el('#ckNormDel').checked;
    const normBag = el('#ckPreNormDel').checked;
    appendOpLog(`delete chars "${chars}" (normalize_input=${normIn}, bag_hira=${normBag}) … [${src.id}]
        ${src.name}`);
    const nb = await Ops.op_delete_chars(src, chars, normIn, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnFlt')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcFlt').value),
        lkp = REG.get(el('#selLkpFlt').value);
    if (!src || !lkp) return;
    const normSrc = el('#ckPreNormFltSrc').checked;
    const normLookup = el('#ckPreNormFltLookup').checked;
    appendOpLog(`filter_in lookup=[${lkp.id}:${lkp.name}] (bag_hira=${normSrc}, lookup_hira=${normLookup}) …
        [${src.id}] ${src.name}`);
    const nb = await Ops.op_filter_in(src, lkp, normSrc, normLookup);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnUnion')?.addEventListener('click', async () => {
    const a = REG.get(el('#selSrcUnionA').value);
    const b = REG.get(el('#selSrcUnionB').value);
    if (!a || !b) return;
    const normBag = el('#ckPreNormUnion').checked;
    appendOpLog(`union (bag_hira=${normBag}) … [${a.id}] ${a.name} + [${b.id}] ${b.name}`);
    const nb = await Ops.op_union(a, b, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnDiff')?.addEventListener('click', async () => {
    const a = REG.get(el('#selSrcUnionA').value);
    const b = REG.get(el('#selSrcUnionB').value);
    if (!a || !b) return;
    const normBag = el('#ckPreNormUnion').checked;
    appendOpLog(`difference (bag_hira=${normBag}) … [${a.id}] ${a.name} - [${b.id}] ${b.name}`);
    const nb = await Ops.op_difference(a, b, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnIntersect')?.addEventListener('click', async () => {
    const a = REG.get(el('#selSrcUnionA').value);
    const b = REG.get(el('#selSrcUnionB').value);
    if (!a || !b) return;
    const normBag = el('#ckPreNormUnion').checked;
    appendOpLog(`intersection (bag_hira=${normBag}) … [${a.id}] ${a.name} ∩ [${b.id}] ${b.name}`);
    const nb = await Ops.op_intersection(a, b, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnSymDiff')?.addEventListener('click', async () => {
    const a = REG.get(el('#selSrcUnionA').value);
    const b = REG.get(el('#selSrcUnionB').value);
    if (!a || !b) return;
    const normBag = el('#ckPreNormUnion').checked;
    appendOpLog(`symmetric difference (bag_hira=${normBag}) … [${a.id}] ${a.name} △ [${b.id}] ${b.name}`);
    const nb = await Ops.op_symmetric_difference(a, b, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnLengthFilter')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcLen').value);
    if (!src) return;
    const min = Math.max(0, parseIntSafe(el('#lenMin').value, 0));
    const max = Math.max(min, parseIntSafe(el('#lenMax').value, min));
    const normBag = el('#ckPreNormLen').checked;
    appendOpLog(`filter length [${min}, ${max}] (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    const nb = await Ops.op_filter_length(src, min, max, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnPrefix')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcAffix').value);
    if (!src) return;
    const prefixRaw = el('#prefixValue').value;
    const prefix = normNFKC(prefixRaw);
    if (!prefix) {
        log('prefix を入力してください');
        return;
    }
    const normBag = el('#ckPreNormAffix').checked;
    appendOpLog(`filter prefix "${prefix}" (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    const nb = await Ops.op_filter_prefix(src, prefixRaw, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnSuffix')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcAffix').value);
    if (!src) return;
    const suffixRaw = el('#suffixValue').value;
    const suffix = normNFKC(suffixRaw);
    if (!suffix) {
        log('suffix を入力してください');
        return;
    }
    const normBag = el('#ckPreNormAffix').checked;
    appendOpLog(`filter suffix "${suffix}" (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    const nb = await Ops.op_filter_suffix(src, suffixRaw, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnContains')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcContains').value);
    if (!src) return;
    const needleRaw = el('#containsValue').value;
    const needle = normNFKC(needleRaw);
    if (!needle) {
        log('検索文字列を入力してください');
        return;
    }
    const normBag = el('#ckPreNormContains').checked;
    appendOpLog(`filter contains "${needle}" (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    const nb = await Ops.op_filter_contains(src, needleRaw, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnRegex')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcRegex').value);
    const pattern = el('#regexPattern').value;
    const invert = el('#regexInvert').checked;
    if (!src) return;
    if (!pattern) {
        log('正規表現を入力してください');
        return;
    }
    const invertLabel = invert ? ' (invert)' : '';
    const normBag = el('#ckPreNormRegex').checked;
    appendOpLog(`filter_regex /${pattern}/${invertLabel} (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    let nb;
    try {
        nb = await Ops.op_filter_regex(src, pattern, invert, normBag);
    } catch (e) {
        log(`正規表現エラー: ${e.message}`);
        appendOpLog('× 正規表現エラー');
        return;
    }
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnDedupe')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcFormat').value);
    if (!src) return;
    const normBag = el('#ckPreNormFormat').checked;
    appendOpLog(`dedupe_chars (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    const nb = await Ops.op_dedupe_chars(src, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnSortAsc')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcFormat').value);
    if (!src) return;
    const normBag = el('#ckPreNormFormat').checked;
    appendOpLog(`sort asc (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    const nb = await Ops.op_sort(src, 'asc', 'ja', normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnSortDesc')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcFormat').value);
    if (!src) return;
    const normBag = el('#ckPreNormFormat').checked;
    appendOpLog(`sort desc (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    const nb = await Ops.op_sort(src, 'desc', 'ja', normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnReplace')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcFormat').value);
    if (!src) return;
    const fromRaw = el('#replaceFrom').value;
    const toRaw = el('#replaceTo').value || '';
    const from = normNFKC(fromRaw);
    const to = normNFKC(toRaw);
    if (!from) {
        log('置換対象 (from) を入力してください');
        return;
    }
    const normBag = el('#ckPreNormFormat').checked;
    appendOpLog(`replace "${from}" → "${to}" (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    const nb = await Ops.op_replace(src, fromRaw, toRaw, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnNgram')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcNgram').value);
    if (!src) return;
    const n = Math.max(1, parseIntSafe(el('#ngramN').value, 2));
    const normBag = el('#ckPreNormNgram').checked;
    appendOpLog(`ngrams n=${n} (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    const nb = await Ops.op_ngrams(src, n, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnSample')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcSample').value);
    if (!src) return;
    const count = Math.max(1, parseIntSafe(el('#sampleCount').value, 20));
    const seedRaw = normNFKC(el('#sampleSeed').value);
    const seedInfo = seedRaw ? ` seed=${seedRaw}` : '';
    const normBag = el('#ckPreNormSample').checked;
    appendOpLog(`sample count=${count}${seedInfo} (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    const nb = await Ops.op_sample(src, count, seedRaw || null, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});

/* ====== New Operations: Cartesian, Append, Anagram, Similarity ====== */
el('#btnCartesian')?.addEventListener('click', async () => {
    const a = REG.get(el('#selSrcCartesianA').value);
    const b = REG.get(el('#selSrcCartesianB').value);
    if (!a || !b) return;
    const sep = el('#cartesianSep') ? el('#cartesianSep').value : el('#cartesianJoiner').value;
    const limit = Math.max(1, parseIntSafe(el('#cartesianLimit').value, 10000));
    const normBag = el('#ckPreNormCartesian').checked;
    appendOpLog(`cartesian (bag_hira=${normBag}) … [${a.id}] x [${b.id}] (limit=${limit})`);
    const nb = await Ops.op_cartesian(a, b, sep, limit, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnAppend')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcAppend').value);
    if (!src) return;
    const prefix = el('#appendPrefix').value || '';
    const suffix = el('#appendSuffix').value || '';
    const normBag = el('#ckPreNormAppend').checked;
    appendOpLog(`append (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    const nb = await Ops.op_append(src, prefix, suffix, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnAnagram')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcAnagram').value);
    if (!src) return;
    const normBag = el('#ckPreNormAnagram').checked;
    appendOpLog(`anagram (bag_hira=${normBag}) … [${src.id}] ${src.name}`);
    const nb = await Ops.op_anagram(src, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});
el('#btnSimilarity')?.addEventListener('click', async () => {
    const src = REG.get(el('#selSrcSimilarity').value);
    if (!src) return;
    const target = el('#simTarget').value;
    const dist = parseIntSafe(el('#simDist').value, 2);
    const normBag = el('#ckPreNormSimilarity').checked;
    appendOpLog(`similarity … [${src.id}] target=${target}, dist=${dist}`);
    const nb = await Ops.op_filter_similarity(src, target, dist, normBag);
    REG.add(nb);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`→ NewBag [${nb.id}] size=${nb.items.size}`);
});


/* ====== Export ====== */
function downloadBag(bag, format) {
    if (!bag) return;
    let blob, filename;
    const stamp = nowISO().replace(/[:T-]/g, '').slice(0, 14);
    if (format === 'json') {
        const data = {
            name: bag.name,
            id: bag.id,
            items: Array.from(bag.items)
        };
        blob = new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json'
        });
        filename = `${bag.name || 'bag'}_${stamp}.json`;
    } else if (format === 'csv') {
        blob = new Blob([Array.from(bag.items).join('\n')], {
            type: 'text/csv'
        });
        filename = `${bag.name || 'bag'}_${stamp}.csv`;
    } else {
        blob = new Blob([Array.from(bag.items).join('\n')], {
            type: 'text/plain'
        });
        filename = `${bag.name || 'bag'}_${stamp}.txt`;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    log(`Export ${format.toUpperCase()}: ${filename}`);
}
document.querySelectorAll('.export-actions button').forEach(btn => {
    btn.addEventListener('click', () => {
        const bag = REG.get(el('#selExport').value);
        if (!bag) {
            log('Export 対象が選択されていません');
            return;
        }
        downloadBag(bag, btn.dataset.format);
    });
});

/* ====== Undo / Redo ====== */
el('#btnUndo')?.addEventListener('click', () => {
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    restoreFromHistory();
    appendOpLog('⮪ Undo');
});
el('#btnRedo')?.addEventListener('click', () => {
    if (historyIndex >= history.length - 1) return;
    historyIndex += 1;
    restoreFromHistory();
    appendOpLog('⮫ Redo');
});

let dragSourceId = null;

/* ====== Bag一覧（編集/適用 + 範囲/全表示） ====== */
function renderBags() {
    const host = el('#bagsArea');
    if (!host) return;
    dragSourceId = null;
    host.innerHTML = '';
    for (const b of REG.all()) {
        const details = document.createElement('details');
        details.className = 'bag-card';
        details.dataset.id = b.id;
        details.draggable = true;
        const sum = document.createElement('summary');
        sum.innerHTML = `<div class="bag-title">[${b.id}] ${b.name}</div>
              <div class="muted small">size=${b.items.size} | op=${b.meta.op || 'root'} | norm=${b.meta.normalized ||
            '-'}</div>`;
        details.appendChild(sum);

        const meta = document.createElement('div');
        meta.className = 'bag-meta';
        meta.textContent = Object.entries(b.meta).map(([k, v]) => `${k}: ${v}`).join('\n');
        details.appendChild(meta);

        const bar = document.createElement('div');
        bar.className = 'preview-bar';
        bar.innerHTML = `
              <span class="muted small badge">Preview</span>
              <label class="muted small">offset <input class="input tight" type="number" min="0" value="0"
                  data-k="off"></label>
              <label class="muted small">limit <input class="input tight" type="number" min="1" value="200"
                  data-k="lim"></label>
              <label class="muted small"><input type="checkbox" data-k="all"> 全表示</label>
              <button class="btn ghost" data-k="copy">クリップボード</button>
              <button class="btn" data-k="edit">編集モード</button>
              <button class="btn ok" data-k="apply" disabled>編集を適用</button>
              <span class="muted mono small" data-k="count"></span>
              `;
        details.appendChild(bar);

        const ta = document.createElement('textarea');
        ta.className = 'preview mono';
        ta.rows = 10;
        ta.readOnly = true;
        details.appendChild(ta);

        const offEl = bar.querySelector('input[data-k="off"]');
        const limEl = bar.querySelector('input[data-k="lim"]');
        const allEl = bar.querySelector('input[data-k="all"]');
        const copyBtn = bar.querySelector('[data-k="copy"]');
        const editBtn = bar.querySelector('[data-k="edit"]');
        const applyBtn = bar.querySelector('[data-k="apply"]');
        const cntEl = bar.querySelector('[data-k="count"]');
        const copyOriginalLabel = copyBtn?.textContent || '';

        function renderRange() {
            const items = Array.from(b.items).sort((a, c) => a.localeCompare(c, 'ja'));
            cntEl.textContent = `total=${items.length}`;
            let off = Math.max(0, parseInt(offEl.value || 0, 10));
            let lim = Math.max(1, parseInt(limEl.value || 200, 10));
            if (allEl.checked) {
                off = 0;
                lim = items.length;
            }
            ta.value = items.slice(off, off + lim).join('\n');
        }
        offEl.addEventListener('input', renderRange);
        limEl.addEventListener('input', renderRange);
        allEl.addEventListener('change', renderRange);
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(ta.value);
                copyBtn.textContent = 'コピー済み';
                setTimeout(() => {
                    copyBtn.textContent = copyOriginalLabel;
                }, 1200);
            } catch { }
        });

        let editing = false;
        editBtn.addEventListener('click', () => {
            editing = !editing;
            ta.readOnly = !editing;
            editBtn.textContent = editing ? '編集中…' : '編集モード';
            applyBtn.disabled = !editing;
            if (editing) {
                ta.value = Array.from(b.items).sort((a, c) => a.localeCompare(c, 'ja')).join('\n');
            } else {
                renderRange();
            }
        });
        applyBtn.addEventListener('click', () => {
            const lines = ta.value.split(/\r?\n/).map(normNFKC).filter(Boolean);
            b.items = new Set(uniq(lines));
            b.meta.size = b.items.size;
            b.meta.op = 'manual_edit';
            b.meta.updated_at = nowISO();
            delete b.meta.reapply_status;
            delete b.meta.reapply_error;
            ta.readOnly = true;
            editing = false;
            applyBtn.disabled = true;
            editBtn.textContent = '編集モード';
            sum.innerHTML = `<div class="bag-title">[${b.id}] ${b.name}</div>
              <div class="muted small">size=${b.items.size} | op=${b.meta.op || 'root'} | norm=${b.meta.normalized ||
                '-'}</div>`;
            renderRange();
            applyChoices();
            captureState();
            appendOpLog(`edit → Bag [${b.id}] size=${b.items.size}`);
        });

        details.addEventListener('toggle', () => {
            if (details.open) renderRange();
        });

        const actions = document.createElement('div');
        actions.className = 'bag-actions';
        actions.innerHTML = `
              <button class="btn ghost" data-k="reapply">再適用</button>
              <button class="btn ghost" data-k="duplicate">複製</button>
              <button class="btn warn" data-k="remove">削除</button>
              <span class="muted small status" data-k="status"></span>
              `;
        details.appendChild(actions);

        const statusEl = actions.querySelector('[data-k="status"]');
        if (statusEl) {
            const statusText = describeBagLifecycle(b);
            statusEl.textContent = statusText;
            statusEl.title = statusText;
        }

        const reapplyBtn = actions.querySelector('[data-k="reapply"]');
        const duplicateBtn = actions.querySelector('[data-k="duplicate"]');
        const removeBtn = actions.querySelector('[data-k="remove"]');

        reapplyBtn.addEventListener('click', async () => {
            reapplyBtn.disabled = true;
            try {
                // Call reapply logic with callbacks for UI updates
                await Ops.reapplySeries(b.id, {
                    onStatus: (bagId, msg) => setBagStatusMessage(bagId, msg),
                    onUpdate: () => {
                        renderBags();
                        applyChoices();
                        captureState();
                    }
                });
            } finally {
                reapplyBtn.disabled = false;
            }
        });

        duplicateBtn.addEventListener('click', () => {
            const clone = REG.clone(b.id);
            if (!clone) return;
            applyChoices();
            renderBags();
            captureState();
            appendOpLog(`⧉ Clone → [${clone.id}] from [${b.id}] ${b.name}`);
        });

        removeBtn.addEventListener('click', () => {
            if (!window.confirm(`Bag [${b.id}] ${b.name} を削除しますか？`)) return;
            if (REG.remove(b.id)) {
                applyChoices();
                renderBags();
                captureState();
                appendOpLog(`− Remove Bag [${b.id}] ${b.name}`);
            }
        });

        details.addEventListener('dragstart', e => {
            dragSourceId = b.id;
            details.classList.add('dragging');
            e.dataTransfer?.setData('text/plain', String(b.id));
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        });

        details.addEventListener('dragend', () => {
            details.classList.remove('dragging');
        });

        details.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            details.classList.add('drag-target');
        });

        details.addEventListener('dragleave', () => {
            details.classList.remove('drag-target');
        });

        details.addEventListener('drop', e => {
            e.preventDefault();
            details.classList.remove('drag-target');
            const srcId = parseInt(e.dataTransfer.getData('text/plain'), 10);
            if (!Number.isNaN(srcId) && srcId !== b.id) {
                // Move srcId to before/after b.id
                // Simple logic: insert before this bag
                if (REG.moveRelative(srcId, b.id, true)) {
                    renderBags();
                    applyChoices();
                    captureState();
                }
            }
        });

        host.appendChild(details);
    }
}

/* ====== Initialization ====== */
el('#btnList')?.addEventListener('click', listJson);
el('#selFile')?.addEventListener('change', loadSelectedJson);
window.addEventListener('DOMContentLoaded', () => {
    initHistory();
    listJson().then(() => {
        // Auto-load if only one file? No, just list.
    });
});
