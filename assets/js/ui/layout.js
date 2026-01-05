/**
 * @fileoverview Layout and UI structure management.
 * @summary Controls general UI layout interactions like tabs.
 * @description
 * 
 * @module ui/layout
 */

/**
 * Initializes tab switching logic for .tab-button and .tab-panel.
 */
export function initTabs() {
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            document.querySelectorAll('.tab-button').forEach(b => b.classList.toggle('active', b === btn));
            document.querySelectorAll('.tab-panel').forEach(p => {
                p.classList.toggle('active', p.dataset.panel === target);
                if (p.style.display && p.dataset.panel === target) p.style.display = ''; // Clear inline hide if any
            });
        });
    });
}
