/**
 * @fileoverview Bag model definition.
 * @summary Represents a collection of text items with metadata and status.
 * @description
 * The Bag is the central entity in the domain. It holds a Set of strings (items)
 * and metadata describing its origin (operation history) and current status
 * (ready or processing).
 *
 * @module domain/models/bag
 * @requires core/utils
 * @exports Bag
 */

import { nowISO } from '../../core/utils.js';

let _nextId = 0;

export class Bag {
    /**
     * @param {string} name 
     * @param {Iterable<string>} items 
     * @param {object} meta 
     */
    constructor(name, items, meta = {}) {
        this.id = _nextId++;
        this.name = name || `bag#${this.id}`;
        this.items = new Set(items || []);
        this.meta = Object.assign({}, meta);
        if (!this.meta.created_at) this.meta.created_at = nowISO();
        this.meta.size = this.items.size;

        // Progressive State
        this.status = this.meta.status || 'ready'; // 'ready' | 'processing'
        this.progress = { current: this.items.size, total: 0 };
    }

    /**
     * Returns a display label for the bag.
     * @returns {string}
     */
    label() {
        return `[${this.id}] ${this.name} (${this.items.size})${this.status === 'processing' ? ' ⏳' : ''}`;
    }

    /**
     * Updates progress for long-running operations.
     * @param {number} current 
     * @param {number} total 
     */
    updateProgress(current, total) {
        this.progress.current = current;
        this.progress.total = total;
    }

    /**
     * Marks the bag as ready and updates metadata.
     */
    finish() {
        this.status = 'ready';
        this.meta.status = 'ready'; // Persist
        this.meta.size = this.items.size;
        this.meta.completed_at = nowISO();
    }
}

/**
 * Resets the ID counter (mainly for testing/restoring).
 * @param {number} id 
 */
export function setNextId(id) {
    _nextId = id;
}

/**
 * Gets the current next ID.
 * @returns {number}
 */
export function getNextId() {
    return _nextId;
}
