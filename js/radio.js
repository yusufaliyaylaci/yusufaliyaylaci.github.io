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

        const audio1 = document.getElementById("bgMusic1"); 
        const audio2 = document.getElementById("bgMusic2");

        const gain1 = ctx.createGain();
        const gain2 = ctx.createGain();

        const source1 = ctx.createMediaElementSource(audio1); 
        source1.connect(gain1).connect(node);

        const source2 = ctx.createMediaElementSource(audio2); 
        source2.connect(gain2).connect(node);

        node.connect(ctx.destination);

        state.gainNodes = { 1: gain1, 2: gain2 };
        gain1.gain.value = 1;
        gain2.gain.value = 1;

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
    
    setTimeout(preloadNextStation, 2000);

    const pBox = document.getElementById("playerBox");
    if(pBox) { pBox.classList.add("playing", "active-glow"); pBox.classList.remove("player-error"); }
    document.getElementById("playIcon").classList.replace("fa-play", "fa-pause"); 
    document.body.classList.remove("shake-active");
    document.title = `Yusuf Ali - ${CONFIG.stations[state.currentStation].name}`;
    document.documentElement.style.setProperty('--spin-speed', '5s');
    
    if (isElectron) { 
        let detailsText = CONFIG.stations[state.currentStation].name; 
        let stateText = "Canlı Yayında 🎧";

        if (state.isListenerMode) {
            stateText = "Yusuf Ali ile Dinliyor 🎧";
        }

        ipcRenderer.send('update-discord-activity', { details: detailsText, state: stateText });
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
    state.isSwitching = true; 

    state.currentStation = (state.currentStation + (direction === 1 ? 1 : -1) + CONFIG.stations.length) % CONFIG.stations.length;
    const targetUrl = CONFIG.stations[state.currentStation].url;

    updateStatusUI("connecting", "Değiştiriliyor...");
    
    const currentPlayer = getActivePlayer(); 
    const nextPlayer = getInactivePlayer();
    
    const isPreloaded = (nextPlayer.src === targetUrl && !nextPlayer.paused);

    if (isPreloaded) {
        console.log("Hızlı geçiş yapılıyor! (Ön yükleme aktif)");
        performCrossfade(currentPlayer, nextPlayer);
    } else {
        startConnectionTimer(); 
        nextPlayer.src = targetUrl; 
        nextPlayer.volume = 0; 
        
        const nextId = state.activePlayerId === 1 ? 2 : 1;
        if (state.gainNodes && state.gainNodes[nextId]) {
            state.gainNodes[nextId].gain.value = 0; 
        }

        const playPromise = nextPlayer.play();
        if (playPromise !== undefined) { 
            playPromise.then(() => { performCrossfade(currentPlayer, nextPlayer); })
            .catch(err => { console.warn("Hata:", err); handleConnectionError(); }); 
        }
    }
    
    timers.connection = setTimeout(() => { if(state.isSwitching) { handleConnectionError(); } }, 6000); 
}

function performCrossfade(oldPlayer, newPlayer) {
    if(getOS() === 'iOS') { oldPlayer.pause(); oldPlayer.currentTime = 0; newPlayer.volume = state.lastVolume; finishSwitch(); return; }

    const targetVol = Math.pow(state.lastVolume, 2); 
    const activeId = state.activePlayerId;           
    const nextId = activeId === 1 ? 2 : 1;           

    const fadeDuration = 500;  
    const intervalTime = 50;   
    
    const totalSteps = fadeDuration / intervalTime;
    const stepAmount = targetVol / totalSteps;

    const fadeInterval = setInterval(() => {
        if(newPlayer.volume < targetVol) {
            newPlayer.volume = Math.min(newPlayer.volume + stepAmount, targetVol);
            if(state.gainNodes && state.gainNodes[nextId]) state.gainNodes[nextId].gain.value = 1; 
        }
        
        if(oldPlayer.volume > 0) {
            oldPlayer.volume = Math.max(oldPlayer.volume - stepAmount, 0);
        }
        
        const isNewReady = newPlayer.volume >= (targetVol - stepAmount);
        const isOldDone = oldPlayer.volume <= stepAmount;

        if(isNewReady && isOldDone) { 
            clearInterval(fadeInterval); 
            oldPlayer.pause(); oldPlayer.currentTime = 0; oldPlayer.src = ""; 
            if(state.gainNodes && state.gainNodes[activeId]) state.gainNodes[activeId].gain.value = 0; 
            newPlayer.volume = targetVol;
            swapActivePlayer(); 
            finishSwitch(); 
        }
    }, intervalTime); 
}

function finishSwitch() { state.isSwitching = false; clearTimeout(timers.connection); onRadioStarted(); }

function preloadNextStation() {
    if (!state.isPlaying || state.isSwitching) return;

    const nextIndex = (state.currentStation + 1) % CONFIG.stations.length;
    const nextUrl = CONFIG.stations[nextIndex].url;

    const inactive = getInactivePlayer();
    const inactiveId = state.activePlayerId === 1 ? 2 : 1;
    const inactiveGain = state.gainNodes ? state.gainNodes[inactiveId] : null;

    if (inactive.src === nextUrl && !inactive.paused) return;

    console.log("Ön yükleme başlatılıyor: " + CONFIG.stations[nextIndex].name);

    if (inactiveGain) inactiveGain.gain.value = 0;
    inactive.volume = 0; 
    inactive.src = nextUrl;
    
    const playPromise = inactive.play();
    if (playPromise !== undefined) {
        playPromise.catch(e => console.log("Ön yükleme hatası (önemsiz):", e));
    }
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
    showScanningPopup();
    captureAudioAndIdentify();
}

async function captureAudioAndIdentify() {
    if (!audioCtx || !analyzer) { showPopupResult(false, null, null, null, null); return; }
    
    const titleEl = document.getElementById('popupTitle'); 
    if(titleEl) titleEl.innerText = "Dinleniyor...";

    const dest = audioCtx.createMediaStreamDestination(); 
    analyzer.connect(dest);
    
    let mediaRecorder; 
    const chunks = [];
    
    try { mediaRecorder = new MediaRecorder(dest.stream); } 
    catch (err) { console.error(err); showPopupResult(false, null, null, null, null); return; }

    mediaRecorder.ondataavailable = function(evt) { chunks.push(evt.data); };
    
    mediaRecorder.onstop = async function(evt) {
        const blob = new Blob(chunks, { 'type' : 'audio/webm; codecs=opus' });
        if(titleEl) titleEl.innerText = "Analiz ediliyor...";

        let foundResult = null;
        if (!CONFIG.acrKeys || CONFIG.acrKeys.length === 0) {
            showPopupResult(false, null, null, null, null); return;
        }

        for (let i = 0; i < CONFIG.acrKeys.length; i++) {
            const currentKey = CONFIG.acrKeys[i];
            try {
                const result = await identifyWithACRCloud(blob, currentKey);
                if (result && result.status) {
                    if (result.status.code === 0) { foundResult = result; break; } 
                    else if (result.status.code === 1001) { break; } 
                    else if (result.status.code === 3001) { continue; }
                }
            } catch (e) { console.error("API Hatası:", e); }
        }

        if (foundResult && foundResult.status.code === 0 && foundResult.metadata && foundResult.metadata.music && foundResult.metadata.music.length > 0) {
            const music = foundResult.metadata.music[0];
            const artist = music.artists ? music.artists.map(a => a.name).join(", ") : "Bilinmiyor";
            const title = music.title;
            
            // --- GÜNCELLEME: Tüm Linkleri ve Google Search'ü Hazırla ---
            let links = { spotify: null, youtube: null, deezer: null, google: null };
            
            // ACRCloud Metadata'dan çek
            if (music.external_metadata) {
                if (music.external_metadata.spotify?.track?.id) {
                    links.spotify = `https://open.spotify.com/track/${music.external_metadata.spotify.track.id}`;
                }
                if (music.external_metadata.youtube?.vid) {
                    links.youtube = `https://www.youtube.com/watch?v=${music.external_metadata.youtube.vid}`;
                }
                if (music.external_metadata.deezer?.track?.id) {
                    links.deezer = `https://www.deezer.com/track/${music.external_metadata.deezer.track.id}`;
                }
            }
            
            // Her zaman Google Search linki oluştur (Fallback olarak)
            const query = encodeURIComponent(`${artist} ${title}`);
            links.google = `https://www.google.com/search?q=${query}`;
            // ---------------------------------------------------------

            showPopupResult(true, artist, title, null, links); // Artık görsel URL göndermiyoruz (null)
        } else {
            showPopupResult(false, null, null, null, null);
        }
    };
    
    mediaRecorder.start();
    setTimeout(() => { if(mediaRecorder.state === "recording") { mediaRecorder.stop(); } }, 6000);
}

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

    const response = await fetch(`https://${keyData.host}/v1/identify`, { method: 'POST', body: formData });
    return await response.json();
}

async function hmacSha1(key, message) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const msgData = encoder.encode(message);
    const cryptoKey = await window.crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const signature = await window.crypto.subtle.sign("HMAC", cryptoKey, msgData);
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function showPopupResult(found, artist, trackName, artUrl, links) {
    if (isElectron) {
        let detailsText = `${artist} - ${trackName}`;
        let stateText = `Dinleniyor: ${CONFIG.stations[state.currentStation].name}`;

        if(state.isListenerMode) {
            stateText = "Yusuf Ali ile Dinliyor 🎧"; 
        }

        if (found) { ipcRenderer.send('update-discord-activity', { details: detailsText, state: stateText }); } 
        else { 
            let defDetails = CONFIG.stations[state.currentStation].name;
            let defState = "Canlı Yayında 🎧";
            if(state.isListenerMode) {
                 defState = "Yusuf Ali ile Dinliyor 🎧";
            }
            ipcRenderer.send('update-discord-activity', { details: defDetails, state: defState }); 
        }
    }
    if (found) { showBubble(artist, trackName, artUrl, links); } 
    else { hideScanningPopup(); }
}

function stopPopupSequence() { 
    clearTimeout(timers.popupSearch); clearTimeout(timers.popupResult); clearTimeout(timers.popupClose); 
    hideScanningPopup(); hideBubble();
}

function updateMediaSessionMetadata() { 
    if ('mediaSession' in navigator) { 
        const artUrl = new URL('https://yusufaliyaylaci.com/assets/profil.webp').href; 
        navigator.mediaSession.metadata = new MediaMetadata({ title: CONFIG.stations[state.currentStation].name, artist: "Yusuf Ali Blog", album: "Canlı Yayın", artwork: [{ src: artUrl, sizes: '512x512', type: 'image/webp' }] }); 
    } 
}