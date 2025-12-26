import { REG } from './models.js';
import * as Ops from './operations.js';
import {
    el, log, appendOpLog, uniq, normNFKC, parseIntSafe, nowISO,
    setSelectOptions, describeBagLifecycle, setBagStatusMessage
} from './utils.js';
import { captureState } from './history.js';

let dragSourceId = null;

export function applyChoices() {
    const choices = REG.choices();
    const ids = ['#selSrcNorm', '#selSrcTransform', '#selSrcDel', '#selSrcFlt', '#selLkpFlt', '#selSrcUnionA',
        '#selSrcUnionB', '#selSrcLen', '#selSrcAffix', '#selSrcContains', '#selSrcRegex', '#selSrcFormat',
        '#selSrcNgram', '#selSrcSample', '#selExport', '#selSrcCartesianA', '#selSrcCartesianB', '#selSrcAppend',
        '#selSrcAnagram', '#selSrcSimilarity'
    ];
    ids.forEach(id => setSelectOptions(el(id), choices));
}

export function renderBags() {
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
