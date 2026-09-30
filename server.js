const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3030;

/** Modul internal dan eksternal */
const state = require('./src/state');
const apiRoutes = require('./src/routes');
const { initMQTT } = require('./src/mqttHandler');

// setup middleware bawaan
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// daftarkan semua rute API
app.use('/api', apiRoutes);

// rute fallback ke frontend (sekarang dirender oleh EJS)
app.get('*', (req, res) => {
    res.render('index', {
        title: 'Monitoring Battery Bank – PLTU',
        serverTime: new Date().toLocaleString()
    });
});

state.logEvent('INFO', '🚀 Server Monitoring Baterai IoT dimulai. Menunggu data dari ESP32 via MQTT...');

// mulai koneksi MQTT dan listen data masuk
initMQTT();

// nyalakan server
app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(`✅ Server berjalan di: http://localhost:${PORT}`);
    console.log(`📡 MQTT: Terhubung ke server`);
    console.log(`===========================================`);
});
