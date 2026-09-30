const mqtt = require('mqtt');
const {
    DatabaseHandler
} = require('./database');
const state = require('./state');

/**
 * Inisialisasi koneksi MQTT client ke broker.
 * Berfungsi menerima telemetri masuk lalu meng-update database.json berdasarkan token baterai.
 * @function initMQTT
 */
function initMQTT() {
    const mqttClient = mqtt.connect('mqtt://47.84.177.69', {
        clientId: 'NodeJS-BatteryMonitor-' + Math.random().toString(16).slice(2, 8),
        reconnectPeriod: 3000
    });

    // event saat sukses konek ke broker
    mqttClient.on('connect', () => {
        state.mqttBrokerConnected = true;
        state.logEvent('INFO', 'SYSTEM: Koneksi ke Broker MQTT berhasil dibangun. Menunggu transmisi telemetri...');

        const topics = [
            'pltu/battery/sensor',
            'pltu/battery/alert'
        ];

        mqttClient.subscribe(topics, err => {
            if (err) {
                state.logEvent('ERROR', `SYSTEM: Gagal registrasi beberapa topik - ${err.message}`);
            } else {
                state.logEvent('INFO', `SYSTEM: Semua topik telemetri aktif.`);
            }
        });
    });

    // event saat ada pesan baru masuk
    mqttClient.on('message', (topic, message) => {
        try {
            const data = JSON.parse(message.toString());
            switch (topic) {
                case 'pltu/battery/sensor':
                    handleBatterySensorData(data, topic);
                    break;
                case 'pltu/battery/alert':
                    console.log(`MQTT: Alert masuk - ${JSON.stringify(data)}`);
                    break;
                default:
                    console.warn(`MQTT: Menerima data dari topik tidak dikenal [${topic}]`);
            }
        } catch (e) {
            console.error('MQTT: Invalid JSON payload:', e.message);
        }
    });

    // handle kalau koneksi putus atau ada error
    mqttClient.on('reconnect', () => {
        state.mqttBrokerConnected = false;
        state.logEvent('WARNING', 'MQTT: Terputus, mencoba menghubungkan ulang...');
    });

    mqttClient.on('error', err => {
        state.mqttBrokerConnected = false;
        state.logEvent('WARNING', `MQTT Error: ${err.message}`);
    });

    handleBatterySensorData = (data) => {
        try {
            const db = new DatabaseHandler();
            const entry = db.findByToken(data.token);
            if (!entry) {
                console.warn(`MQTT: Unknown token ${data.token}`);
                return;
            }

            // save cell id
            const cellId = entry.data.cell_id;

            // updated data
            const updated = {};
            if (data.voltage !== undefined) updated.voltage = parseFloat(data.voltage) || 0;
            if (data.current !== undefined) updated.current = parseFloat(data.current) || 0;
            if (data.temperature !== undefined) updated.temperature = parseFloat(data.temperature) || 0;
            if (data.waterLevel !== undefined) updated.waterLevel = parseFloat(data.waterLevel) || 0;
            if (data.status !== undefined) updated.status = data.status;

            // lastUpdate
            const newData = {
                cell_id: entry.data.cell_id,
                ...updated,
                lastUpdate: Date.now()
            };

            // simpan langsung ke file JSON (database.json)
            db.update(data.token, newData);

            // update cache memory sementara buat dipakai dashboard
            const d = new Date();
            state.lastEsp32Time = `${d.toLocaleDateString('id-ID')} ${d.toLocaleTimeString('id-ID', { hour12: false })}`;
            state.lastEsp32TimeMs = newData.lastUpdate;
            state.esp32Connected = true;
            state.esp32MsgCount += 1;

            // hitung total tegangan bank dkk, trus push ke history
            const allEntries = db.getAll();
            let sumV = 0,
                sumT = 0,
                sumI = 0,
                activeCount = 0;
            const now = Date.now();
            allEntries.forEach(e => {
                const isOnline = (now - (e.data.lastUpdate || 0)) <= 60000;
                if (isOnline) {
                    const cv = e.data.voltage,
                        ct = e.data.temperature,
                        ci = e.data.current;
                    if (cv > 0 || ct > 0 || ci > 0) {
                        sumV += cv;
                        sumT += ct;
                        sumI += ci;
                        activeCount++;
                    }
                }
            });
            const cCount = activeCount || 1;
            const bankV = sumV;
            const avgT = sumT / cCount;
            const avgI = sumI / cCount;

            // Pakai status dari ESP32 langsung
            let currentStatus = newData.status || 'NORMAL';
            if (activeCount === 0) {
                currentStatus = 'OFFLINE';
            }

            state.pushHistory({
                time: state.lastEsp32Time,
                cell_id: cellId,
                cell_v: newData.voltage || 0,
                cell_t: newData.temperature || 0,
                cell_i: newData.current || 0,
                cell_w: newData.waterLevel || 0,
                voltage: bankV,
                temperature: avgT,
                current: avgI,
                status: currentStatus
            }, state.lastEsp32TimeMs);



            const isPerCell = data.cell_id !== undefined && data.total_cells !== undefined;
            const idInfo = isPerCell ? `(Sel #${data.cell_id}/${data.total_cells})` : '';
            console.log(`[MQTT] Sel#${cellId} ${idInfo} V=${newData.voltage} I=${newData.current} T=${newData.temperature} W=${newData.waterLevel} STATUS=${currentStatus}`);
        } catch (e) {

        }
    }


    // interval cek status offline keseluruhan ESP32
    setInterval(() => {
        if (!state.lastEsp32TimeMs) return;
        const diffSec = (Date.now() - state.lastEsp32TimeMs) / 1000;
        if (diffSec > 60 && state.esp32Connected) {
            state.esp32Connected = false;
            state.logEvent('WARNING', `ESP32: Offline! Tidak ada data masuk dari ESP32 manapun selama ${Math.round(diffSec)} detik.`);
        }
    }, 5000);
}

module.exports = {
    initMQTT
};