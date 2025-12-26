import { REG, Bag } from './models.js';
import { el, log, appendOpLog, uniq, normNFKC, setSelectOptions, nowISO } from './utils.js';
import { renderBags, applyChoices } from './ui-bags.js';
import { captureState } from './history.js';

const BAG_DIR = './bag/';

function addBagFromWords(name, words, meta) {
    const b = new Bag(name, uniq(words.map(normNFKC).filter(Boolean)), meta || {});
    REG.add(b);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`+ Bag [${b.id}] '${b.name}' size=${b.items.size}`);
    return b;
}

export async function listJson() {
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

export async function loadSelectedJson() {
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

export function downloadBag(bag, format) {
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

export function initLoader() {
    el('#btnList')?.addEventListener('click', listJson);
    el('#selFile')?.addEventListener('change', loadSelectedJson);

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
}
