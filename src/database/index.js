const fs = require('fs');
const path = require('path');

/**
 * DatabaseHandler – simple JSON‑file persistence layer.
 *
 * Usage example:
 *   const db = require('./database').handler; // singleton instance
 *   db.add({ TOKEN: 'abc123', data: { cell_id: 1, voltage: 0, current: 0, temperature: 0 } });
 *   const entry = db.findByToken('abc123');
 */
class DatabaseHandler {
    constructor() {
        this.dbPath = path.join(__dirname, 'database.json');
        this._load();
    }

    // Load JSON file (or start with empty array if missing/corrupt)
    _load() {
        try {
            const raw = fs.readFileSync(this.dbPath, 'utf8');
            this.database = raw.trim() ? JSON.parse(raw) : [];
        } catch (e) {
            // If file does not exist or is invalid, start fresh
            this.database = [];
        }
    }

    // Persist current in‑memory state to disk
    _save() {
        fs.writeFileSync(this.dbPath, JSON.stringify(this.database, null, 2), 'utf8');
    }

    /** Add a new entry (expects {TOKEN, data}) */
    add(entry) {
        if (!entry || typeof entry.TOKEN !== 'string') {
            throw new Error('Invalid entry – missing TOKEN');
        }
        this.database.push(entry);
        this._save();
    }

    /** Remove entry by its TOKEN – returns true if something was removed */
    remove(token) {
        const idx = this.database.findIndex(e => e.TOKEN === token);
        if (idx !== -1) {
            this.database.splice(idx, 1);
            this._save();
            return true;
        }
        return false;
    }

    /** Update the `data` field of an entry identified by TOKEN */
    update(token, newData) {
        const entry = this.database.find(e => e.TOKEN === token);
        if (entry) {
            entry.data = { ...entry.data, ...newData };
            this._save();
            return true;
        }
        return false;
    }

    /** Find a single entry by its TOKEN */
    findByToken(token) {
        return this.database.find(e => e.TOKEN === token) || null;
    }

    /** Replace an entry in-place (keeps same array position) by TOKEN */
    replaceEntry(token, newEntry) {
        const idx = this.database.findIndex(e => e.TOKEN === token);
        if (idx !== -1) {
            this.database[idx] = newEntry;
            this._save();
            return true;
        }
        return false;
    }

    /** Return all entries (read‑only array) */
    getAll() {
        return this.database.slice(); // shallow copy to avoid external mutation
    }
}


/**
 * DatabaseHandler – simple JSON‑file persistence layer.
 *
 * Usage example:
 *   const db = require('./database').handler; // singleton instance
 *   db.add({ TOKEN: 'abc123', data: { cell_id: 1, voltage: 0, current: 0, temperature: 0 } });
 *   const entry = db.findByToken('abc123');
 */
class BatteryTypeHandler {
    constructor() {
        this.dbPath = path.join(__dirname, 'batterytype.json');
        this._load();
    }

    // Load JSON file (or start with empty array if missing/corrupt)
    _load() {
        try {
            const raw = fs.readFileSync(this.dbPath, 'utf8');
            this.database = raw.trim() ? JSON.parse(raw) : [];
        } catch (e) {
            // If file does not exist or is invalid, start fresh
            this.database = [];
        }
    }

    // Persist current in‑memory state to disk
    _save() {
        fs.writeFileSync(this.dbPath, JSON.stringify(this.database, null, 2), 'utf8');
    }

    /** Add a new entry (expects {TOKEN, data}) */
    add(entry) {
        if (!entry || typeof entry.TOKEN !== 'string') {
            throw new Error('Invalid entry – missing TOKEN');
        }
        this.database.push(entry);
        this._save();
    }

    /** Remove entry by its TOKEN – returns true if something was removed */
    remove(id) {
        const idx = this.database.findIndex(e => e.id === id);
        if (idx !== -1) {
            this.database.splice(idx, 1);
            this._save();
            return true;
        }
        return false;
    }

    /** Update the `data` field of an entry identified by TOKEN */
    update(id, newData) {
        const entry = this.database.find(e => e.id === id);
        if (entry) {
            entry.data = { ...entry.data, ...newData };
            this._save();
            return true;
        }
        return false;
    }

    /** Find a single entry by its TOKEN */
    findById(id) {
        return this.database.find(e => e.id === id) || null;
    }

    /** Return all entries (read‑only array) */
    getAll() {
        return this.database.slice(); // shallow copy to avoid external mutation
    }
}

module.exports = { DatabaseHandler, BatteryTypeHandler };
