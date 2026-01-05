/**
 * @fileoverview Main Entry Point.
 * @summary Initializes the application.
 * @description
 * Sets up global error handling, initializes UI panels, history, and the bag list.
 * Functions as the bootstrapper for the refactored modular architecture.
 *
 * @module app
 * @requires ui/panels/*
 * @requires ui/components/bag-list
 * @requires store/history
 * @requires domain/models/registry
 * @requires infra/file-loader
 * @requires ui/layout
 */

import { initImportPanel } from './ui/panels/import.js';
import { initOperationsPanel } from './ui/panels/operations.js';
import { initExportPanel } from './ui/panels/export.js';
import { initTabs } from './ui/layout.js';
import { renderBags, startProgressPoller, applyChoices } from './ui/components/bag-list.js';
import { initHistory, undo, redo, setHistoryUpdateCallback } from './store/history.js';
import { REG } from './domain/models/registry.js';
import { listJsonFiles } from './infra/file-loader.js';
import { el, log } from './ui/dom.js';

/* Global Error Handler */
window.addEventListener('error', e => {
    log('Global Error: ' + e.message);
    const errEl = document.getElementById('debug_err');
    if (errEl) errEl.textContent = e.message;
});

/* Initialize App */
document.addEventListener('DOMContentLoaded', async () => {
    log('App initializing...');

    try {
        // Init state
        REG.restore([]); // Clear or load default?
        // Actually we likely want to begin empty or load defaults.
        // Original app.js called REG.add(Bag('Default Bag', ...)) if empty.

        // Init UI Panels
        initImportPanel();
        initOperationsPanel();
        initExportPanel();

        // Init History
        initHistory();
        setHistoryUpdateCallback(({ canUndo, canRedo }) => {
            const btnUndo = el('#btnUndo');
            const btnRedo = el('#btnRedo');
            if (btnUndo) btnUndo.disabled = !canUndo;
            if (btnRedo) btnRedo.disabled = !canRedo;
        });

        el('#btnUndo')?.addEventListener('click', undo);
        el('#btnRedo')?.addEventListener('click', redo);

        // Init Bag List & Poller
        renderBags();
        startProgressPoller();
        applyChoices();

        log('Modules loaded. App Ready.');

        // Tab Switching Logic
        initTabs();

        // Auto-load list logic from legacy app

        // Auto-load list logic from legacy app
        try {
            const listBtn = el('#btnList');
            if (listBtn) listBtn.click(); // Trigger list load
        } catch (_) { }

    } catch (e) {
        log('Init Failed: ' + e.message);
        console.error(e);
    }
});
