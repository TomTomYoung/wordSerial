/**
 * utils.js
 *
 * Generic UI utilities and helpers for the application.
 *
 * INPUT:
 *   - DOM elements, specific app logic arguments
 *
 * OUTPUT:
 *   - DOM manipulation, Logging, Helper calculations
 */

import * as Kuro from './kuro.js';
import { Logic, normNFKC, setsAreEqual, levenshtein } from './logic.js';

/* ====== Exports from Logic/Kuro for back-compat/convenience ====== */
export { normNFKC, setsAreEqual, levenshtein };
export { toHiragana, toKatakana, toRomaji, ensureKuro } from './kuro.js';

/* ====== Generic Helpers ====== */
export const nowISO = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
export const uniq = a => Array.from(new Set(a));
export const el = q => document.querySelector(q);
export const parseIntSafe = (value, fallback = 0) => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
};

export function getBatchSize() {
    return Math.max(1, parseIntSafe(el('#batchSize')?.value, 200));
}

export function waitFrame() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/* ====== Logging ====== */
export function log(msg) {
    const verbose = el('#ckVerboseLog')?.checked;
    const stamped = `[${nowISO()}] ${msg}`;
    // Only append to DOM and Console if verbose logging is enabled
    if (!verbose) return;

    console.log(stamped);

    const host = el('#log');
    if (!host) return;
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = stamped;
    host.prepend(div);
    while (host.children.length > 150) host.removeChild(host.lastChild);
}

export function appendOpLog(msg) {
    const host = el('#opLog');
    if (!host) return;
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = `[${nowISO()}] ${msg}`;
    host.prepend(div);
    while (host.children.length > 150) host.removeChild(host.lastChild);
}

/* ====== Random Seeds (Pure but used in UI/Ops) ====== */
// Re-exporting or keeping here if they are only used for UI-side seed generation?
// Logic.js has its own internal implementations to be self-contained. 
// If `operations.js` uses Logic.sample, it passes the seed string.
// `operations.js` does NOT use these functions directly anymore, it delegates to Logic.
// So we can technically remove them if unused.
// Checking operations.js references...
// `operations.js` (refactored) calls `Logic.sample` passing `meta.seed`.
// `Logic.sample` uses its own `makeSeedFromString` / `mulberry32`.
// So we can remove these from here to avoid duplication confusion.
// ...But wait, let's keep them ONLY if `app.js` needs them?
// `app.js` does not seem to use `makeSeedFromString`.
// Safe to remove.

/* ====== DOM Component Helpers ====== */
export function findBagStatusElement(bagId) {
    return document.querySelector(`.bag-card[data-id="${bagId}"] [data-k="status"]`);
}

export function setBagStatusMessage(bagId, message) {
    const statusEl = findBagStatusElement(bagId);
    if (statusEl) {
        const text = message || '';
        statusEl.textContent = text;
        statusEl.title = text;
    }
}

export function describeBagLifecycle(bag) {
    if (bag?.meta?.reapply_status) return bag.meta.reapply_status;
    if (bag?.meta?.reapplied_at) return `↻ ${bag.meta.reapplied_at}`;
    if (bag?.meta?.updated_at) return `✎ ${bag.meta.updated_at}`;
    if (bag?.meta?.created_at) return `＋ ${bag.meta.created_at}`;
    return '';
}

export function setSelectOptions(sel, opts) {
    if (!sel) return;
    const v = sel.value;
    sel.innerHTML = '';
    for (const o of opts) {
        const op = document.createElement('option');
        op.value = o.value;
        op.textContent = o.label;
        sel.appendChild(op);
    }
    if (opts.length) {
        sel.value = v && opts.some(o => o.value === v) ? v : opts[opts.length - 1].value;
    }
}
