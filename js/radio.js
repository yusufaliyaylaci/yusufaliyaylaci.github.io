import { CONFIG } from './config.js';
import { state, timers, audioCtx, setAudioContext, setAnalyzer, setDataArray, analyzer } from './state.js';
// Importları güncelledik: Yeni UI fonksiyonları eklendi
import { updateStatusUI, updateBackground, updateThemeColors, getOS, triggerRadioCard, shakePlayer, showScanningPopup, hideScanningPopup, showBubble, hideBubble } from './ui.js';
import { isElectron, ipcRenderer } from './main.js';

let connectionTimeout = null; // 4 Saniye kuralı için sayaç

// --- YARDIMCI FONKSİYONLAR ---
function getActivePlayer() { return document.getElementById(`bgMusic${state.activePlayerId}`); }
function getInactivePlayer() { const inactiveId = state.activePlayerId === 1 ? 2 : 1; return document.getElementById(`bgMusic${inactiveId}`); }
function swapActivePlayer() { state.activePlayerId = state.activePlayerId === 1 ? 2 : 1; }

// --- AUDIO CONTEXT ---
export function setupAudioContext() {
    if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext(); setAudioContext(ctx);
        const node = ctx.createAnalyser(); setAnalyzer(node);
        node.fftSize = 256; setDataArray(new Uint8Array(node.frequencyBinCount));
        const audio1 = document.getElementById("bgMusic1"); const audio2 = document.getElementById("bgMusic2");
        const source1 = ctx.createMediaElementSource(audio1); const source2 = ctx.createMediaElementSource(audio2);
        source1.connect(node); source2.connect(node); node.connect(ctx.destination);
    } catch(e) { console.warn("Audio Context Hatası:", e); }
}

// --- BAŞLATMA ---
export function initRadio() {
    state.lastDirection = 1; // Varsayılan yön

    const player1 = document.getElementById("bgMusic1");
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => playRadio());
        navigator.mediaSession.setActionHandler('pause', () => togglePlay());
        navigator.mediaSession.setActionHandler('previoustrack', () => triggerChangeStation(-1));
        navigator.mediaSession.setActionHandler('nexttrack', () => triggerChangeStation(1));
        navigator.mediaSession.setActionHandler('stop', () => togglePlay());
    }
    player1.src = CONFIG.stations[state.currentStation].url;
    player1.volume = Math.pow(state.lastVolume, 2);
    if (isElectron) { ipcRenderer.on('media-toggle', () => { togglePlay(); }); }
}

// --- ZAMANLAYICI FONKSİYONU ---
function startConnectionTimer() {
    if (connectionTimeout) clearTimeout(connectionTimeout);
    
    // 4.5 Saniye sonra kontrol et
    connectionTimeout = setTimeout(() => {
        const sText = document.getElementById("statusText");
        const isStillConnecting = sText && (sText.innerText.includes("Bağlanılıyor") || sText.innerText.includes("Değiştiriliyor"));
        
        if (!state.isPlaying && isStillConnecting) {
            console.warn("Bağlantı zaman aşımı (4.5sn).");
            handleConnectionError();
        }
    }, 4500);
}

// --- SIFIRLAMA YARDIMCISI ---
function resetErrorState() {
    clearTimeout(connectionTimeout);
    clearTimeout(timers.connection);
    clearTimeout(timers.retry);
    
    state.isRetrying = false;
    state.isSwitching = false;
    
    const pBox = document.getElementById("playerBox");
    if(pBox) pBox.classList.remove('player-error');
    
    const errOverlay = document.getElementById("error-overlay");
    if(errOverlay) errOverlay.classList.remove('active-error');
}

// --- OYNAT / DURDUR ---
export function togglePlay() {
    const active = getActivePlayer(); if(!active) return;
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (active.paused) { playRadio(); } 
    else {
        updateStatusUI(null, "Durduruluyor...", "#aaa"); clearInterval(timers.fade);
        clearTimeout(connectionTimeout); 
        timers.fade = setInterval(() => {
            if (active.volume > 0.02) { active.volume -= 0.02; } 
            else { active.pause(); active.volume = 0; clearInterval(timers.fade); state.isPlaying = false; resetPlayerUI(); }
        }, 50);
    }
}

export function playRadio() {
    resetErrorState();

    const active = getActivePlayer(); if(!active) return;
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    
    if (!active.src || active.src === "" || active.src !== CONFIG.stations[state.currentStation].url) { 
        active.src = CONFIG.stations[state.currentStation].url; 
    }
    
    updateStatusUI("connecting", "Radyo Başlatılıyor...");
    startConnectionTimer(); 

    active.volume = 0;
    const playPromise = active.play();
    
    if (playPromise !== undefined) {
        playPromise.then(() => { 
            fadeIn(active); 
            onRadioStarted(); 
        }).catch(error => { 
            console.warn("Play Promise Hatası:", error);
            handleConnectionError(); 
        });
    }
}

function onRadioStarted() {
    clearTimeout(connectionTimeout);
    
    state.isPlaying = true; 
    state.isRetrying = false; 
    
    updateBackground('station'); 
    updateThemeColors(false); 
    updateStatusUI("live", "CANLI YAYIN");
    
    startSongDetectionLoop(); 
    updateMediaSessionMetadata();
    
    const pBox = document.getElementById("playerBox");
    if(pBox) {
        pBox.classList.add("playing", "active-glow"); 
        pBox.classList.remove("player-error");
    }
    
    document.getElementById("playIcon").classList.replace("fa-play", "fa-pause"); 
    document.body.classList.remove("shake-active");
    
    document.title = `Yusuf Ali - ${CONFIG.stations[state.currentStation].name}`;
    document.documentElement.style.setProperty('--spin-speed', '5s');
    
    if (isElectron) { 
        ipcRenderer.send('update-discord-activity', { details: CONFIG.stations[state.currentStation].name, state: "Canlı Yayında 🎧" });
        triggerRadioCard();
    }
}

function resetPlayerUI() {
    clearTimeout(connectionTimeout);
    updateStatusUI(null, "Durduruldu", "#aaa"); updateBackground('default'); updateThemeColors(false);
    document.getElementById("playerBox").classList.remove("playing", "active-glow"); document.getElementById("playIcon").classList.replace("fa-pause", "fa-play");
    document.title = "Yusuf Ali - Kişisel Blog"; document.documentElement.style.setProperty('--spin-speed', '30s');
    if (isElectron) { ipcRenderer.send('update-discord-activity', { details: "YaliApp", state: "Ana Sayfada" }); }
}

export function triggerChangeStation(direction) {
    if(state.isSwitching) return;
    
    state.lastDirection = direction; // Yönü kaydet

    resetErrorState();
    state.isSwitching = true; 
    stopPopupSequence();
    
    state.currentStation = (state.currentStation + (direction === 1 ? 1 : -1) + CONFIG.stations.length) % CONFIG.stations.length;
    
    updateStatusUI("connecting", "Değiştiriliyor...");
    startConnectionTimer(); 

    const currentPlayer = getActivePlayer(); const nextPlayer = getInactivePlayer();
    nextPlayer.src = CONFIG.stations[state.currentStation].url; nextPlayer.volume = 0; 
    
    const playPromise = nextPlayer.play();
    if (playPromise !== undefined) { 
        playPromise.then(() => { 
            performCrossfade(currentPlayer, nextPlayer); 
        }).catch(err => { 
            console.warn("Crossfade Play Hatası:", err);
            handleConnectionError(); 
        }); 
    }
    
    timers.connection = setTimeout(() => { 
        if(state.isSwitching) { handleConnectionError(); } 
    }, 6000); 
}

function performCrossfade(oldPlayer, newPlayer) {
    if(getOS() === 'iOS') { oldPlayer.pause(); oldPlayer.currentTime = 0; newPlayer.volume = state.lastVolume; finishSwitch(); return; }
    const targetVol = Math.pow(state.lastVolume, 2);
    const fadeInterval = setInterval(() => {
        if(newPlayer.volume < targetVol) newPlayer.volume = Math.min(newPlayer.volume + 0.05, targetVol);
        if(oldPlayer.volume > 0) oldPlayer.volume = Math.max(oldPlayer.volume - 0.05, 0);
        if(newPlayer.volume >= targetVol && oldPlayer.volume <= 0) { clearInterval(fadeInterval); oldPlayer.pause(); oldPlayer.currentTime = 0; oldPlayer.src = ""; swapActivePlayer(); finishSwitch(); }
    }, 100); 
}

function finishSwitch() { 
    state.isSwitching = false; 
    clearTimeout(timers.connection); 
    onRadioStarted(); 
}

export function setupVolumeControl() {
    const slider = document.getElementById("volRange"); slider.value = state.lastVolume; updateVolFill(state.lastVolume);
    slider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value); state.lastVolume = val;
        const active = getActivePlayer(); if(active) active.volume = Math.pow(val, 2);
        updateVolFill(val); const icon = document.getElementById("volIcon");
        if(val === 0) icon.className = "fas fa-volume-mute"; else if(val < 0.5) icon.className = "fas fa-volume-down"; else icon.className = "fas fa-volume-up";
    });
}
export function toggleMute(e) { if(e) e.stopPropagation(); const active = getActivePlayer(); const slider = document.getElementById("volRange"); if(slider.value > 0) { state.lastVolume = parseFloat(slider.value); if(active) active.volume = 0; slider.value = 0; updateVolFill(0); document.getElementById("volIcon").className = "fas fa-volume-mute"; } else { let restore = state.lastVolume > 0 ? state.lastVolume : 0.5; if(active) active.volume = Math.pow(restore, 2); slider.value = restore; updateVolFill(restore); document.getElementById("volIcon").className = "fas fa-volume-up"; } }
function updateVolFill(val) { const fill = document.getElementById("volFill"); if(fill) fill.style.width = (val * 100) + "%"; }
function fadeIn(audio) { const targetVol = Math.pow(state.lastVolume, 2) || 0.25; audio.volume = 0; clearInterval(timers.fade); timers.fade = setInterval(() => { if (audio.volume < targetVol - 0.02) audio.volume += 0.02; else { audio.volume = targetVol; clearInterval(timers.fade); } }, 100); }

// --- HATA YÖNETİMİ ---
function handleConnectionError() {
    if (state.isRetrying) return; 
    state.isRetrying = true;

    clearTimeout(connectionTimeout);
    clearTimeout(timers.connection);
    clearTimeout(timers.retry);

    updateStatusUI("error", "Hata! Geçiliyor...", "red");
    const pBox = document.getElementById("playerBox");
    if(pBox) pBox.classList.add('player-error');
    
    shakePlayer(); 
    
    updateBackground('error');
    updateThemeColors(true);
    
    setTimeout(() => {
        forceSkipStation();
    }, 1500);
}

function forceSkipStation() { 
    resetErrorState();
    
    const active = getActivePlayer(); 
    if(active) { active.pause(); active.src = ""; } 
    
    const direction = state.lastDirection || 1; 

    state.currentStation = (state.currentStation + direction + CONFIG.stations.length) % CONFIG.stations.length; 
    
    playRadio(); 
}

// ==========================================================
// 1:30 DAKİKA ARAYLA TARAMA SİSTEMİ
// ==========================================================

function startSongDetectionLoop() {
    clearInterval(timers.detection);
    timers.detection = setInterval(() => { 
        if(state.stage === 3 && state.isPlaying && !state.isSwitching) triggerPopupSequence(); 
    }, 90000); 
    setTimeout(() => { 
        if(state.stage === 3 && state.isPlaying) triggerPopupSequence(); 
    }, 3500);
}

function triggerPopupSequence() {
    stopPopupSequence();
    
    // UI: Sadece tarama kutusunu aç
    showScanningPopup();
    
    captureAudioAndIdentify();
}

async function captureAudioAndIdentify() {
    if (!audioCtx || !analyzer) { showPopupResult(false, null, null, null); return; }
    const dest = audioCtx.createMediaStreamDestination(); analyzer.connect(dest);
    let mediaRecorder; const chunks = [];
    try { mediaRecorder = new MediaRecorder(dest.stream); } catch (err) { console.error(err); showPopupResult(false, null, null, null); return; }
    mediaRecorder.ondataavailable = function(evt) { chunks.push(evt.data); };
    mediaRecorder.onstop = async function(evt) {
        const blob = new Blob(chunks, { 'type' : 'audio/webm; codecs=opus' });
        const formData = new FormData(); 
        formData.append("file", blob); 
        formData.append("api_token", "f7c031d5e37ebdfceeb5a3294b00bdef"); 
        formData.append("return", "apple_music,spotify");
        try {
            const titleEl = document.getElementById('popupTitle'); if(titleEl) titleEl.innerText = "Bulunuyor...";
            const response = await fetch("https://api.audd.io/", { method: "POST", body: formData });
            const result = await response.json();
            if (result && result.status === "success" && result.result) {
                const track = result.result;
                let artUrl = null;
                if(track.apple_music && track.apple_music.artwork) artUrl = track.apple_music.artwork.url.replace('{w}', '200').replace('{h}', '200');
                else if(track.spotify && track.spotify.album) artUrl = track.spotify.album.images[0].url;
                showPopupResult(true, track.artist, track.title, artUrl);
            } else { showPopupResult(false, null, null, null); }
        } catch (error) { showPopupResult(false, null, null, null); }
    };
    mediaRecorder.start();
    setTimeout(() => { if(mediaRecorder.state === "recording") { mediaRecorder.stop(); } }, 4500);
}

function showPopupResult(found, artist, trackName, artUrl) {
    if (isElectron) {
        if (found) {
            ipcRenderer.send('update-discord-activity', { details: `${artist} - ${trackName}`, state: `Dinleniyor: ${CONFIG.stations[state.currentStation].name}` });
        } else {
            ipcRenderer.send('update-discord-activity', { details: CONFIG.stations[state.currentStation].name, state: "Canlı Yayında 🎧" });
        }
    }

    if (found) {
        // Bulunduysa: Baloncuğu göster
        // (Süre sınırını kaldırdık, artık hep kalacak)
        showBubble(artist, trackName, artUrl);
        
    } else {
        // Bulunamadıysa: Sadece tarama kutusunu kapat
        hideScanningPopup();
    }
}

function stopPopupSequence() { 
    clearTimeout(timers.popupSearch); 
    clearTimeout(timers.popupResult); 
    clearTimeout(timers.popupClose); 
    
    hideScanningPopup();
    hideBubble();
}

function updateMediaSessionMetadata() { if ('mediaSession' in navigator) { const artUrl = new URL('assets/profil.webp', window.location.href).href; navigator.mediaSession.metadata = new MediaMetadata({ title: CONFIG.stations[state.currentStation].name, artist: "Yusuf Ali Blog", album: "Canlı Yayın", artwork: [{ src: artUrl, sizes: '512x512', type: 'image/webp' }] }); } }