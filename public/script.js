// ==============================================================================
// DOM ELEMENTS
// ==============================================================================
const dispVoltage = document.getElementById('disp-voltage');
const dispTemp = document.getElementById('disp-temp');
const dispCurrent = document.getElementById('disp-current');
const statusCard = document.getElementById('dashboard-status-card');
const statusBadge = document.getElementById('status-badge-text');
const alertsList = document.getElementById('alerts-list');
const logConsole = document.getElementById('log-console');
const tableBody = document.getElementById('measurements-tbody');
const lastUpdateEl = document.getElementById('last-update-time');
const infoBrokerStatus = document.getElementById('info-broker-status');
const cellPanel = document.getElementById('cell-panel');
const cellGridWrap = document.getElementById('cell-grid-wrapper');
const cellConfigInfo = document.getElementById('cell-config-info');
const cellModal = document.getElementById('cell-modal');
const btnCellClose = document.getElementById('btn-cell-close');
const btnCellOk = document.getElementById('btn-cell-ok');
const btnCellDelete = document.getElementById('btn-cell-delete');
const btnCellReset = document.getElementById('btn-cell-reset');
const btnShowConfig = document.getElementById('btn-show-config');

// ==============================================================================
// STATE
// ==============================================================================
let activeAlertKeys = new Set();
let lastTotalCells = 0;
let latestCells = [];
let audioCtx = null;
let batteryTypes = [];  // cache dari /api/batterytypes

// ==============================================================================
// LOAD BATTERY TYPES FROM API
// ==============================================================================
async function loadBatteryTypes() {
    try {
        const r = await fetch('/api/batterytypes');
        batteryTypes = await r.json();
    } catch (e) {
        console.warn('Gagal memuat battery types:', e);
        batteryTypes = [];
    }
}

// ==============================================================================
// ADD BATTERY – SweetAlert2 POPUP
// ==============================================================================
async function showAddBatteryDialog() {
    if (batteryTypes.length === 0) await loadBatteryTypes();

    const optionsHtml = batteryTypes.map(t =>
        `<option value="${t.id}">${t.jenis} (${t.tipeUmum}) — ${t.nominalVoltage}V</option>`
    ).join('');

    const { value: typeId, isConfirmed } = await Swal.fire({
        title: '<span style="font-size:16px;letter-spacing:.5px">TAMBAH BATTERY BARU</span>',
        html: `
          <div style="text-align:left;margin-bottom:8px;font-size:12px;color:#94a3b8;">
            Pilih tipe baterai untuk ditambahkan ke sistem:
          </div>
          <select id="swal-type-select" class="swal2-select" style="width:100%;font-size:13px;">
            <option value="">-- Pilih Tipe Baterai --</option>
            ${optionsHtml}
          </select>
          <div id="swal-type-info" style="margin-top:12px;padding:10px;background:rgba(0,229,255,.06);border:1px solid rgba(0,229,255,.15);border-radius:8px;font-size:11px;color:#94a3b8;min-height:48px;display:none;"></div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Tambah',
        cancelButtonText: 'Batal',
        focusConfirm: false,
        didOpen: () => {
            const sel = document.getElementById('swal-type-select');
            const info = document.getElementById('swal-type-info');
            sel.addEventListener('change', () => {
                const found = batteryTypes.find(t => t.id === sel.value);
                if (found) {
                    info.style.display = 'block';
                    info.innerHTML = `
                      <b style="color:#00e5ff">${found.jenis}</b><br>
                      📌 ${found.karakteristik}<br>
                      🏭 ${found.penggunaan}<br>
                      ⚡ Nominal: <span style="color:#00e5ff;font-family:monospace">${found.nominalVoltage} V/sel</span>
                    `;
                } else {
                    info.style.display = 'none';
                }
            });
        },
        preConfirm: () => {
            const val = document.getElementById('swal-type-select').value;
            if (!val) { Swal.showValidationMessage('Pilih tipe baterai terlebih dahulu'); return false; }
            return val;
        }
    });

    if (!isConfirmed || !typeId) return;

    Swal.fire({ title: 'Menambahkan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const r = await fetch(`/api/setup/battery/add/${typeId}`, { method: 'POST' });
        const res = await r.json();
        if (res.success) {
            await Swal.fire({
                icon: 'success',
                title: 'Berhasil Ditambahkan!',
                html: `
                  <div style="font-size:13px;color:#94a3b8;">
                    Token: <span style="font-family:monospace;color:#00e5ff">${res.data.TOKEN}</span><br>
                    Cell ID: <b style="color:#00e676">#${res.data.data.cell_id}</b><br>
                    Tipe: <b>${res.data.type?.jenis || typeId}</b>
                  </div>
                `,
                timer: 4000,
                timerProgressBar: true,
            });
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal', text: res.message || 'Terjadi kesalahan.' });
        }
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'Error', text: 'Tidak dapat terhubung ke server.' });
    }
}

if (btnShowConfig) btnShowConfig.addEventListener('click', showAddBatteryDialog);

// ==============================================================================
// CELL DETAIL MODAL
// ==============================================================================
function openCellModal(cell) {
    document.getElementById('cell-modal-title').textContent = `DETAIL SEL #${cell.id}`;
    document.getElementById('cd-id').textContent = `Sel #${cell.id}`;
    document.getElementById('cd-token').textContent = cell.token || '—';
    document.getElementById('cd-voltage').textContent = cell.hasData ? `${cell.voltage.toFixed(2)} V` : '— (belum ada data)';
    document.getElementById('cd-current').textContent = cell.hasData ? `${cell.current.toFixed(2)} A` : '—';
    document.getElementById('cd-temp').textContent = cell.hasData ? `${cell.temperature.toFixed(1)} °C` : '—';
    const cdWater = document.getElementById('cd-water');
    if (cdWater) cdWater.textContent = cell.hasData && cell.waterLevel !== undefined ? `${cell.waterLevel.toFixed(1)} %` : '—';
    document.getElementById('cd-lastseen').textContent = cell.lastSeen || '—';

    const typeEl = document.getElementById('cd-type');
    const charEl = document.getElementById('cd-char');
    const nominalEl = document.getElementById('cd-nominal');
    if (cell.type) {
        typeEl.textContent = cell.type.jenis || '—';
        charEl.textContent = cell.type.karakteristik || '—';
        nominalEl.textContent = cell.type.nominalVoltage ? `${cell.type.nominalVoltage} V/sel` : '—';
    } else {
        typeEl.textContent = charEl.textContent = nominalEl.textContent = '—';
    }

    const statusEl = document.getElementById('cd-status');
    if (!cell.hasData) {
        statusEl.textContent = 'MENUNGGU DATA';
        statusEl.style.color = '#94a3b8';
    } else if (!cell.active) {
        statusEl.textContent = '🔌 OFFLINE';
        statusEl.style.color = '#ff1744';
    } else if (cell.status === 'critical') {
        statusEl.textContent = '🚨 KRITIS';
        statusEl.style.color = '#ff1744';
    } else if (cell.status === 'warning') {
        statusEl.textContent = '⚠️ PERINGATAN';
        statusEl.style.color = '#ff9100';
    } else {
        statusEl.textContent = '✅ NORMAL';
        statusEl.style.color = '#00e676';
    }

    if (btnCellDelete) {
        btnCellDelete.onclick = () => confirmDeleteCell(cell.token, cell.id);
    }
    if (btnCellReset) {
        btnCellReset.onclick = () => confirmResetCell(cell.token, cell.id);
    }

    cellModal.classList.remove('hidden');
    cellModal.classList.add('flex');
}

function closeCellModal() {
    cellModal.classList.add('hidden');
    cellModal.classList.remove('flex');
}

async function confirmDeleteCell(token, id) {
    if (!token) return;

    const { isConfirmed } = await Swal.fire({
        title: 'Hapus Sel?',
        html: `Apakah Anda yakin ingin menghapus <b>Sel #${id}</b>?<br><span style="font-size:12px;color:#94a3b8">Token: <span style="font-family:monospace;color:#ff1744">${token}</span></span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff1744',
        cancelButtonColor: '#1e2740',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    });

    if (isConfirmed) {
        Swal.fire({ title: 'Menghapus...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const r = await fetch(`/api/setup/battery/${token}`, { method: 'DELETE' });
            const res = await r.json();
            if (res.success) {
                closeCellModal();
                Swal.fire({
                    icon: 'success',
                    title: 'Terhapus!',
                    text: `Sel #${id} berhasil dihapus dari sistem.`,
                    timer: 2500,
                    timerProgressBar: true
                });
            } else {
                Swal.fire({ icon: 'error', title: 'Gagal', text: res.message || 'Terjadi kesalahan saat menghapus sel.' });
            }
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Tidak dapat terhubung ke server.' });
        }
    }
}

async function confirmResetCell(token, id) {
    if (!token) return;
    const { isConfirmed } = await Swal.fire({
        title: 'Reset / Zero Sel?',
        html: `Data <b>Sel #${id}</b> akan direset ke nol.<br><span style="font-size:12px;color:#94a3b8;">Sel akan masuk status <b style="color:#ffd600">MENUNGGU</b> hingga ESP32 mengirim data baru.</span>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#ff9100',
        cancelButtonColor: '#1e2740',
        confirmButtonText: '↺ Reset Sekarang',
        cancelButtonText: 'Batal'
    });

    if (isConfirmed) {
        Swal.fire({ title: 'Mereset...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const r = await fetch(`/api/setup/battery/reset/${token}`, { method: 'POST' });
            const res = await r.json();
            if (res.success) {
                closeCellModal();
                Swal.fire({
                    icon: 'success',
                    title: 'Berhasil Direset!',
                    html: `<span style="font-size:13px;color:#94a3b8">Sel #${id} dikembalikan ke kondisi awal.<br>Menunggu data baru dari ESP32 dengan token yang sama.</span>`,
                    timer: 3000, timerProgressBar: true
                });
            } else {
                Swal.fire({ icon: 'error', title: 'Gagal', text: res.message || 'Terjadi kesalahan.' });
            }
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Tidak dapat terhubung ke server.' });
        }
    }
}

if (btnCellClose) btnCellClose.addEventListener('click', closeCellModal);
if (btnCellOk) btnCellOk.addEventListener('click', closeCellModal);
cellModal?.addEventListener('click', e => { if (e.target === cellModal) closeCellModal(); });

// ==============================================================================
// BUZZER
// ==============================================================================
function playAlertBeep() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.07, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    } catch (e) { /* ignore */ }
}

// ==============================================================================
// CELL GRID
// ==============================================================================
function renderCellGrid(cells, totalCells) {
    if (!cells || totalCells === 0) return;

    if (cellPanel) cellPanel.classList.remove('hidden');

    const activeCnt = cells.filter(c => c.active).length;
    if (cellConfigInfo) cellConfigInfo.textContent = `${totalCells} Sel | ${activeCnt} Aktif`;

    if (totalCells !== lastTotalCells) {
        lastTotalCells = totalCells;
        let html = '';
        for (let id = 1; id <= totalCells; id++) {
            html += `<div class="rounded-[10px] border-[1.5px] border-border bg-card opacity-50 p-[10px_6px] pb-[14px] cursor-pointer transition-all duration-200 text-center min-h-[85px] flex flex-col items-center justify-center gap-0.5 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,229,255,0.12)] relative overflow-hidden group" id="cell-box-${id}" onclick="showCellDetail(${id})">
                        <span class="text-[10px] text-slate-500 font-semibold uppercase relative z-10">Sel ${id}</span>
                        <span class="font-mono text-[14px] text-accent font-bold relative z-10" id="cell-v-${id}">—</span>
                        <span class="text-[9px] font-bold tracking-[0.5px] text-slate-500 relative z-10" id="cell-s-${id}">MENUNGGU</span>
                        <div class="absolute bottom-0 left-0 right-0 h-1.5 bg-[#111422]">
                            <div id="cell-w-${id}" class="h-full bg-blue-500 transition-all duration-500 opacity-80 group-hover:opacity-100" style="width: 0%"></div>
                        </div>
                     </div>`;
        }
        if (cellGridWrap) cellGridWrap.innerHTML = html;
    }

    latestCells = cells;
    cells.forEach(cell => {
        const box = document.getElementById(`cell-box-${cell.id}`);
        const vEl = document.getElementById(`cell-v-${cell.id}`);
        const sEl = document.getElementById(`cell-s-${cell.id}`);
        const wEl = document.getElementById(`cell-w-${cell.id}`);
        if (!box || !vEl || !sEl) return;

        const baseBoxClass = "rounded-[10px] border-[1.5px] p-[10px_6px] pb-[14px] cursor-pointer transition-all duration-200 text-center min-h-[85px] flex flex-col items-center justify-center gap-0.5 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,229,255,0.12)] relative overflow-hidden group";
        const baseStatusClass = "text-[9px] font-bold tracking-[0.5px] relative z-10";

        if (cell.hasData) {
            vEl.textContent = `${cell.voltage.toFixed(2)} V`;
            if (!cell.active) {
                sEl.textContent = 'OFFLINE';
                box.className = `${baseBoxClass} border-[#555] bg-[#50505014] opacity-60`;
                sEl.className = `${baseStatusClass} text-slate-500`;
            } else {
                const sText = (cell.status || 'NORMAL').toUpperCase();
                // Hilangkan underscore agar lebih rapi di UI (misal: LOW_WATER_LEVEL -> LOW WATER LEVEL)
                sEl.textContent = sText.replace(/_/g, ' ');
                
                const critStatuses = ['CRITICAL', 'OVERCHARGE', 'OVERHEAT', 'LOW_WATER_LEVEL', 'LOW_VOLTAGE', 'OVERDISCHARGE'];
                const warnStatuses = ['WARNING'];
                const infoStatuses = ['FLOAT_NORMAL'];

                if (critStatuses.includes(sText)) {
                    box.className = `${baseBoxClass} border-crit bg-[#ff174414]`;
                    sEl.className = `${baseStatusClass} text-crit`;
                } else if (warnStatuses.includes(sText)) {
                    box.className = `${baseBoxClass} border-warn bg-[#ff910012]`;
                    sEl.className = `${baseStatusClass} text-warn`;
                } else if (infoStatuses.includes(sText)) {
                    // Warna Cyan/Accent untuk kondisi Float
                    box.className = `${baseBoxClass} border-accent bg-[#00e5ff12]`;
                    sEl.className = `${baseStatusClass} text-accent`;
                } else {
                    box.className = `${baseBoxClass} border-good bg-[#00e6760f]`;
                    sEl.className = `${baseStatusClass} text-good`;
                }
            }
            if (wEl) {
                const wl = cell.waterLevel || 0;
                wEl.style.width = `${wl}%`;
                if (wl < 20) wEl.className = "h-full bg-red-500 transition-all duration-500 opacity-80 group-hover:opacity-100";
                else if (wl < 50) wEl.className = "h-full bg-yellow-500 transition-all duration-500 opacity-80 group-hover:opacity-100";
                else wEl.className = "h-full bg-blue-500 transition-all duration-500 opacity-80 group-hover:opacity-100";
            }
        } else {
            vEl.textContent = '— V';
            sEl.textContent = 'MENUNGGU';
            box.className = `${baseBoxClass} border-border bg-card opacity-50`;
            sEl.className = `${baseStatusClass} text-slate-500`;
            if (wEl) wEl.style.width = `0%`;
        }
    });
}

window.showCellDetail = function (id) {
    const cell = latestCells.find(c => c.id === id);
    if (cell) openCellModal(cell);
};
// ==============================================================================
// FETCH DATA
// ==============================================================================
async function fetchData() {
    try {
        const response = await fetch('/api/data');
        const data = await response.json();

        const espOk = data.esp32Connected === true;

        if (infoBrokerStatus) {
            if (data.mqttBrokerConnected) {
                infoBrokerStatus.textContent = '✅ Terhubung';
                infoBrokerStatus.style.color = '#00e676';
            } else {
                infoBrokerStatus.textContent = '❌ Terputus';
                infoBrokerStatus.style.color = '#ff1744';
            }
        }

        // [PERBAIKAN 1]: Gunakan jam server saat ini (atau jam PC lokal jika kosong) agar info update tidak beku
        const currentTimeString = data.lastEsp32Time || new Date().toLocaleTimeString('id-ID');
        if (espOk) {
            lastUpdateEl.textContent = `📡 ${currentTimeString}`;
            lastUpdateEl.style.color = '#00e676';
        } else {
            lastUpdateEl.textContent = `⏳ Terakhir: ${currentTimeString}`;
            lastUpdateEl.style.color = '#ff9100';
        }

        // [PERBAIKAN 2]: Keluarkan sensor value dari blok IF (espOk). 
        // Selama API mengembalikan data, dashboard HARUS tetap menampilkan angka voltase/suhu/arus terlepas dari status koneksi ESP32.
        // Hitung ulang agregat dari cells untuk mengoreksi jika backend memberikan angka rata-rata yang salah
        let sumV = 0, sumT = 0, sumI = 0, activeCount = 0;
        if (data.cells && data.cells.length > 0) {
            data.cells.forEach(c => {
                if (c.active && (c.voltage > 0 || c.temperature > 0 || c.current > 0)) {
                    sumV += c.voltage;
                    sumT += c.temperature;
                    sumI += c.current;
                    activeCount++;
                }
            });
        }
        const cCount = activeCount || 1;
        const v = sumV > 0 ? sumV : (data.bankVoltage || 0);
        const t = sumT > 0 ? (sumT / cCount) : (data.avgTemperature || 0);
        const i = sumI > 0 ? (sumI / cCount) : (data.current || 0);

        if (activeCount > 0) {
            const avg = v / activeCount;
            dispVoltage.textContent = `${v.toFixed(2)} V (${avg.toFixed(2)}/sel)`;
        } else {
            dispVoltage.textContent = `${v.toFixed(2)} V`;
        }
        dispTemp.textContent = `${t.toFixed(1)} °C`;
        dispCurrent.textContent = `${i.toFixed(2)} A`;

        // Evaluasi ulang status berdasarkan status sel dari ESP32
        let finalStatus = 'NORMAL';
        if (data.cells && data.cells.length > 0) {
            const critStatuses = ['CRITICAL', 'OVERCHARGE', 'OVERHEAT', 'LOW_WATER_LEVEL', 'LOW_VOLTAGE', 'OVERDISCHARGE'];
            const warnStatuses = ['WARNING'];
            
            const hasCritCell = data.cells.some(c => c.active && critStatuses.includes((c.status || '').toUpperCase()));
            const hasWarnCell = data.cells.some(c => c.active && warnStatuses.includes((c.status || '').toUpperCase()));
            
            if (hasCritCell) finalStatus = 'CRITICAL';
            else if (hasWarnCell) finalStatus = 'WARNING';
        }
        
        // Cek juga alert level dari backend (contoh: ESP32 offline, atau bank voltage)
        if (finalStatus !== 'CRITICAL') {
            const hasOtherCrit = data.activeAlerts?.some(a => a.level === 'CRITICAL');
            const hasOtherWarn = data.activeAlerts?.some(a => a.level === 'WARNING');
            if (hasOtherCrit) finalStatus = 'CRITICAL';
            else if (hasOtherWarn && finalStatus !== 'WARNING') finalStatus = 'WARNING';
        }

        // Status card
        const baseStatusCardClass = 'bg-card border-[1.5px] rounded-2xl p-4 flex flex-col gap-2 transition-all';
        if (finalStatus === 'CRITICAL') {
            statusCard.className = `${baseStatusCardClass} border-crit shadow-[0_0_16px_rgba(255,23,68,0.3)]`;
            statusBadge.textContent = '🚨 ALARM KRITIS';
            statusBadge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-[#ff174426] text-crit border border-[#ff17444d]';
        } else if (finalStatus === 'WARNING') {
            statusCard.className = `${baseStatusCardClass} border-warn shadow-[0_0_16px_rgba(255,145,0,0.25)]`;
            statusBadge.textContent = '⚠️ PERINGATAN';
            statusBadge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-[#ff910026] text-warn border border-[#ff91004d]';
        } else {
            statusCard.className = `${baseStatusCardClass} border-good shadow-[0_0_16px_rgba(0,230,118,0.2)]`;
            statusBadge.textContent = '✅ NORMAL';
            statusBadge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-[#00e67626] text-good border border-[#00e6764d]';
        }

        let filteredAlerts = data.activeAlerts || [];
        if (data.thresholds && activeCount > 0) {
            const th = data.thresholds;
            if (v >= th.vLowWarn) {
                filteredAlerts = filteredAlerts.filter(a => a.key !== 'V_LOW_CRIT' && a.key !== 'V_LOW_WARN');
            }
        }

        if (filteredAlerts.length > 0) {
            alertsList.innerHTML = filteredAlerts.map(a =>
                `<p class="text-xs ${a.level === 'CRITICAL' ? 'text-red-400' : 'text-yellow-400'}">${a.message}</p>`
            ).join('');
        } else {
            alertsList.innerHTML = `<p class="text-xs text-good">✔ Semua parameter dalam batas aman.</p>`;
        }

        const missingInfoEl = document.getElementById('missing-cells-info');
        if (missingInfoEl) {
            if (data.missingCells && data.missingCells.length > 0) {
                missingInfoEl.textContent = `Sel tidak terkirim: ${data.missingCells.join(', ')}`;
                missingInfoEl.classList.remove('hidden');
            } else {
                missingInfoEl.classList.add('hidden');
            }
        }

        // Sound alert
        let hasNewCritical = false;
        if (data.activeAlerts) {
            data.activeAlerts.forEach(a => { if (a.level === 'CRITICAL' && !activeAlertKeys.has(a.key)) hasNewCritical = true; });
            activeAlertKeys.clear();
            data.activeAlerts.forEach(a => activeAlertKeys.add(a.key));
        }
        if (hasNewCritical) playAlertBeep();

        if (data.history && data.history.length > 0) {
            renderTable(data.history);
        }

        renderLogs(data.eventLog);

        if (data.totalCells > 0 && data.cells) {
            renderCellGrid(data.cells, data.totalCells);
        }

    } catch (e) {
        console.error('Error fetching /api/data:', e);
    }
}

// ==============================================================================
// RENDERERS
// ==============================================================================
function renderLogs(logs) {
    if (!logs || !logConsole) return;
    logConsole.innerHTML = logs.slice(0, 60).map(log => {
        let color = '#94a3b8';
        if (log.level === 'CRITICAL') color = '#ff1744';
        else if (log.level === 'WARNING') color = '#ff9100';
        else if (log.level === 'INFO') color = '#64748b';
        return `<div class="py-[2px] border-b border-white/5" style="color:${color}">[${log.time}] ${log.message}</div>`;
    }).join('');
}

function renderTable(history) {
    if (!history || !tableBody) return;
    const statusColor = { NORMAL: '#00e676', WARNING: '#ff9100', CRITICAL: '#ff1744', OFFLINE: '#64748b' };
    tableBody.innerHTML = [...history].reverse().map(row => {
        const sc = (row.status || 'NORMAL').toUpperCase();
        const c = statusColor[sc] || '#94a3b8';
        // Use per-cell values if available, fallback to bank values for old log entries
        const v = (row.cell_v !== undefined ? row.cell_v : row.voltage) || 0;
        const t = (row.cell_t !== undefined ? row.cell_t : row.temperature) || 0;
        const i = (row.cell_i !== undefined ? row.cell_i : row.current) || 0;
        const sel = row.cell_id !== undefined ? `#${row.cell_id}` : '-';
        return `<tr class="even:bg-white/2 hover:bg-accent/5 transition-colors">
            <td class="p-1 text-gray-400 font-mono">${row.time}</td>
            <td class="p-1 text-center font-mono text-xs text-cyan-400">${sel}</td>
            <td class="p-1 text-right font-mono text-accent">${v.toFixed(2)} V</td>
            <td class="p-1 text-right font-mono text-warn">${t.toFixed(1)} °C</td>
            <td class="p-1 text-right font-mono text-yellow-400">${i.toFixed(2)} A</td>
            <td class="p-1 text-center"><span style="color:${c};font-size:10px;font-weight:700">${sc}</span></td>
        </tr>`;
    }).join('');
}

// ==============================================================================
// SETTINGS & LOGS MANAGEMENT
// ==============================================================================
const btnClearLogs = document.getElementById('btn-clear-logs');
if (btnClearLogs) {
    btnClearLogs.addEventListener('click', async () => {
        const { isConfirmed } = await Swal.fire({
            title: 'Hapus Log Aktivitas?',
            text: 'Ini akan menghapus log aktivitas alarm.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ff1744',
            cancelButtonColor: '#1e2740',
            confirmButtonText: 'Ya, Hapus!',
            cancelButtonText: 'Batal'
        });
        if (isConfirmed) {
            try {
                await fetch('/api/logs/activity', { method: 'DELETE' });
                Swal.fire({ icon: 'success', title: 'Terhapus', text: 'Log aktivitas berhasil dihapus.', timer: 2000 });
            } catch (e) {
                Swal.fire({ icon: 'error', title: 'Error', text: 'Gagal menghapus log.' });
            }
        }
    });
}

const btnClearHistory = document.getElementById('btn-clear-history');
if (btnClearHistory) {
    btnClearHistory.addEventListener('click', async () => {
        const { isConfirmed } = await Swal.fire({
            title: 'Hapus Riwayat Pengukuran?',
            text: 'Ini akan menghapus tabel riwayat pengukuran.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ff1744',
            cancelButtonColor: '#1e2740',
            confirmButtonText: 'Ya, Hapus!',
            cancelButtonText: 'Batal'
        });
        if (isConfirmed) {
            try {
                await fetch('/api/logs/history', { method: 'DELETE' });
                if (tableBody) tableBody.innerHTML = '';
                Swal.fire({ icon: 'success', title: 'Terhapus', text: 'Riwayat pengukuran berhasil dihapus.', timer: 2000 });
            } catch (e) {
                Swal.fire({ icon: 'error', title: 'Error', text: 'Gagal menghapus riwayat.' });
            }
        }
    });
}

const btnSettings = document.getElementById('btn-settings');
if (btnSettings) {
    btnSettings.addEventListener('click', async () => {
        let current = { targetVoltage: 220, dropTolerance: 10, maxGraphY: 250 };
        try {
            const r = await fetch('/api/settings');
            if (r.ok) current = await r.json();
        } catch (e) { }

        const { value: formValues, isConfirmed } = await Swal.fire({
            title: '<div class="flex items-center justify-center gap-2 mb-2"><span class="text-2xl">⚙️</span><span style="color:#00e5ff;font-size:18px;font-weight:800;letter-spacing:1px">PENGATURAN SISTEM</span></div>',
            html: `
                <div class="space-y-4 text-left mt-2">
                    <div class="bg-surface border border-border p-3 rounded-xl transition-colors focus-within:border-accent">
                        <label class="text-[11px] font-bold text-gray-400 mb-1.5 block tracking-wide uppercase">⚡ Target Tegangan Bank Total (V)</label>
                        <input id="swal-targetV" type="number" step="0.1" class="w-full bg-dark border border-border text-accent font-mono p-2 rounded-lg outline-none transition-colors" value="${current.targetVoltage}">
                    </div>
                    
                    <div class="bg-surface border border-border p-3 rounded-xl transition-colors focus-within:border-warn">
                        <label class="text-[11px] font-bold text-gray-400 mb-1.5 block tracking-wide uppercase">📉 Toleransi Drop Tegangan (%)</label>
                        <input id="swal-dropTol" type="number" step="0.1" class="w-full bg-dark border border-border text-warn font-mono p-2 rounded-lg outline-none transition-colors" value="${current.dropTolerance}">
                    </div>
                    
                    <div class="bg-surface border border-border p-3 rounded-xl transition-colors focus-within:border-good">
                        <label class="text-[11px] font-bold text-gray-400 mb-1.5 block tracking-wide uppercase">📊 Batas Maksimal Grafik (Y-Axis)</label>
                        <input id="swal-maxY" type="number" step="1" class="w-full bg-dark border border-border text-good font-mono p-2 rounded-lg outline-none transition-colors" value="${current.maxGraphY}">
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#00e5ff',
            cancelButtonColor: '#1e2740',
            confirmButtonText: '<span style="color:#000;font-weight:700">Simpan</span>',
            cancelButtonText: 'Batal',
            customClass: {
                popup: 'rounded-2xl border-border border bg-card',
                title: 'p-0',
                htmlContainer: 'p-0 m-0',
                confirmButton: 'rounded-lg px-6',
                cancelButton: 'rounded-lg px-6'
            },
            preConfirm: () => {
                return {
                    targetVoltage: parseFloat(document.getElementById('swal-targetV').value),
                    dropTolerance: parseFloat(document.getElementById('swal-dropTol').value),
                    maxGraphY: parseFloat(document.getElementById('swal-maxY').value)
                };
            }
        });

        if (isConfirmed && formValues) {
            try {
                await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formValues)
                });
                Swal.fire({ icon: 'success', title: 'Tersimpan', text: 'Pengaturan berhasil diperbarui.', timer: 2000 });
            } catch (e) {
                Swal.fire({ icon: 'error', title: 'Error', text: 'Gagal menyimpan pengaturan.' });
            }
        }
    });
}

// ==============================================================================
// INIT
// ==============================================================================
window.addEventListener('DOMContentLoaded', async () => {
    await loadBatteryTypes();   // pre-load battery types
    fetchData();
    setInterval(fetchData, 1000); // Polling data setiap 1 detik
});