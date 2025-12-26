import { REG } from './models.js';
import { el } from './utils.js';
import { renderBags, applyChoices } from './ui-bags.js';

const history = [];
let historyIndex = -1;

export function captureState() {
    const snapshot = REG.serialize();
    history.splice(historyIndex + 1);
    history.push(snapshot);
    historyIndex = history.length - 1;
    updateUndoRedoButtons();
}

export function restoreFromHistory() {
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

export function initHistory() {
    captureState();
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
