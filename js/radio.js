import { CONFIG } from './config.js';
import { state, timers, audioCtx, setAudioContext, setAnalyzer, setDataArray, analyzer } from './state.js';
import { updateStatusUI, updateBackground, updateThemeColors, getOS, triggerRadioCard } from './ui.js';
import { isElectron, ipcRenderer } from './main.js';

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

// --- OYNAT / DURDUR ---
export function togglePlay() {
    const active = getActivePlayer(); if(!active) return;
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (active.paused) { playRadio(); } 
    else {
        updateStatusUI(null, "Durduruluyor...", "#aaa"); clearInterval(timers.fade);
        timers.fade = setInterval(() => {
            if (active.volume > 0.02) { active.volume -= 0.02; } 
            else { active.pause(); active.volume = 0; clearInterval(timers.fade); state.isPlaying = false; resetPlayerUI(); }
        }, 50);
    }
}

export function playRadio() {
    const active = getActivePlayer(); if(!active) return;
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (!active.src || active.src === "") { active.src = CONFIG.stations[state.currentStation].url; }
    updateStatusUI("connecting", "Radyo Başlatılıyor...");
    active.volume = 0;
    const playPromise = active.play();
    if (playPromise !== undefined) {
        playPromise.then(() => { fadeIn(active); onRadioStarted(); }).catch(error => { console.warn("Oynatma hatası:", error); resetPlayerUI(); });
    }
}

function onRadioStarted() {
    state.isPlaying = true; updateBackground('station'); updateThemeColors(false); updateStatusUI("live", "CANLI YAYIN");
    
    // Müzik Tarama Döngüsünü Başlat (Her istasyon değişiminde burası çalışır ve süreyi sıfırlar)
    startSongDetectionLoop(); 
    
    updateMediaSessionMetadata();
    document.getElementById("playerBox").classList.add("playing", "active-glow"); document.getElementById("playerBox").classList.remove("player-error");
    document.getElementById("playIcon").classList.replace("fa-play", "fa-pause"); document.body.classList.remove("shake-active");
    document.title = `Yusuf Ali - ${CONFIG.stations[state.currentStation].name}`;
    document.documentElement.style.setProperty('--spin-speed', '5s');
    
    if (isElectron) { 
        ipcRenderer.send('update-discord-activity', { details: CONFIG.stations[state.currentStation].name, state: "Canlı Yayında 🎧" });
        // Sadece Uygulamada Radyo Kartını Aç (Web sitesinde açmaz)
        triggerRadioCard();
    }
}

function resetPlayerUI() {
    updateStatusUI(null, "Durduruldu", "#aaa"); updateBackground('default'); updateThemeColors(false);
    document.getElementById("playerBox").classList.remove("playing", "active-glow"); document.getElementById("playIcon").classList.replace("fa-pause", "fa-play");
    document.title = "Yusuf Ali - Kişisel Blog"; document.documentElement.style.setProperty('--spin-speed', '30s');
    if (isElectron) { ipcRenderer.send('update-discord-activity', { details: "YaliApp", state: "Ana Sayfada" }); }
}

export function triggerChangeStation(direction) {
    if(state.isSwitching) return;
    state.isSwitching = true; stopPopupSequence();
    state.currentStation = (state.currentStation + (direction === 1 ? 1 : -1) + CONFIG.stations.length) % CONFIG.stations.length;
    updateStatusUI("connecting", "Değiştiriliyor...");
    const currentPlayer = getActivePlayer(); const nextPlayer = getInactivePlayer();
    nextPlayer.src = CONFIG.stations[state.currentStation].url; nextPlayer.volume = 0; 
    const playPromise = nextPlayer.play();
    if (playPromise !== undefined) { playPromise.then(() => { performCrossfade(currentPlayer, nextPlayer); }).catch(err => { handleConnectionError(); forceSkipStation(); }); }
    clearTimeout(timers.connection); timers.connection = setTimeout(() => { if(state.isSwitching) { handleConnectionError(); forceSkipStation(); } }, 10000);
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
function handleConnectionError() { clearTimeout(timers.connection); clearTimeout(timers.retry); state.isRetrying = false; updateStatusUI("error", "Sinyal Yok, Değiştiriliyor...", "red"); document.getElementById("error-overlay").classList.add('active-error'); document.getElementById("playerBox").classList.add('player-error'); document.body.classList.add("shake-active"); updateBackground('error'); updateThemeColors(true); setTimeout(() => { document.getElementById("error-overlay").classList.remove('active-error'); document.getElementById("playerBox").classList.remove('player-error'); document.body.classList.remove("shake-active"); }, 1200); }
function forceSkipStation() { state.isSwitching = false; const active = getActivePlayer(); if(active) { active.pause(); active.src = ""; } state.currentStation = (state.currentStation + 1) % CONFIG.stations.length; playRadio(); }

// ==========================================================
// 1:30 DAKİKA ARAYLA TARAMA SİSTEMİ
// ==========================================================

function startSongDetectionLoop() {
    clearInterval(timers.detection);
    
    // 1:30 Dakika (90.000 ms) Döngü
    // Radyo her değiştiğinde clearInterval çalıştığı için süre sıfırlanmış olur.
    timers.detection = setInterval(() => { 
        if(state.stage === 3 && state.isPlaying && !state.isSwitching) triggerPopupSequence(); 
    }, 90000); 
    
    // Radyo açıldığında/değiştiğinde 3.5 saniye sonra İLK TARAMAYI yap
    setTimeout(() => { 
        if(state.stage === 3 && state.isPlaying) triggerPopupSequence(); 
    }, 3500);
}

function triggerPopupSequence() {
    stopPopupSequence(); const popup = document.getElementById('songPopup'); if(!popup) return;
    const title = document.getElementById('popupTitle'); const song = document.getElementById('popupSong'); const icon = document.querySelector('.popup-icon');
    
    popup.classList.add('active'); title.innerText = "Ortam Dinleniyor..."; title.style.color = "#ffeb3b"; 
    song.innerHTML = "Ses Analiz Ediliyor..."; song.style.color = "white";
    icon.innerHTML = '<i class="fas fa-microphone-alt fa-pulse"></i>'; icon.style.color = "white";
    
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
        
        // --- API KEY BURAYA ---
        formData.append("api_token", "f7c031d5e37ebdfceeb5a3294b00bdef"); // AudD.io Key
        
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

// 3. ADIM: Sonucu Göster ve Discord'u Güncelle
function showPopupResult(found, artist, trackName, artUrl) {
    const popup = document.getElementById('songPopup'); if(!popup) return;
    const title = document.getElementById('popupTitle'); 
    const song = document.getElementById('popupSong'); 
    const icon = document.querySelector('.popup-icon');

    // --- DISCORD RPC GÜNCELLEMESİ BAŞLANGIÇ ---
    if (isElectron) {
        if (found) {
            // Şarkı bulunduysa:
            // Details: Şarkı Adı - Sanatçı (Eski radyo adının olduğu yer)
            // State: Radyo İstasyonu Adı
            ipcRenderer.send('update-discord-activity', {
                details: `${artist} - ${trackName}`,
                state: `Dinleniyor: ${CONFIG.stations[state.currentStation].name}`
            });
        } else {
            // Şarkı bulunamadıysa varsayılan radyo durumuna dön
            ipcRenderer.send('update-discord-activity', {
                details: CONFIG.stations[state.currentStation].name,
                state: "Canlı Yayında 🎧"
            });
        }
    }
    // --- DISCORD RPC GÜNCELLEMESİ BİTİŞ ---

    if (found && artUrl) {
        // Kapak Resmi Varsa İkon yerine onu koy
        icon.innerHTML = `<img src="${artUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover; animation: spin 10s linear infinite;">`;
        title.innerText = "Şu An Çalıyor"; 
        title.style.color = "#4caf50"; // Yeşil (Başarılı)
    } else {
        // Bulunamadıysa Standart Müzik İkonu
        icon.innerHTML = '<i class="fas fa-broadcast-tower"></i>';
        title.innerText = "Yayın Akışı"; 
        title.style.color = "var(--theme-color)";
    }

    song.innerHTML = `<span style="color:var(--theme-color); font-size:0.85em; display:block; margin-bottom:2px;">${artist}</span>${trackName}`;
    
    // 6 saniye sonra pop-up kapat (Discord durumu kalıcı olur, sadece pop-up kapanır)
    timers.popupClose = setTimeout(() => { popup.classList.remove('active'); }, 6000);
}

function stopPopupSequence() { clearTimeout(timers.popupSearch); clearTimeout(timers.popupResult); clearTimeout(timers.popupClose); const popup = document.getElementById('songPopup'); if(popup) popup.classList.remove('active'); }
function updateMediaSessionMetadata() { if ('mediaSession' in navigator) { const artUrl = new URL('assets/profil.webp', window.location.href).href; navigator.mediaSession.metadata = new MediaMetadata({ title: CONFIG.stations[state.currentStation].name, artist: "Yusuf Ali Blog", album: "Canlı Yayın", artwork: [{ src: artUrl, sizes: '512x512', type: 'image/webp' }] }); } }