# Sistem Pemantauan Baterai DC UPS (Simulasi)

Proyek ini adalah sistem pemantauan baterai (Battery Monitoring System) untuk DC UPS yang disimulasikan menggunakan mikrokontroler ESP32 dan sensor INA219. Proyek ini dilengkapi dengan *dashboard* berbasis web untuk memantau data secara *real-time*.

## 🌟 Fitur Utama

- **Simulasi ESP32 (Wokwi)**: Simulasi perangkat keras menggunakan ESP32 lengkap dengan logika kustom untuk sensor arus dan tegangan INA219.
- **Dashboard Web Real-time**: Aplikasi server menggunakan **Express.js** dan **EJS** untuk menampilkan data sensor secara visual kepada pengguna.
- **Integrasi MQTT**: Menggunakan protokol MQTT untuk komunikasi dan pengiriman data (telemetri) antara simulasi ESP32 dan server web.

## 📁 Struktur Direktori

- `esp32_wokwi/` : Berisi kode simulasi perangkat keras. Terdapat *sketch* Arduino (`sketch.ino`), konfigurasi sirkuit Wokwi (`diagram.json`), dan file simulasi kustom chip INA219.
- `src/` : Berisi *source code* pendukung untuk logika *backend* server.
- `views/` : Berisi *template* EJS yang berfungsi sebagai antarmuka (UI) untuk *dashboard* web.
- `public/` : Berisi file aset statis seperti CSS, gambar, atau JavaScript sisi *client*.
- `server.js` : File utama (*entry point*) untuk menjalankan server web Express.js.
- `package.json` : Konfigurasi *project* Node.js beserta daftar *library* (dependensi) yang dibutuhkan.

## 🚀 Panduan Instalasi & Cara Menjalankan

### 1. Menjalankan Server Web (Dashboard)

Pastikan Anda telah menginstal [Node.js](https://nodejs.org/) di komputer Anda.

Buka terminal/command prompt, arahkan ke direktori proyek ini, lalu jalankan perintah berikut untuk menginstal semua dependensi yang dibutuhkan:

```bash
npm install
```

Setelah instalasi selesai, jalankan server web dengan perintah:

```bash
npm start
```
Secara otomatis server akan berjalan. Anda dapat membuka *dashboard* melalui *browser* di alamat: `http://localhost:3000` (atau port lain jika diatur berbeda di dalam `server.js`).

### 2. Menjalankan Simulasi ESP32

Simulasi ESP32 dikonfigurasi menggunakan platform [Wokwi](https://wokwi.com/).

- Anda dapat menjalankan simulasi langsung dari dalam folder `esp32_wokwi` dengan menggunakan ekstensi **Wokwi for VS Code**.
- Alternatifnya, Anda dapat mengimpor file `diagram.json` dan `sketch.ino` ke editor web Wokwi.
- **Catatan Penting**: Pastikan pengaturan broker MQTT di dalam *sketch* ESP32 sudah sesuai dengan broker yang dipantau oleh server web agar pengiriman data bisa berjalan dengan sukses.

## 🛠️ Teknologi yang Digunakan
- **Node.js & Express.js** (Web Server)
- **EJS** (Templating Engine HTML)
- **MQTT.js** (Protokol Komunikasi Data)
- **Wokwi** (Simulator Perangkat Keras / ESP32)
