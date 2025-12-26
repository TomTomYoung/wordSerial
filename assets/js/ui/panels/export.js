/**
 * @fileoverview Export Panel Logic.
 * @summary Handles export actions (JSON/CSV/TXT).
 * @description
 * Wires up export buttons to the file loader's export functionality.
 *
 * @module ui/panels/export
 * @requires ui/dom
 * @requires domain/models/registry
 * @requires infra/file-loader
 * @exports initExportPanel
 */

import { el, log } from '../dom.js';
import { REG } from '../../domain/models/registry.js';
import { exportBagData } from '../../infra/file-loader.js';

export function initExportPanel() {
    document.querySelectorAll('.export-actions button').forEach(btn => {
        btn.addEventListener('click', () => {
            const bag = REG.get(el('#selExport').value);
            if (!bag) {
                log('Export 対象が選択されていません');
                return;
            }
            exportBagData(bag, btn.dataset.format);
        });
    });
}
