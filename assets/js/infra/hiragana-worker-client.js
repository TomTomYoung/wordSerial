/**
 * @fileoverview Thin wrapper to offload kana normalization to a Web Worker.
 * @summary Sends batches to `assets/js/workers/hiragana-worker.js` and streams back chunks.
 */

const WORKER_URL = new URL('../workers/hiragana-worker.js', import.meta.url);
let worker = null;
let requestId = 0;
const inflight = new Map();

function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(WORKER_URL);
    worker.onmessage = (evt) => {
        const { id, type, chunk, message } = evt.data || {};
        const pending = inflight.get(id);
        if (!pending) return;
        if (type === 'chunk') {
            pending.onChunk?.(chunk || []);
        } else if (type === 'done') {
            pending.resolve();
            inflight.delete(id);
        } else if (type === 'error') {
            pending.reject(new Error(message || 'Worker error'));
            inflight.delete(id);
        }
    };
    worker.onerror = (err) => {
        // Fail all pending requests so caller can fallback gracefully.
        for (const [id, pending] of inflight.entries()) {
            pending.reject(err);
            inflight.delete(id);
        }
    };
    return worker;
}

/**
 * Converts items to kana in the worker.
 * @param {Iterable<string>} items
 * @param {'hiragana'|'katakana'} target
 * @param {{onChunk?: function(Array<string>):void, chunkSize?: number}} opts
 */
export async function convertInWorker(items, target = 'hiragana', opts = {}) {
    const w = ensureWorker();
    const id = `hiragana-${++requestId}`;
    const { onChunk, chunkSize = 4000 } = opts;

    const promise = new Promise((resolve, reject) => {
        inflight.set(id, { resolve, reject, onChunk });
    });

    w.postMessage({
        id,
        target,
        chunkSize,
        items: Array.from(items)
    });

    return promise;
}
