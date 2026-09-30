const express = require('express');
const router = express.Router();
const state = require('./state');
const { uid } = require('uid');
const { DatabaseHandler, BatteryTypeHandler } = require('./database');

// ============================================================
// Helper: threshold berdasarkan tegangan nominal per-sel
// ============================================================
function getThresholds() {
    // Compute total cells from persisted database
    const db = new DatabaseHandler();
    const entries = db.getAll();
    const totalCells = entries.reduce((max, e) => Math.max(max, e.data.cell_id), 0);
    const bankNominal = state.settings.targetVoltage || (totalCells * state.nominalCellV);
    const tol = (state.settings.dropTolerance || 10) / 100;
    return {
        // Bank voltage thresholds
        vLowCrit: bankNominal * (1 - tol - 0.05),
        vLowWarn: bankNominal * (1 - tol),
        vHighWarn: bankNominal * (1 + tol),
        vHighCrit: bankNominal * (1 + tol + 0.05),
        // Per-sel thresholds (OPzS 2V nominal)
        cellLowCrit: 1.80,
        cellLowWarn: 1.85,
        cellHighWarn: 2.30,
        cellHighCrit: 2.45,
        // Lainnya
        tWarn: state.tWarn,
        tCrit: state.tCrit,
        iWarn: state.iWarn,
        iCrit: state.iCrit,
    };
}

// ============================================================
// Helper: cek alarm dari data bank + per-sel
// ============================================================
function checkAlerts(v, t, i, cells, th) {
    // Determine total cells from database for bank‑voltage checks
    const db = new DatabaseHandler();
    const entries = db.getAll();
    const totalCells = entries.reduce((max, e) => Math.max(max, e.data.cell_id), 0);
    const alerts = [];

    // Bank voltage (hanya cek jika sudah ada data)
    if (v > 0 && totalCells > 0) {
        if (v < th.vLowCrit) alerts.push({ level: 'CRITICAL', key: 'V_LOW_CRIT', message: `🚨 Tegangan bank KRITIS rendah: ${v.toFixed(1)}V` });
        else if (v < th.vLowWarn) alerts.push({ level: 'WARNING', key: 'V_LOW_WARN', message: `⚠️ Tegangan bank rendah: ${v.toFixed(1)}V` });
        else if (v > th.vHighCrit) alerts.push({ level: 'CRITICAL', key: 'V_HIGH_CRIT', message: `🚨 Tegangan bank KRITIS tinggi: ${v.toFixed(1)}V` });
        else if (v > th.vHighWarn) alerts.push({ level: 'WARNING', key: 'V_HIGH_WARN', message: `⚠️ Tegangan bank tinggi: ${v.toFixed(1)}V` });
    }

    // Suhu rata-rata
    if (t > 0) {
        if (t > th.tCrit) alerts.push({ level: 'CRITICAL', key: 'T_CRIT', message: `🚨 Suhu KRITIS: ${t.toFixed(1)}°C — Bahaya Thermal Runaway!` });
        else if (t > th.tWarn) alerts.push({ level: 'WARNING', key: 'T_WARN', message: `⚠️ Suhu tinggi: ${t.toFixed(1)}°C` });
    }

    // Arus
    if (i > 0) {
        if (i > th.iCrit) alerts.push({ level: 'CRITICAL', key: 'I_CRIT', message: `🚨 Arus KRITIS: ${i.toFixed(2)}A` });
        else if (i > th.iWarn) alerts.push({ level: 'WARNING', key: 'I_WARN', message: `⚠️ Arus tinggi: ${i.toFixed(2)}A` });
    }

    // Cek per-sel
    // Cek per-sel menggunakan status langsung dari ESP32
    let critCells = [];
    let warnCells = [];
    cells.forEach(cell => {
        const s = (cell.status || '').toUpperCase();
        if (['CRITICAL', 'OVERCHARGE', 'OVERHEAT', 'LOW_WATER_LEVEL', 'LOW_VOLTAGE', 'OVERDISCHARGE'].includes(s)) {
            critCells.push(cell.id);
        } else if (['WARNING'].includes(s)) {
            warnCells.push(cell.id);
        }
    });

    if (critCells.length > 0) {
        alerts.push({ level: 'CRITICAL', key: 'CELL_CRIT', message: `🚨 Bahaya: Sel #${critCells.join(', #')} berada dalam kondisi KRITIS!` });
    }
    if (warnCells.length > 0) {
        alerts.push({ level: 'WARNING', key: 'CELL_WARN', message: `⚠️ Peringatan: Sel #${warnCells.join(', #')} memerlukan perhatian.` });
    }

    // ESP32 offline atau sel tidak mengirim data
    const offlineCells = cells.filter(c => c.hasData && !c.active).map(c => c.id);
    if (!state.esp32Connected && state.esp32MsgCount > 0) {
        let msg = '⚠️ ESP32 tidak mengirim data. Periksa simulasi Wokwi.';
        if (offlineCells.length > 0) {
            msg = `⚠️ ESP32 tidak mengirim data (Sel terputus: #${offlineCells.join(', #')}). Periksa simulasi Wokwi.`;
        }
        alerts.push({ level: 'WARNING', key: 'ESP32_OFFLINE', message: msg });
    } else if (offlineCells.length > 0) {
        alerts.push({ level: 'WARNING', key: 'CELL_OFFLINE', message: `⚠️ Sel terputus/tidak mengirim data: #${offlineCells.join(', #')}. Periksa ESP32/Wokwi.` });
    }

    return alerts;
}

// ============================================================
// GET /api/data
// ============================================================
// New endpoint to retrieve battery type definitions
router.get('/batterytypes', (req, res) => {
    const batteryTypes = new BatteryTypeHandler();
    const list = batteryTypes.getAll(); // assuming method returns array
    res.json(list);
});

router.get('/data', (req, res) => {
    const db = new DatabaseHandler();
    const dbEntries = db.getAll();

    // Compute aggregate values from persisted entries (only count cells with data)
    let sumV = 0, sumT = 0, sumI = 0, activeCount = 0;
    const now = Date.now();
    dbEntries.forEach(e => {
        const lastUpdate = e.data.lastUpdate || 0;
        const isOnline = lastUpdate > 0 && (now - lastUpdate) < 60000;
        if (isOnline) {
            const { voltage, temperature, current } = e.data;
            if (voltage > 0 || temperature > 0 || current > 0) {
                sumV += voltage;
                sumT += temperature;
                sumI += current;
                activeCount++;
            }
        }
    });
    const countForAvg = activeCount || 1;
    const v = sumV; // Bank Voltage = Total Sum
    const t = sumT / countForAvg; // Avg Temp
    const i = sumI / countForAvg; // Avg Current
    const th = getThresholds();

    // Build map of cells from persisted entries
    const cellMap = {};
    dbEntries.forEach(entry => {
        const { cell_id, voltage, current, temperature, waterLevel, status } = entry.data;
        const lastUpdate = entry.data.lastUpdate || null;
        const isOnline = lastUpdate && (Date.now() - lastUpdate) < 60000;
        const lastSeen = lastUpdate ? (() => {
            const d = new Date(lastUpdate);
            const dateStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = d.toLocaleTimeString('id-ID', { hour12: false });
            return `${dateStr} ${timeStr}`;
        })() : null;
        // A cell is considered "never sent data" if it has no lastUpdate timestamp
        const everSentData = lastUpdate !== null;
        cellMap[cell_id] = { token: entry.TOKEN, type: entry.type, voltage, current, temperature, waterLevel, rawStatus: status, lastSeen, isOnline, everSentData };
    });

    // Build array of cells for frontend (including placeholders)
    const totalCells = dbEntries.reduce((max, e) => Math.max(max, e.data.cell_id), 0);
    const cellArray = [];
    for (let id = 1; id <= totalCells; id++) {
        const cell = cellMap[id];
        if (cell) {
            let status = cell.rawStatus ? cell.rawStatus.toLowerCase() : 'normal';
            if (!cell.isOnline) {
                status = 'offline';
            }
            cellArray.push({
                token: cell.token,
                id,
                voltage: cell.voltage,
                current: cell.current,
                temperature: cell.temperature,
                waterLevel: cell.waterLevel,
                lastSeen: cell.lastSeen,
                status,
                active: cell.isOnline,
                // hasData is true only once the cell has ever sent real data
                hasData: cell.everSentData,
                msgCount: cell.msgCount,
                type: cell.type
            });
        } else {
            cellArray.push({ id, voltage: 0, current: 0, temperature: 0, waterLevel: 0, lastSeen: null, status: 'pending', active: false, hasData: false, msgCount: 0 });
        }
    }

    const alerts = checkAlerts(v, t, i, cellArray, th);

    // Identify cells that have not sent recent data (offline per cell)
    const missingCells = cellArray.filter(c => c.hasData && !c.active).map(c => c.id);

    // Log alert changes
    const currentKeys = {};
    alerts.forEach(a => currentKeys[a.key] = a);
    Object.keys(currentKeys).forEach(k => { if (!state.activeAlerts[k]) state.logEvent(currentKeys[k].level, `PICU: ${currentKeys[k].message}`); });
    Object.keys(state.activeAlerts).forEach(k => { if (!currentKeys[k]) state.logEvent('INFO', `PULIH: Kondisi "${k}" kembali normal.`); });
    state.activeAlerts = currentKeys;

    const overallStatus = alerts.some(a => a.level === 'CRITICAL') ? 'CRITICAL'
        : alerts.some(a => a.level === 'WARNING') ? 'WARNING' : 'NORMAL';

    res.json({
        // Nilai sensor agregat
        bankVoltage: v,
        avgTemperature: t,
        current: i,
        // Konfigurasi sel
        totalCells,
        nominalCellV: (() => { const db = new DatabaseHandler(); const entry = db.getAll().find(e => e.type && e.type.nominalVoltage); return entry ? entry.type.nominalVoltage : 0; })(),
        cells: cellArray,
        thresholds: th,
        // Missing cells info
        missingCells,
        // Status sistem
        status: overallStatus,
        activeAlerts: alerts,
        history: state.history,
        eventLog: state.eventLog,
        // ESP32 / MQTT info
        esp32Connected: state.esp32Connected,
        esp32MsgCount: state.esp32MsgCount,
        lastEsp32Time: state.lastEsp32Time,
        mqttBrokerConnected: state.mqttBrokerConnected,
    });
});

// src/routes.js – add‑battery route
router.post('/setup/battery/add/:typeId', (req, res) => {
    try {
        const db = new DatabaseHandler();
        const selltoken = uid(16);
        const existing = db.getAll();
        const usedIds = new Set(existing.map(e => e.data.cell_id));
        let newCellId = 1;
        while (usedIds.has(newCellId)) newCellId++;

        // Load battery types definition
        const batteryTypes = new BatteryTypeHandler();
        const typeId = req.params.typeId;
        // Validate typeId exists
        const typeInfo = typeId ? batteryTypes.findById(typeId) : null;
        if (!typeInfo) {
            return res.status(400).json({ success: false, message: 'Invalid or missing battery type' });
        }

        const data = {
            TOKEN: selltoken,
            type: typeInfo,
            data: { cell_id: newCellId, voltage: 0, current: 0, temperature: 0 },
            lastUpdate: Date.now()
        };
        db.add(data);
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error adding battery:', error);
        res.status(500).json({ success: false, message: 'Failed to add battery', error: error.message });
    }
});


router.delete('/setup/battery/:token', (req, res) => {
    try {
        const db = new DatabaseHandler();
        const token = req.params.token;
        const entry = db.getAll().find(e => e.TOKEN === token);
        if (!entry) {
            return res.status(404).json({ success: false, message: `Token ${token} not found` });
        }
        const cellId = entry.data.cell_id;
        const removed = db.remove(token);
        return res.json({ success: removed, cell_id: cellId });
    } catch (error) {
        console.error('Error deleting battery:', error);
        res.status(500).json({ success: false, message: 'Failed to delete battery', error: error.message });
    }
});

// Reset (zero out) a specific cell's data — keeps the SAME token
router.post('/setup/battery/reset/:token', (req, res) => {
    try {
        const db = new DatabaseHandler();
        const oldToken = req.params.token;
        const entry = db.findByToken(oldToken);
        if (!entry) {
            return res.status(404).json({ success: false, message: `Token ${oldToken} not found` });
        }

        const freshEntry = {
            TOKEN: oldToken,                        // Keep same token
            type: entry.type,                       // Keep same battery type
            data: {
                cell_id: entry.data.cell_id,        // Keep same cell ID slot
                voltage: 0,
                current: 0,
                temperature: 0
                // No lastUpdate → cell treated as "never sent data"
            }
        };

        db.replaceEntry(oldToken, freshEntry);
        state.logEvent('INFO', `RESET: Sel #${entry.data.cell_id} direset (Token tetap).`);
        return res.json({ success: true, cell_id: entry.data.cell_id, newToken: oldToken });
    } catch (error) {
        console.error('Error resetting battery:', error);
        res.status(500).json({ success: false, message: 'Failed to reset battery', error: error.message });
    }
});

// Clear logs and history
router.delete('/logs/:type', (req, res) => {
    try {
        const type = req.params.type;
        state.clearLogs(type);
        res.json({ success: true, message: `Logs (${type}) cleared successfully` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to clear logs', error: error.message });
    }
});

// Settings management
router.get('/settings', (req, res) => {
    res.json(state.settings);
});

router.post('/settings', express.json(), (req, res) => {
    try {
        state.saveSettings(req.body);
        res.json({ success: true, settings: state.settings });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to save settings', error: error.message });
    }
});

module.exports = router;
