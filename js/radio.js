import { CONFIG } from './config.js';
import { state, timers, audioCtx, setAudioContext, setAnalyzer, setDataArray, analyzer } from './state.js';
import { updateStatusUI, updateBackground, updateThemeColors, getOS, triggerRadioCard, shakePlayer, showScanningPopup, hideScanningPopup, showBubble, hideBubble } from './ui.js';
import { isElectron, ipcRenderer } from './main.js';

let connectionTimeout = null;

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
    state.lastDirection = 1; 
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

// --- ZAMANLAYICI ---
function startConnectionTimer() {
    if (connectionTimeout) clearTimeout(connectionTimeout);
    connectionTimeout = setTimeout(() => {
        const sText = document.getElementById("statusText");
        const isStillConnecting = sText && (sText.innerText.includes("Bağlanılıyor") || sText.innerText.includes("Değiştiriliyor"));
        if (!state.isPlaying && isStillConnecting) {
            console.warn("Bağlantı zaman aşımı.");
            handleConnectionError();
        }
    }, 4500);
}

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
        playPromise.then(() => { fadeIn(active); onRadioStarted(); }).catch(error => { console.warn("Play Promise Hatası:", error); handleConnectionError(); });
    }
}

function onRadioStarted() {
    clearTimeout(connectionTimeout);
    state.isPlaying = true; state.isRetrying = false; 
    updateBackground('station'); updateThemeColors(false); updateStatusUI("live", "CANLI YAYIN");
    startSongDetectionLoop(); updateMediaSessionMetadata();
    const pBox = document.getElementById("playerBox");
    if(pBox) { pBox.classList.add("playing", "active-glow"); pBox.classList.remove("player-error"); }
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
    state.lastDirection = direction;
    resetErrorState(); state.isSwitching = true; stopPopupSequence();
    state.currentStation = (state.currentStation + (direction === 1 ? 1 : -1) + CONFIG.stations.length) % CONFIG.stations.length;
    updateStatusUI("connecting", "Değiştiriliyor...");
    startConnectionTimer(); 
    const currentPlayer = getActivePlayer(); const nextPlayer = getInactivePlayer();
    nextPlayer.src = CONFIG.stations[state.currentStation].url; nextPlayer.volume = 0; 
    const playPromise = nextPlayer.play();
    if (playPromise !== undefined) { 
        playPromise.then(() => { performCrossfade(currentPlayer, nextPlayer); }).catch(err => { console.warn("Crossfade Play Hatası:", err); handleConnectionError(); }); 
    }
    timers.connection = setTimeout(() => { if(state.isSwitching) { handleConnectionError(); } }, 6000); 
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

function finishSwitch() { state.isSwitching = false; clearTimeout(timers.connection); onRadioStarted(); }

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

function handleConnectionError() {
    if (state.isRetrying) return; state.isRetrying = true;
    clearTimeout(connectionTimeout); clearTimeout(timers.connection); clearTimeout(timers.retry);
    updateStatusUI("error", "Hata! Geçiliyor...", "red");
    const pBox = document.getElementById("playerBox"); if(pBox) pBox.classList.add('player-error');
    shakePlayer(); updateBackground('error'); updateThemeColors(true);
    setTimeout(() => { forceSkipStation(); }, 1500);
}

function forceSkipStation() { 
    resetErrorState();
    const active = getActivePlayer(); if(active) { active.pause(); active.src = ""; } 
    const direction = state.lastDirection || 1; 
    state.currentStation = (state.currentStation + direction + CONFIG.stations.length) % CONFIG.stations.length; 
    playRadio(); 
}

// ==========================================================
// ŞARKI BULMA VE TARAMA SİSTEMİ (ACRCloud Entegrasyonu)
// ==========================================================

function startSongDetectionLoop() {
    clearInterval(timers.detection);
    
    // NOT: Çok kullanıcılı ortamda kotanın hemen bitmemesi için
    // otomatik döngüyü isteğe bağlı açıp kapatabilirsiniz.
    // Şimdilik 90 saniyede bir tarama yapacak şekilde ayarladım.
    timers.detection = setInterval(() => { 
        if(state.stage === 3 && state.isPlaying && !state.isSwitching) triggerPopupSequence(); 
    }, 90000); // 90 saniye

    setTimeout(() => { 
        if(state.stage === 3 && state.isPlaying) triggerPopupSequence(); 
    }, 3500);
}

function triggerPopupSequence() {
    stopPopupSequence();
    showScanningPopup();
    captureAudioAndIdentify();
}

// --- ANA ŞARKI TANIMA FONKSİYONU ---
async function captureAudioAndIdentify() {
    if (!audioCtx || !analyzer) { showPopupResult(false, null, null, null); return; }
    
    const titleEl = document.getElementById('popupTitle'); 
    if(titleEl) titleEl.innerText = "Dinleniyor...";

    const dest = audioCtx.createMediaStreamDestination(); 
    analyzer.connect(dest);
    
    let mediaRecorder; 
    const chunks = [];
    
    try { mediaRecorder = new MediaRecorder(dest.stream); } 
    catch (err) { console.error(err); showPopupResult(false, null, null, null); return; }

    mediaRecorder.ondataavailable = function(evt) { chunks.push(evt.data); };
    
    mediaRecorder.onstop = async function(evt) {
        const blob = new Blob(chunks, { 'type' : 'audio/webm; codecs=opus' });
        if(titleEl) titleEl.innerText = "Analiz ediliyor...";

        // --- ACRCLOUD ÇOKLU KEY ROTASYONU ---
        let foundResult = null;
        
        // Config'deki tüm keyleri sırayla dene
        if (!CONFIG.acrKeys || CONFIG.acrKeys.length === 0) {
            console.warn("ACRCloud anahtarları bulunamadı!");
            showPopupResult(false, null, null, null);
            return;
        }

        for (let i = 0; i < CONFIG.acrKeys.length; i++) {
            const currentKey = CONFIG.acrKeys[i];
            
            try {
                const result = await identifyWithACRCloud(blob, currentKey);
                
                if (result && result.status) {
                    if (result.status.code === 0) { // BAŞARILI
                        foundResult = result;
                        break; 
                    } else if (result.status.code === 1001) { // ŞARKI YOK
                        break; 
                    } else if (result.status.code === 3001) { // KOTA DOLU / YETKİ YOK
                        console.warn(`Key ${i+1} kotası dolmuş veya hatalı, sıradakine geçiliyor...`);
                        continue; 
                    }
                }
            } catch (e) { console.error("API Hatası:", e); }
        }

        // Sonucu Göster
if (foundResult && foundResult.status.code === 0 && foundResult.metadata && foundResult.metadata.music && foundResult.metadata.music.length > 0) {
            const music = foundResult.metadata.music[0];
            const artist = music.artists ? music.artists.map(a => a.name).join(", ") : "Bilinmiyor";
            const title = music.title;
            
            // --- KAPAK RESMİ AYARI ---
            // Varsayılan olarak kendi logonuzu ayarlayalım
            let artUrl = "assets/yaliapp.png"; 
            
            // Eğer API'den geçerli bir kapak resmi gelirse onu kullanalım
            if (music.album && music.album.image && music.album.image.url) {
                artUrl = music.album.image.url;
            }
            // -------------------------

            showPopupResult(true, artist, title, artUrl);
        } else {
            showPopupResult(false, null, null, null);
        }
    };
    
    mediaRecorder.start();
    // ACRCloud en iyi sonucu 5-6 saniyede verir
    setTimeout(() => { if(mediaRecorder.state === "recording") { mediaRecorder.stop(); } }, 6000);
}

// --- ACRCloud Fetch Yardımcısı ---
async function identifyWithACRCloud(audioBlob, keyData) {
    const timestamp = Math.floor(Date.now() / 1000);
    const stringToSign = `POST\n/v1/identify\n${keyData.access_key}\naudio\n1\n${timestamp}`;
    const signature = await hmacSha1(keyData.access_secret, stringToSign);

    const formData = new FormData();
    formData.append('sample', audioBlob); 
    formData.append('access_key', keyData.access_key);
    formData.append('data_type', 'audio');
    formData.append('signature_version', '1');
    formData.append('signature', signature);
    formData.append('sample_bytes', audioBlob.size);
    formData.append('timestamp', timestamp);

    const response = await fetch(`https://${keyData.host}/v1/identify`, {
        method: 'POST',
        body: formData
    });

    return await response.json();
}

// --- İmza Oluşturucu (HMAC-SHA1) ---
async function hmacSha1(key, message) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const msgData = encoder.encode(message);
    const cryptoKey = await window.crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const signature = await window.crypto.subtle.sign("HMAC", cryptoKey, msgData);
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function showPopupResult(found, artist, trackName, artUrl) {
    if (isElectron) {
        if (found) { ipcRenderer.send('update-discord-activity', { details: `${artist} - ${trackName}`, state: `Dinleniyor: ${CONFIG.stations[state.currentStation].name}` }); } 
        else { ipcRenderer.send('update-discord-activity', { details: CONFIG.stations[state.currentStation].name, state: "Canlı Yayında 🎧" }); }
    }
    if (found) { showBubble(artist, trackName, artUrl); } 
    else { hideScanningPopup(); }
}

function stopPopupSequence() { 
    clearTimeout(timers.popupSearch); clearTimeout(timers.popupResult); clearTimeout(timers.popupClose); 
    hideScanningPopup(); hideBubble();
}

function updateMediaSessionMetadata() { if ('mediaSession' in navigator) { const artUrl = new URL('https://yusufaliyaylaci.github.io/assets/profil.webp').href; navigator.mediaSession.metadata = new MediaMetadata({ title: CONFIG.stations[state.currentStation].name, artist: "Yusuf Ali Blog", album: "Canlı Yayın", artwork: [{ src: artUrl, sizes: '512x512', type: 'image/webp' }] }); } }