/**
 * @fileoverview File loading and parsing.
 * @summary Handles listing and loading JSON files from the server or local upload.
 * @description
 * Provides functions to fetch the bag list from the server, parse JSON content,
 * and handle file exports.
 *
 * @module infra/file-loader
 * @requires core/utils
 * @exports listJsonFiles, fetchJson, parseBagData, exportBagData
 */

import { nowISO } from '../core/utils.js';

const BAG_DIR = './data/bags/';

/**
 * Fetches the list of available JSON files from the server.
 * Tries _files.txt first, then HTML directory listing.
 * @returns {Promise<string[]>} List of filenames
 */
export async function listJsonFiles() {
    try {
        const r = await fetch(BAG_DIR + '_files.txt', { cache: 'no-cache' });
        if (r.ok) {
            const t = await r.text();
            return t.split(/\r?\n/).map(s => s.trim()).filter(s => s && /\.json$/i.test(s));
        }
    } catch (_) { }

    try {
        const r = await fetch(BAG_DIR, { cache: 'no-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const html = await r.text();
        const files = [...html.matchAll(/href="([^"]+?\.json)"/gi)].map(m => decodeURIComponent(m[1].split('/').pop()));
        const files2 = [...html.matchAll(/href='([^']+?\.json)'/gi)].map(m => decodeURIComponent(m[1].split('/').pop()));
        const all = Array.from(new Set([...(files || []), ...(files2 || [])]));
        return all;
    } catch (e) {
        console.warn('Listing failed:', e);
        throw e;
    }
}

/**
 * Fetches and parses a specific JSON file.
 * @param {string} filename 
 * @returns {Promise<{name: string, words: string[]}>}
 */
export async function fetchJson(filename) {
    const r = await fetch(BAG_DIR + filename, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const raw = await r.text();
    return parseBagData(raw);
}

/**
 * Parses raw JSON string into standard bag format.
 * @param {string} rawJson 
 * @returns {{words: string[]}}
 */
export function parseBagData(rawJson) {
    const head = rawJson.trim()[0];
    if (head !== '[' && head !== '{') throw new Error('Invalid JSON format');
    const data = JSON.parse(rawJson);
    const words = [];
    for (const obj of (Array.isArray(data) ? data : [data])) {
        if (obj && Array.isArray(obj.lemmas)) words.push(...obj.lemmas);
    }
    return { words };
}

/**
 * Triggers a browser download for a bag.
 * @param {object} bag Bag object 
 * @param {'json'|'csv'|'txt'} format 
 */
export function exportBagData(bag, format) {
    if (!bag) return;
    let blob, filename;
    const stamp = nowISO().replace(/[:T-]/g, '').slice(0, 14);

    if (format === 'json') {
        const data = {
            name: bag.name,
            id: bag.id,
            items: Array.from(bag.items)
        };
        blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        filename = `${bag.name || 'bag'}_${stamp}.json`;
    } else if (format === 'csv') {
        blob = new Blob([Array.from(bag.items).join('\n')], { type: 'text/csv' });
        filename = `${bag.name || 'bag'}_${stamp}.csv`;
    } else {
        blob = new Blob([Array.from(bag.items).join('\n')], { type: 'text/plain' });
        filename = `${bag.name || 'bag'}_${stamp}.txt`;
    }

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}
