/**
 * @fileoverview Import Panel Logic.
 * @summary Handles user interactions in the Import tab.
 * @description
 * Wires up file selection, upload, and text paste events to create new Bags.
 *
 * @module ui/panels/import
 * @requires ui/dom
 * @requires infra/file-loader
 * @requires domain/models/bag
 * @requires domain/models/registry
 * @requires ui/components/bag-list
 * @requires store/history
 * @requires core/text
 * @exports initImportPanel
 */

import { el, log, appendOpLog, setSelectOptions } from '../dom.js';
import { listJsonFiles, fetchJson, parseBagData } from '../../infra/file-loader.js';
import { Bag } from '../../domain/models/bag.js';
import { REG } from '../../domain/models/registry.js';
import { renderBags, applyChoices } from '../components/bag-list.js';
import { captureState } from '../../store/history.js';
import { normNFKC } from '../../core/text.js';

function addBagFromWords(name, words, meta) {
    // uniq usage in original loader.js: const b = new Bag(..., uniq(words...))
    const uniqueWords = Array.from(new Set(words.map(normNFKC).filter(Boolean)));
    const b = new Bag(name, uniqueWords, meta || {});
    REG.add(b);
    applyChoices();
    renderBags();
    captureState();
    appendOpLog(`+ Bag [${b.id}] '${b.name}' size=${b.items.size}`);
    return b;
}

async function loadSelectedJson() {
    const sel = el('#selFile');
    const f = sel && sel.value;
    if (!f) {
        log('ファイル未選択');
        return;
    }
    try {
        const data = await fetchJson(f);
        addBagFromWords(f.replace(/\.json$/i, ''), data.words, {
            from: 'json',
            format: 'lemmas'
        });
        log(`読み込み OK: ${f} | 語数=${data.words.length}`);
    } catch (e) {
        log('読み込み失敗: ' + e.message);
    }
}

export function initImportPanel() {
    el('#btnList')?.addEventListener('click', async () => {
        const sel = el('#selFile');
        if (!sel) return;
        sel.innerHTML = '';
        try {
            const files = await listJsonFiles();
            if (files && files.length) {
                setSelectOptions(sel, files.map(f => ({ label: f, value: f })));
                log('一覧: ' + files.length + ' 件');
            } else {
                log('一覧取得失敗または空');
            }
        } catch (e) {
            log('IO Error: ' + e.message);
        }
    });

    el('#selFile')?.addEventListener('change', loadSelectedJson);

    el('#filePick')?.addEventListener('change', async (ev) => {
        const f = ev.target.files[0];
        if (!f) return;
        try {
            const txt = await f.text();
            const data = parseBagData(txt);
            addBagFromWords(f.name.replace(/\.json$/i, ''), data.words, {
                from: 'upload',
                format: 'lemmas'
            });
            log(`手動読み込み OK: ${f.name} | 語数=${data.words.length}`);
        } catch (e) {
            log('手動読み込み失敗: ' + e.message);
        }
    });

    el('#btnMakeBagFromText')?.addEventListener('click', () => {
        const nameInput = el('#bagNameInput');
        const name = normNFKC(nameInput.value) || 'input bag';
        const area = el('#pasteArea');
        const words = area.value.split(/\r?\n/).map(s => normNFKC(s)).filter(Boolean);

        if (!words.length) {
            const logEl = el('#importLog');
            if (logEl) logEl.textContent += (logEl.textContent ? '\n' : '') + '空入力';
            return;
        }
        addBagFromWords(name, words, {
            from: 'paste',
            normalized: 'NFKC'
        });
    });
}
