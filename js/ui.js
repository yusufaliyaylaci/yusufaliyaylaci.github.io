import { CONFIG } from './config.js';
import { state, timers, analyzer, dataArray } from './state.js';
import { isElectron, ipcRenderer } from './main.js';

let lastBgMode = null;
let lastBgStation = null;
let currentVisualizerColor = { r: 255, g: 255, b: 255 }; 

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 255, g: 255, b: 255 };
}

// --- GÜNCELLENMİŞ FONKSİYON ---
// Radyo kartını (Player'ı) tam ekran/varsayılan moduna geçirir
export function triggerRadioCard() {
    // Eğer zaten Radyo modunda (3) değilsek, oraya geçir
    if (state.stage !== 3) {
        state.stage = 3;
        changeStage();
    }
}

export function getOS() {
    if (typeof window === 'undefined') return 'Unknown';
    const userAgent = window.navigator.userAgent;
    if (userAgent.indexOf("Win") !== -1) return "Windows";
    if (userAgent.indexOf("Mac") !== -1) return "MacOS";
    if (userAgent.indexOf("Linux") !== -1) return "Linux";
    if (userAgent.indexOf("Android") !== -1) return "Android";
    if (userAgent.indexOf("like Mac") !== -1) return "iOS";
    return "Unknown";
}

export function initUpdateHandler() {
    if (!isElectron) return;
    const overlay = document.getElementById('update-overlay');
    const bar = document.getElementById('updateProgressBar');
    const status = document.getElementById('updateStatusText');
    const title = document.querySelector('.update-box h2');

    ipcRenderer.on('update-available', () => { if(overlay) overlay.classList.add('active'); });
    ipcRenderer.on('update-progress', (event, data) => {
        if(bar && status) {
            const percent = Math.round(data.percent);
            bar.style.width = percent + "%";
            status.innerText = `%${percent} Tamamlandı`;
        }
    });
    ipcRenderer.on('update-downloaded', () => {
        if(status && title) {
            bar.style.width = "100%"; bar.style.boxShadow = "0 0 20px #fff";
            title.innerText = "Güncelleme Hazır!"; status.innerText = "Yeniden başlatılıyor..."; status.style.color = "#4caf50";
        }
    });
}

export function initWelcomeScreen() {
    // Ana mantık main.js içinde
}

export function createDynamicElements() {
    if (isElectron && !document.querySelector('.drag-region')) {
        const dragDiv = document.createElement('div'); dragDiv.className = 'drag-region'; document.body.appendChild(dragDiv);
    }
    if (isElectron) {
        ipcRenderer.send('get-app-version');
        ipcRenderer.on('app-version', (event, version) => {
            const verDisplay = document.getElementById('app-version-display');
            if(verDisplay) { verDisplay.innerText = `v${version}`; verDisplay.style.display = 'block'; }
        });
    }

    if (!document.querySelector('.app-controls-container') && !document.querySelector('.web-controls-container')) {
        const container = document.createElement('div');
        const ecoBtn = document.createElement('div'); ecoBtn.className = 'control-box-btn'; ecoBtn.id = 'ecoBtn'; ecoBtn.innerHTML = '<i class="fas fa-leaf"></i>'; ecoBtn.onclick = toggleLowPowerMode; ecoBtn.title = "Düşük Güç Modu";
        
        if (isElectron) {
            container.className = 'app-controls-container';
            const closeBtn = document.createElement('div'); closeBtn.className = 'control-box-btn close-app-btn'; closeBtn.innerHTML = '<i class="fas fa-times"></i>'; closeBtn.onclick = () => ipcRenderer.send('close-app'); closeBtn.title = "Gizle"; container.appendChild(closeBtn);
            const fsBtn = document.createElement('div'); fsBtn.className = 'control-box-btn fullscreen-btn'; fsBtn.innerHTML = '<i class="fas fa-expand"></i>'; fsBtn.onclick = toggleFullScreen; fsBtn.title = "Tam Ekran"; container.appendChild(fsBtn);
            const minBtn = document.createElement('div'); minBtn.className = 'control-box-btn'; minBtn.innerHTML = '<i class="fas fa-minus"></i>'; minBtn.onclick = () => ipcRenderer.send('minimize-app'); minBtn.title = "Küçült"; container.appendChild(minBtn);
            container.appendChild(ecoBtn);
        } else {
            container.className = 'web-controls-container';
            const fsBtn = document.createElement('div'); fsBtn.className = 'control-box-btn fullscreen-btn'; fsBtn.innerHTML = '<i class="fas fa-expand"></i>'; fsBtn.onclick = toggleFullScreen; fsBtn.title = "Tam Ekran"; container.appendChild(fsBtn);
            container.appendChild(ecoBtn);
            const dlBtn = document.createElement('div'); dlBtn.className = 'control-box-btn'; dlBtn.innerHTML = '<i class="fas fa-download"></i>'; dlBtn.onclick = toggleDownloadModal; dlBtn.title = "İndir"; container.appendChild(dlBtn);
        }
        document.body.appendChild(container);
    }
    const wrapper = document.querySelector('.radio-wrapper');
    if (wrapper && !document.querySelector('.song-popup')) {
        const popup = document.createElement('div'); popup.className = 'song-popup'; popup.id = 'songPopup'; popup.innerHTML = `<div class="popup-icon"><i class="fas fa-music"></i></div><div class="popup-content"><div class="popup-title" id="popupTitle">Dinleniyor...</div><div class="popup-song" id="popupSong">---</div></div>`; wrapper.appendChild(popup); 
    }
    if (!document.getElementById('resultBubble')) {
        const bubble = document.createElement('div');
        bubble.id = 'resultBubble';
        bubble.className = 'result-bubble';
// YENİ HTML YAPISI (Ekolayzer Eklendi):
        bubble.innerHTML = `
            <div class="bubble-left">
                <img src="" id="bubbleArt" class="bubble-art" style="display:none">
                <div class="mini-equalizer">
                    <div class="bar"></div>
                    <div class="bar"></div>
                    <div class="bar"></div>
                    <div class="bar"></div>
                </div>
            </div>
            <div class="bubble-info">
                <span id="bubbleTitle" class="bubble-title">Şarkı Adı</span>
                <span id="bubbleArtist" class="bubble-artist">Sanatçı</span>
            </div>
            <i class="fas fa-times bubble-close" id="bubbleClose"></i>
        `;
        document.body.appendChild(bubble);
        
        // Kapatma butonu olayı
        document.getElementById('bubbleClose').addEventListener('click', (e) => {
            e.stopPropagation();
            hideBubble();
        });
    }
}

export function updateStatusUI(statusType, msg, customColor) {
    const nameEl = document.getElementById("stationName");
    if(nameEl && CONFIG.stations[state.currentStation]) nameEl.innerText = CONFIG.stations[state.currentStation].name; 
    const sText = document.getElementById("statusText"); if(!sText) return;
    sText.classList.remove("status-connecting", "status-live", "status-retrying");
    if(statusType === "connecting") sText.classList.add("status-connecting");
    else if(statusType === "live") sText.classList.add("status-live");
    else if(statusType === "retrying") sText.classList.add("status-retrying");

    let contentHTML = "";
    if (statusType === 'live') { contentHTML = `<span class="status-live-text">${msg}</span>`; sText.style.color = ""; } 
    else if (statusType === "connecting") { contentHTML = `<div class="connecting-dots"><span></span><span></span><span></span></div><span class="status-animate">${msg}</span>`; sText.style.color = customColor || ""; } 
    else if (statusType === "error") { contentHTML = `<span class="status-error-anim">${msg}</span>`; sText.style.color = customColor || "red"; }
    else { contentHTML = `<span class="status-animate">${msg}</span>`; sText.style.color = customColor || ""; }
    sText.innerHTML = contentHTML;
}

export function updateBackground(mode) {
    if (lastBgMode === mode && (mode !== 'station' || lastBgStation === state.currentStation)) return; 
    let newGradient;
    if (mode === 'default') newGradient = "linear-gradient(45deg, #000000, #434343, #1a1a1a, #000000)"; 
    else if (mode === 'error') newGradient = "linear-gradient(45deg, #000000, #3a0000, #000000, #3a0000)"; 
    else newGradient = CONFIG.stations[state.currentStation].gradient;
    const layer1 = document.getElementById("bg-layer-1"); const layer2 = document.getElementById("bg-layer-2");
    const activeLayer = layer1.classList.contains('active') ? layer1 : layer2; const nextLayer = activeLayer === layer1 ? layer2 : layer1;
    nextLayer.style.backgroundImage = newGradient; activeLayer.classList.remove('active'); nextLayer.classList.add('active');
    state.activeBgLayer = nextLayer.id === 'bg-layer-1' ? 1 : 2; lastBgMode = mode; lastBgStation = state.currentStation;
}

export function updateThemeColors(isError) {
    const color = isError ? "red" : CONFIG.stations[state.currentStation].accent;
    document.documentElement.style.setProperty('--theme-color', color);
    const playBtn = document.getElementById("playBtn"); if(playBtn) playBtn.style.color = ""; 
    document.querySelectorAll('.equalizer .bar').forEach(b => b.style.backgroundColor = ""); 
    const playerBox = document.getElementById("playerBox"); if(playerBox) playerBox.style.borderColor = ""; 
}

export function initSnow() {
    if (state.lowPowerMode) return;
    const canvas = document.getElementById("snowCanvas"); if(!canvas) return; 
    const ctx = canvas.getContext("2d"); let snowflakes = [];
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; } 
    window.addEventListener('resize', resize); resize();
    class Snowflake { constructor() { this.reset(); this.angle = Math.random() * Math.PI * 2; this.angleSpeed = Math.random() * 0.01 + 0.005; this.swing = Math.random() * 1.5 + 0.5; } reset() { this.x = Math.random() * canvas.width; this.y = Math.random() * -canvas.height; this.size = Math.random() * 3 + 1; this.speed = Math.random() * 0.5 + 0.3; this.opacity = Math.random() * 0.5 + 0.3; } update() { this.y += this.speed + state.kickImpulse; this.angle += this.angleSpeed; this.x += Math.cos(this.angle) * this.swing * 0.3; if (this.y > canvas.height) this.reset(); if (this.x > canvas.width) this.x = 0; if (this.x < 0) this.x = canvas.width; } draw() { ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); } }
    for (let i = 0; i < 90; i++) snowflakes.push(new Snowflake());
    function animate() { 
        if (state.lowPowerMode) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
        ctx.clearRect(0, 0, canvas.width, canvas.height); 
        if (analyzer && state.isPlaying) { 
            try { analyzer.getByteFrequencyData(dataArray); let bassSum = dataArray[0] + dataArray[1] + dataArray[2]; 
                if ((bassSum / 3) > 210) state.kickImpulse = 2.0; 
                if (state.stage === 3) { 
                    const player = document.getElementById("playerBox"); 
                    let visualSum = 0; for(let i = 0; i < 20; i++) visualSum += dataArray[i]; let avg = visualSum / 20; 
                    const scaleAmount = 1 + (avg / 255) * 0.05; 
                    if(player) {
                        player.style.transform = `scale(${scaleAmount})`; 
                        const targetHex = CONFIG.stations[state.currentStation].accent; const targetRGB = hexToRgb(targetHex);
                        currentVisualizerColor.r += (targetRGB.r - currentVisualizerColor.r) * 0.05; currentVisualizerColor.g += (targetRGB.g - currentVisualizerColor.g) * 0.05; currentVisualizerColor.b += (targetRGB.b - currentVisualizerColor.b) * 0.05;
                        const r = Math.round(currentVisualizerColor.r); const g = Math.round(currentVisualizerColor.g); const b = Math.round(currentVisualizerColor.b);
                        const shadowOpacity = Math.floor((avg / 255) * 100) / 100; const shadowSize = 20 + (avg * 0.2); 
                        player.style.boxShadow = `0 10px ${shadowSize}px rgba(${r}, ${g}, ${b}, ${shadowOpacity})`; 
                    }
                } else { const player = document.getElementById("playerBox"); if(player) { if(player.style.transform) player.style.transform = ""; if(player.style.boxShadow) player.style.boxShadow = ""; } } 
            } catch(e) {} 
        } 
        state.kickImpulse *= 0.90; snowflakes.forEach(flake => { flake.update(); flake.draw(); }); requestAnimationFrame(animate); 
    } 
    animate();
}

export function changeStage() {
    const card = document.getElementById("mainCard");
    card.classList.remove("state-album", "state-bio", "state-social");
    card.setAttribute("data-state", state.stage);
    if(state.stage === 3) document.body.classList.add('view-mode-social'); else document.body.classList.remove('view-mode-social');
    if(state.stage === 4) document.body.classList.add('view-mode-weather'); else document.body.classList.remove('view-mode-weather');
    if(state.stage === 0) card.classList.add("state-album"); else if(state.stage === 2) card.classList.add("state-bio");
    updatePageIndicators();
}

export function goDefaultPage() { state.stage = isElectron ? 3 : 1; changeStage(); }
export function lockScroll(duration = 1200) { state.isScrolling = true; setTimeout(() => { state.isScrolling = false; }, duration); }
export function triggerBump(className) { document.body.classList.add(className); setTimeout(() => document.body.classList.remove(className), 400); }
export function shakePlayer() {
    const playerBox = document.getElementById('playerBox');
    if (playerBox) {
        playerBox.classList.remove('shake-player-anim');
        void playerBox.offsetWidth; 
        playerBox.classList.add('shake-player-anim');
        setTimeout(() => {
            playerBox.classList.remove('shake-player-anim');
        }, 500);
    }
}
export function nextPhoto() { state.photoIndex = (state.photoIndex + 1) % CONFIG.photos.length; updatePhoto(); }
export function prevPhoto() { state.photoIndex = (state.photoIndex - 1 + CONFIG.photos.length) % CONFIG.photos.length; updatePhoto(); }
export function updatePhoto() { const img = document.getElementById("profileImg"); img.classList.add("changing"); const newImg = new Image(); newImg.src = CONFIG.photos[state.photoIndex]; newImg.onload = () => { img.src = CONFIG.photos[state.photoIndex]; setTimeout(() => { img.classList.remove("changing"); }, 100); }; }
export function toggleFullScreen() { if (!document.fullscreenElement) { document.documentElement.requestFullscreen().catch(err => console.log(err)); } else { if (document.exitFullscreen) document.exitFullscreen(); } }
export function initPageIndicators() { const container = document.getElementById("stageIndicators"); if(!container) return; container.innerHTML = ""; const stages = isElectron ? [1, 3, 4] : [0, 1, 2, 3, 4]; stages.forEach(i => { const dot = document.createElement("div"); dot.className = "indicator-dot"; dot.dataset.stage = i; if(i === state.stage) dot.classList.add("active"); dot.onclick = (e) => { e.stopPropagation(); state.stage = i; changeStage(); }; container.appendChild(dot); }); }
function updatePageIndicators() { document.querySelectorAll(".indicator-dot").forEach(dot => { if (parseInt(dot.dataset.stage) === state.stage) dot.classList.add("active"); else dot.classList.remove("active"); }); }
export function initClock() { function update() { try { const now = new Date(); const timeString = new Intl.DateTimeFormat('tr-TR', { timeZone: state.timeZone, hour12: false, hour: '2-digit', minute: '2-digit' }).format(now); const [hour, minute] = timeString.split(':'); document.getElementById("clock-hour").innerText = hour; document.getElementById("clock-minute").innerText = minute; const dateString = new Intl.DateTimeFormat('tr-TR', { timeZone: state.timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(now); document.getElementById("date-display").innerText = dateString; } catch(e) {} } setInterval(update, 1000); update(); }
export function initOnlineCounter() { const counterEl = document.getElementById("onlineCount"); function pseudoRandom(input) { let t = input += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } function cosineInterpolate(y1, y2, mu) { const mu2 = (1 - Math.cos(mu * Math.PI)) / 2; return (y1 * (1 - mu2) + y2 * mu2); } function getNoise(time, scale) { const t = time / scale; const i = Math.floor(t); const f = t - i; const r1 = pseudoRandom(i); const r2 = pseudoRandom(i + 1); return cosineInterpolate(r1, r2, f); } function updateCount() { const now = Date.now(); const serverTime = now / 1000; const hour = new Date().getHours(); const hourlyBase = [ 45, 30, 20, 15, 10, 8, 12, 25, 60, 90, 110, 130, 140, 150, 145, 155, 160, 175, 190, 210, 230, 220, 180, 100 ]; const currentBase = hourlyBase[hour]; const nextBase = hourlyBase[(hour + 1) % 24]; const minuteProgress = new Date().getMinutes() / 60; const smoothedBase = currentBase + (nextBase - currentBase) * minuteProgress; const slowWave = getNoise(serverTime, 40) * 30; const fastWave = getNoise(serverTime, 7) * 5; let finalCount = Math.floor(smoothedBase + slowWave + fastWave); if (finalCount < 5) finalCount = 5; if(counterEl) { const prevText = counterEl.innerText; counterEl.innerText = finalCount; if (prevText != finalCount) { const dot = document.querySelector('.live-dot'); if(dot) { dot.style.animation = 'none'; dot.offsetHeight; dot.style.animation = 'pulseGreen 2s infinite'; } } } setTimeout(updateCount, 500); } updateCount(); }
export function toggleDownloadModal() { const modal = document.getElementById('download-modal'); if (modal) { modal.classList.toggle('open'); if(modal.classList.contains('open')) showMainOptions(); } }
export function closeDownloadModal(e) { if (e.target.id === 'download-modal') e.target.classList.remove('open'); }
export function showLinuxOptions() { document.getElementById('main-platform-grid').style.display = 'none'; document.getElementById('linux-platform-grid').style.display = 'grid'; }
export function showMainOptions() { document.getElementById('linux-platform-grid').style.display = 'none'; document.getElementById('main-platform-grid').style.display = 'grid'; }
export function toggleLowPowerMode() { state.lowPowerMode = !state.lowPowerMode; const btn = document.getElementById('ecoBtn'); const canvas = document.getElementById('snowCanvas'); if (state.lowPowerMode) { if(btn) { btn.style.color = "#4caf50"; btn.style.borderColor = "#4caf50"; } if(canvas) canvas.style.display = 'none'; } else { if(btn) { btn.style.color = "white"; btn.style.borderColor = ""; } if(canvas) canvas.style.display = 'block'; initSnow(); } }
export function hideDownloadPrompt(clicked) { const prompt = document.getElementById('downloadPrompt'); if (prompt) { prompt.classList.remove('active'); prompt.setAttribute('aria-hidden', 'true'); } if (clicked) localStorage.setItem('yaliApp_promptShown', 'true'); }
export function showScanningPopup() {
    // Önce varsa eski baloncuğu patlat
    hideBubble();

    const popup = document.getElementById('songPopup');
    if(popup) {
        popup.classList.add('active', 'scanning-mode');
        // İkon ve metni arama moduna al
        const title = document.getElementById('popupTitle');
        const song = document.getElementById('popupSong');
        const icon = document.querySelector('.popup-icon');
        
        title.innerText = "Ortam Dinleniyor...";
        title.style.color = "#ffeb3b";
        song.innerText = "Ses Analiz Ediliyor...";
        icon.innerHTML = '<i class="fas fa-microphone-alt fa-pulse"></i>';
    }
}

export function hideScanningPopup() {
    const popup = document.getElementById('songPopup');
    if(popup) {
        popup.classList.remove('active', 'scanning-mode');
    }
}

export function showBubble(artist, song, artUrl) {
    // Önce tarama kutusunu kapat
    hideScanningPopup();

    const bubble = document.getElementById('resultBubble');
    const bTitle = document.getElementById('bubbleTitle');
    const bArtist = document.getElementById('bubbleArtist');
    const bArt = document.getElementById('bubbleArt');

    if(bubble && bTitle && bArtist) {
        bTitle.innerText = song;
        bArtist.innerText = artist;
        
        if(artUrl) {
            bArt.src = artUrl;
            bArt.style.display = "block";
        } else {
            bArt.style.display = "none";
        }

        // Animasyonla yüzeye çıkar (Reflow trigger)
        bubble.classList.remove('surfaced');
        void bubble.offsetWidth; 
        bubble.classList.add('surfaced');
    }
}

export function hideBubble() {
    const bubble = document.getElementById('resultBubble');
    if(bubble) {
        bubble.classList.remove('surfaced');
    }
}


document.addEventListener('click', (e) => {
    if (!e.target.closest('.card') && 
        !e.target.closest('.control-box-btn') && 
        !e.target.closest('#overlay') && 
        !e.target.closest('.song-popup') &&
        !e.target.closest('.weather-widget') &&
        !e.target.closest('.radio-wrapper')) {
        
        triggerRadioCard();
    }
});