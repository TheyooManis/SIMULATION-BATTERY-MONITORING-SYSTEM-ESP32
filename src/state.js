const fs = require('fs');
const path = require('path');

const state = {
    // Settings for user config
    settings: (() => {
        const SETTINGS_PATH = path.join(__dirname, './database/settings.json');
        try {
            if (fs.existsSync(SETTINGS_PATH)) {
                return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
            }
        } catch (e) {
            console.error("Gagal memuat settings.json:", e.message);
        }
        return { targetVoltage: 110, dropTolerance: 10, maxGraphY: 150 };
    })(),
    saveSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        const SETTINGS_PATH = path.join(__dirname, './database/settings.json');
        try {
            fs.writeFileSync(SETTINGS_PATH, JSON.stringify(this.settings, null, 2));
        } catch (e) {
            console.error("Gagal menyimpan settings.json:", e.message);
        }
    },

    // Battery configuration
    nominalCellV: 2.23,

    // System log & history
    activeAlerts: {},
    history: (() => {
        const DB_PATH = path.join(__dirname, './database/log.json');
        try {
            if (fs.existsSync(DB_PATH)) {
                const fileContent = fs.readFileSync(DB_PATH, 'utf8');
                if (fileContent.trim()) {
                    const dbData = JSON.parse(fileContent);
                    return dbData.slice(-30);
                }
            }
        } catch (e) {
            console.error("Gagal memuat log.json saat startup:", e.message);
        }
        return [];
    })(),
    eventLog: [],
    logIdCounter: 1,

    // ESP32 / MQTT tracking
    esp32Connected: false,
    lastEsp32Time: null,
    lastEsp32TimeMs: 0,
    mqttBrokerConnected: false,

    // Thresholds
    tWarn: 38.0,
    tCrit: 45.0,
    iWarn: 60.0,
    iCrit: 75.0,

    logEvent(level, message) {
        const d = new Date();
        const timestamp = `${d.toLocaleDateString('id-ID')} ${d.toLocaleTimeString('id-ID', { hour12: false })}`;
        this.eventLog.unshift({ id: this.logIdCounter++, time: timestamp, level, message });
        if (this.eventLog.length > 50) this.eventLog.pop();
    },

    saveHistory() {
        const DB_PATH = path.join(__dirname, './database/log.json');
        try {
            fs.writeFileSync(DB_PATH, JSON.stringify(this.history, null, 2));
        } catch (e) {
            console.error("Gagal menyimpan log.json:", e.message);
        }
    },
    pushHistory(dataPoint, esp32TimeMs) {
        if (this.lastSavedHistoryTimeMs === esp32TimeMs) return; // do not save duplicate points
        
        this.history.push(dataPoint);
        if (this.history.length > 30) this.history.shift();
        this.lastSavedHistoryTimeMs = esp32TimeMs;
        this.saveHistory();
    },
    clearLogs(type) {
        if (type === 'activity' || type === 'all') {
            this.eventLog = [];
            this.logEvent('INFO', 'SYSTEM: Log aktivitas telah dihapus pengguna.');
        }
        if (type === 'history' || type === 'all') {
            this.history = [];
            this.saveHistory();
            this.logEvent('INFO', 'SYSTEM: Riwayat pengukuran telah dihapus pengguna.');
        }
    }
};

module.exports = state;
