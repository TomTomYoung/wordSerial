/**
 * models.js
 *
 * Data models for the WordSerial application.
 * Manages Bag (Set of words) and BagRegistry (Collection of Bags).
 *
 * INPUT:
 *   - Raw strings (names, items) for Bag creation.
 *   - Snapshot objects for restoration.
 *
 * OUTPUT:
 *   - Bag instances.
 *   - Serialized state objects.
 */

import { nowISO } from './utils.js';

/* ====== Bag / Registry ====== */
let _nextId = 0;

export class Bag {
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
    label() { return `[${this.id}] ${this.name} (${this.items.size})${this.status === 'processing' ? ' ⏳' : ''}`; }

    updateProgress(current, total) {
        this.progress.current = current;
        this.progress.total = total;
    }

    finish() {
        this.status = 'ready';
        this.meta.status = 'ready'; // Persist
        this.meta.size = this.items.size;
        this.meta.completed_at = nowISO();
    }
}

export class BagRegistry {
    constructor() { this._bags = []; }
    add(b) { this._bags.push(b); return b.id; }
    get(id) { return this._bags.find(x => x.id === Number(id)); }
    all() { return this._bags.slice(); }
    indexOf(id) { return this._bags.findIndex(x => x.id === Number(id)); }
    remove(id) {
        const idx = this.indexOf(id);
        if (idx < 0) return false;
        this._bags.splice(idx, 1);
        return true;
    }
    clone(id, nameSuffix = ' copy') {
        const src = this.get(id);
        if (!src) return null;
        const clonedMeta = Object.assign({}, src.meta, {
            cloned_from: src.id,
            cloned_op: src.meta?.op || null,
            op: 'clone',
            src: src.id
        });
        delete clonedMeta.reapply_status;
        delete clonedMeta.reapply_error;
        const clone = new Bag(`${src.name}${nameSuffix}`, Array.from(src.items), clonedMeta);
        this.add(clone);
        return clone;
    }
    moveRelative(sourceId, targetId, placeBefore = false) {
        const fromIdx = this.indexOf(sourceId);
        const targetIdx = this.indexOf(targetId);
        if (fromIdx < 0 || targetIdx < 0 || sourceId === targetId) return false;
        const [bag] = this._bags.splice(fromIdx, 1);
        let insertIdx = this.indexOf(targetId);
        if (insertIdx < 0) return false;
        if (!placeBefore) insertIdx += 1;
        this._bags.splice(insertIdx, 0, bag);
        return true;
    }
    choices() {
        return this._bags
            .filter(b => b.status !== 'processing')
            .map(b => ({
                label: b.label(),
                value: String(b.id)
            }));
    }
    serialize() {
        return {
            nextId: _nextId,
            bags: this._bags.map(b => ({
                id: b.id,
                name: b.name,
                items: Array.from(b.items),
                meta: Object.assign({}, b.meta)
            }))
        };
    }
    restore(snapshot) {
        this._bags = snapshot.bags.map(data => {
            const bag = new Bag(data.name, data.items, Object.assign({}, data.meta));
            bag.id = data.id;
            bag.meta.size = bag.items.size;
            return bag;
        });
        _nextId = snapshot.nextId;
    }
}

export const REG = new BagRegistry();
