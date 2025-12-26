/**
 * @fileoverview Application state history (Undo/Redo).
 * @summary Manages snapshots of the Bag Registry.
 * @description
 * Stores serialized versions of the registry to allow navigating back and forth
 * through application states.
 *
 * @module store/history
 * @requires domain/models/registry
 * @exports initHistory, captureState, undo, redo, restoreFromHistory, getHistoryState
 */

import { REG } from '../domain/models/registry.js';

const history = [];
let historyIndex = -1;

// Event listeners for UI updates could be registered here, 
// or we expose a callback mechanism.
let _onUpdateCallback = null;

export function setHistoryUpdateCallback(cb) {
    _onUpdateCallback = cb;
}

function notifyUpdate() {
    if (_onUpdateCallback) {
        _onUpdateCallback({
            canUndo: historyIndex > 0,
            canRedo: historyIndex < history.length - 1
        });
    }
}

export function captureState() {
    // Only capture if changed? For now, naive.
    const snapshot = REG.serialize();
    if (historyIndex >= 0) {
        // Simple check to avoid duplicates if called redundantly
        // (Assuming simple serialization comparison is cheap enough vs deep check)
        // Actually, just push.
    }

    // Truncate future
    if (historyIndex < history.length - 1) {
        history.splice(historyIndex + 1);
    }

    history.push(snapshot);
    historyIndex = history.length - 1;
    notifyUpdate();
}

export function restoreFromHistory() {
    if (historyIndex < 0 || historyIndex >= history.length) return;
    const snapshot = history[historyIndex];
    REG.restore(snapshot);
    notifyUpdate();
}

export function undo() {
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    restoreFromHistory();
}

export function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex += 1;
    restoreFromHistory();
}

export function initHistory() {
    // Capture initial empty state
    if (history.length === 0) captureState();
}
