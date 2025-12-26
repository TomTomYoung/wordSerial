/**
 * @fileoverview DOM manipulation helpers.
 * @summary Helper functions for selecting elements, logging, and managing logs.
 * @description
 * Provides shorthand functions for `querySelector` (`el`), logging utilities that
 * write to both console and the on-screen log, and helper for delaying execution
 * (`waitFrame`) to allow UI updates.
 *
 * @module ui/dom
 * @requires core/utils
 * @exports el, log, appendOpLog, waitFrame, getBatchSize, setSelectOptions
 */

import { nowISO } from '../core/utils.js';

/**
 * Shorthand for document.querySelector.
 * @param {string} q Selector
 * @returns {Element|null}
 */
export const el = q => document.querySelector(q);

/**
 * Returns a promise that resolves after a delay to allow browser rendering and GC.
 * Increased from 0ms to 50ms to give garbage collector time to run.
 * @returns {Promise<void>}
 */
export function waitFrame() {
    return new Promise(resolve => setTimeout(resolve, 50));
}

/**
 * Reads batch size from UI input or returns default.
 * Increased default from 200 to 1000 for better performance with large datasets.
 * @returns {number}
 */
export function getBatchSize() {
    return Math.max(1, parseInt(el('#batchSize')?.value || 1000, 10));
}

/**
 * Logs a message to the console and the on-screen log (if enabled).
 * @param {string} msg 
 */
export function log(msg) {
    const verbose = el('#ckVerboseLog')?.checked;
    const stamped = `[${nowISO()}] ${msg}`;

    // Always console log for debugging, or maybe only if verbose? 
    // Original code: Only if verbose.
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

/**
 * Appends a message to the Operation Log.
 * @param {string} msg 
 */
export function appendOpLog(msg) {
    const host = el('#opLog');
    if (!host) return;
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = `[${nowISO()}] ${msg}`;
    host.prepend(div);
    while (host.children.length > 150) host.removeChild(host.lastChild);
}

/**
 * Populates a <select> element with options.
 * @param {HTMLSelectElement} sel 
 * @param {Array<{value:string, label:string}>} opts 
 */
export function setSelectOptions(sel, opts) {
    if (!sel) return;
    const v = sel.value;
    const oldOpts = Array.from(sel.options).map(o => o.value);

    // Optimization: Don't rebuild if identical? 
    // For now simple rebuild.
    sel.innerHTML = '';
    for (const o of opts) {
        const op = document.createElement('option');
        op.value = o.value;
        op.textContent = o.label;
        sel.appendChild(op);
    }

    if (opts.length) {
        // Try to keep selection if possible
        sel.value = v && opts.some(o => o.value === v) ? v : opts[opts.length - 1].value;
    }
}
