import { CONFIG } from './config.js';
import { state, timers, audioCtx, setAudioContext, setAnalyzer, setDataArray } from './state.js';
import { updateStatusUI, updateBackground, updateThemeColors, getOS } from './ui.js';

// --- YARDIMCI FONKSİYONLAR ---
function getActivePlayer() {
    return document.getElementById(`bgMusic${state.activePlayerId}`);
}

function getInactivePlayer() {
    // Eğer 1 aktifse 2 pasiftir, 2 aktifse 1 pasiftir.
    const inactiveId = state.activePlayerId === 1 ? 2 : 1;
    return document.getElementById(`bgMusic${inactiveId}`);
}

function swapActivePlayer() {
    state.activePlayerId = state.activePlayerId === 1 ? 2 : 1;
}

// --- AUDIO CONTEXT (Görselleştirici İçin) ---
export function setupAudioContext() {
    if (audioCtx) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return;
    }

    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        setAudioContext(ctx);
        
        const node = ctx.createAnalyser();
        setAnalyzer(node);
        node.fftSize = 256;
        setDataArray(new Uint8Array(node.frequencyBinCount));
        
        // HER İKİ PLAYERI DA BAĞLIYORUZ
        // Böylece hangisi çalarsa çalsın görselleştirici çalışır.
        const audio1 = document.getElementById("bgMusic1");
        const audio2 = document.getElementById("bgMusic2");
        
        const source1 = ctx.createMediaElementSource(audio1);
        const source2 = ctx.createMediaElementSource(audio2);
        
        source1.connect(node);
        source2.connect(node);
        
        // Son olarak sesi hoparlöre ver
        node.connect(ctx.destination);
        
    } catch(e) { 
        console.warn("Audio Context Hatası:", e); 
    }
}

// --- BAŞLATMA ---
export function initRadio() {
    const player1 = document.getElementById("bgMusic1");
    const player2 = document.getElementById("bgMusic2");
    
    // Klavye Medya Tuşları
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => playRadio());
        navigator.mediaSession.setActionHandler('pause', () => togglePlay());
        navigator.mediaSession.setActionHandler('previoustrack', () => triggerChangeStation(-1));
        navigator.mediaSession.setActionHandler('nexttrack', () => triggerChangeStation(1));
        navigator.mediaSession.setActionHandler('stop', () => togglePlay());
    }

    // İlk açılışta 1. playerı hazırlıyoruz ama çalmıyoruz
    player1.src = CONFIG.stations[state.currentStation].url;
    player1.volume = Math.pow(state.lastVolume, 2); // Logaritmik ses
}

// --- OYNAT / DURDUR (Global) ---
export function togglePlay() {
    const active = getActivePlayer();
    if(!active) return;
    
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    if (active.paused) {
        playRadio();
    } else {
        // Durdururken fade-out yapalım
        updateStatusUI(null, "Durduruluyor...", "#aaa");
        clearInterval(timers.fade);
        
        timers.fade = setInterval(() => {
            if (active.volume > 0.02) {
                active.volume -= 0.02;
            } else {
                active.pause();
                active.volume = 0;
                clearInterval(timers.fade);
                state.isPlaying = false;
                resetPlayerUI();
            }
        }, 50);
    }
}

// Sadece Oynat (Açılış ve Devam Ettirme)
export function playRadio() {
    const active = getActivePlayer();
    if(!active) return;
    
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    
    // Eğer URL yoksa yükle (Sayfa ilk açıldığında boş olabilir)
    if (!active.src || active.src === "") {
        active.src = CONFIG.stations[state.currentStation].url;
    }

    updateStatusUI("connecting", "Radyo Başlatılıyor...");
    
    // Fade-in ile başlat
    active.volume = 0;
    const playPromise = active.play();
    
    if (playPromise !== undefined) {
        playPromise.then(() => {
            fadeIn(active);
            onRadioStarted();
        }).catch(error => {
            console.warn("Oynatma hatası:", error);
            resetPlayerUI();
        });
    }
}

function onRadioStarted() {
    state.isPlaying = true;
    updateBackground('station'); 
    updateThemeColors(false); 
    updateStatusUI("live", "CANLI YAYIN");
    
    startSongDetectionLoop(); 
    updateMediaSessionMetadata();
    
    document.getElementById("playerBox").classList.add("playing", "active-glow");
    document.getElementById("playerBox").classList.remove("player-error");
    document.getElementById("playIcon").classList.replace("fa-play", "fa-pause");
    document.body.classList.remove("shake-active");
    
    document.title = `Yusuf Ali - ${CONFIG.stations[state.currentStation].name}`;
    document.documentElement.style.setProperty('--spin-speed', '5s');
}

function resetPlayerUI() {
    updateStatusUI(null, "Durduruldu", "#aaa");
    updateBackground('default');
    updateThemeColors(false);
    document.getElementById("playerBox").classList.remove("playing", "active-glow");
    document.getElementById("playIcon").classList.replace("fa-pause", "fa-play");
    document.title = "Yusuf Ali - Kişisel Blog";
    document.documentElement.style.setProperty('--spin-speed', '30s');
}

// --- İSTASYON DEĞİŞTİRME (CROSSFADE MANTIĞI BURADA) ---
export function triggerChangeStation(direction) {
    if(state.isSwitching) return;
    state.isSwitching = true;
    stopPopupSequence();
    
    // 1. Yeni indeksi hesapla
    state.currentStation = (state.currentStation + (direction === 1 ? 1 : -1) + CONFIG.stations.length) % CONFIG.stations.length;
    
    // 2. Kullanıcıya bilgi ver (Eski radyo hala çalıyor!)
    updateStatusUI("connecting", "Değiştiriliyor...");
    
    // 3. Pasif player'ı hazırla
    const currentPlayer = getActivePlayer();
    const nextPlayer = getInactivePlayer();
    
    nextPlayer.src = CONFIG.stations[state.currentStation].url;
    nextPlayer.volume = 0; // Sessiz başla
    
    // 4. Yeni radyo yüklenip çalmaya hazır olduğunda...
    // 'canplay' bazen tetiklenmeyebilir, 'playing' daha garantidir ama play() çağırmamız lazım.
    const playPromise = nextPlayer.play();
    
    if (playPromise !== undefined) {
        playPromise.then(() => {
            // BAĞLANTI BAŞARILI: Crossfade Başlasın!
            performCrossfade(currentPlayer, nextPlayer);
        }).catch(err => {
            // Hata olursa
            console.error("Geçiş hatası:", err);
            handleConnectionError();
            forceSkipStation();
        });
    }
    
    // Güvenlik zamanlayıcısı (Eğer 10 saniye içinde açılmazsa hata ver)
    clearTimeout(timers.connection);
    timers.connection = setTimeout(() => {
        if(state.isSwitching) {
            handleConnectionError();
            forceSkipStation();
        }
    }, 10000);
}

function performCrossfade(oldPlayer, newPlayer) {
    // iOS'te aynı anda iki ses çalmak zordur, direkt geçiş yap.
    if(getOS() === 'iOS') {
        oldPlayer.pause();
        oldPlayer.currentTime = 0;
        newPlayer.volume = state.lastVolume;
        finishSwitch();
        return;
    }

    // Hedef ses seviyesi
    const targetVol = Math.pow(state.lastVolume, 2);
    let vol = 0;
    
    // Crossfade Süresi: 3 saniye (yaklaşık)
    // Her 100ms'de bir sesi %3 artır/azalt
    const fadeInterval = setInterval(() => {
        // Yeni player sesi artır
        if(newPlayer.volume < targetVol) {
            newPlayer.volume = Math.min(newPlayer.volume + 0.05, targetVol);
        }
        
        // Eski player sesi azalt
        if(oldPlayer.volume > 0) {
            oldPlayer.volume = Math.max(oldPlayer.volume - 0.05, 0);
        }
        
        // Geçiş Bitti mi?
        if(newPlayer.volume >= targetVol && oldPlayer.volume <= 0) {
            clearInterval(fadeInterval);
            
            // Eski player'ı tamamen durdur ve sıfırla
            oldPlayer.pause();
            oldPlayer.currentTime = 0;
            oldPlayer.src = ""; // Kaynağı boşalt ki internet yemesin
            
            // Aktif player'ı değiştir
            swapActivePlayer();
            finishSwitch();
        }
    }, 100); 
}

function finishSwitch() {
    state.isSwitching = false;
    clearTimeout(timers.connection);
    onRadioStarted(); // UI güncellemesi
}

// --- SES KONTROLLERİ ---
export function setupVolumeControl() {
    const slider = document.getElementById("volRange");
    slider.value = state.lastVolume;
    updateVolFill(state.lastVolume);
    
    slider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        state.lastVolume = val;
        // Şu an çalan player'ın sesini ayarla
        const active = getActivePlayer();
        if(active) active.volume = Math.pow(val, 2);
        
        updateVolFill(val);
        const icon = document.getElementById("volIcon");
        if(val === 0) icon.className = "fas fa-volume-mute";
        else if(val < 0.5) icon.className = "fas fa-volume-down";
        else icon.className = "fas fa-volume-up";
    });
}

export function toggleMute(e) {
    if(e) e.stopPropagation();
    const active = getActivePlayer();
    const slider = document.getElementById("volRange");
    
    if(slider.value > 0) {
        state.lastVolume = parseFloat(slider.value);
        if(active) active.volume = 0;
        slider.value = 0; updateVolFill(0);
        document.getElementById("volIcon").className = "fas fa-volume-mute";
    } else {
        let restore = state.lastVolume > 0 ? state.lastVolume : 0.5;
        if(active) active.volume = Math.pow(restore, 2);
        slider.value = restore; updateVolFill(restore);
        document.getElementById("volIcon").className = "fas fa-volume-up";
    }
}

function updateVolFill(val) { 
    const fill = document.getElementById("volFill");
    if(fill) fill.style.width = (val * 100) + "%"; 
}

// Sadece tek player için fade-in (İlk açılışta)
function fadeIn(audio) {
    const targetVol = Math.pow(state.lastVolume, 2) || 0.25;
    audio.volume = 0;
    clearInterval(timers.fade);
    timers.fade = setInterval(() => { 
        if (audio.volume < targetVol - 0.02) audio.volume += 0.02; 
        else { audio.volume = targetVol; clearInterval(timers.fade); } 
    }, 100);
}

// --- HATA YÖNETİMİ ---
function handleConnectionError() {
    clearTimeout(timers.connection); clearTimeout(timers.retry); 
    state.isRetrying = false;
    
    updateStatusUI("error", "Sinyal Yok, Değiştiriliyor...", "red");
    document.getElementById("error-overlay").classList.add('active-error');
    document.getElementById("shockwave").classList.add('active-swipe');
    document.getElementById("playerBox").classList.add('player-error');
    document.body.classList.add("shake-active");
    
    updateBackground('error'); 
    updateThemeColors(true);
    
    setTimeout(() => {
        document.getElementById("error-overlay").classList.remove('active-error');
        document.getElementById("shockwave").classList.remove('active-swipe');
        document.getElementById("playerBox").classList.remove('player-error');
        document.body.classList.remove("shake-active");
    }, 1200);
}

function forceSkipStation() { 
    state.isSwitching = false; 
    // Hata durumunda direkt diğer kanala geç, crossfade bekleme
    const active = getActivePlayer();
    if(active) { active.pause(); active.src = ""; }
    
    state.currentStation = (state.currentStation + 1) % CONFIG.stations.length;
    playRadio(); // Normal başlat
}

function attemptReconnect() {
    if(state.isRetrying) return; 
    state.isRetrying = true;
    
    updateStatusUI("retrying", "Bağlantı Zayıf, Tekrar Deneniyor...");
    const active = getActivePlayer();
    
    timers.retry = setTimeout(() => { 
        if(state.isRetrying) { handleConnectionError(); forceSkipStation(); } 
    }, 5000);
    
    if(active) { active.load(); active.play().catch(e => {}); }
}

// Şarkı Tanıma ve Metadata fonksiyonları aynı kalabilir...
function startSongDetectionLoop() {
    clearInterval(timers.detection);
    timers.detection = setInterval(() => { 
        if(state.stage === 3 && state.isPlaying && !state.isSwitching) triggerPopupSequence(); 
    }, 30000);
    setTimeout(() => { if(state.stage === 3 && state.isPlaying) triggerPopupSequence(); }, 3500);
}

function triggerPopupSequence() {
    stopPopupSequence(); const popup = document.getElementById('songPopup'); if(!popup) return;
    const title = document.getElementById('popupTitle'); const song = document.getElementById('popupSong'); const icon = document.querySelector('.popup-icon');
    
    popup.classList.add('active'); 
    title.innerText = "Ses Analizi"; title.style.color = "#aaa"; 
    song.innerHTML = "Frekans Taranıyor..."; song.style.color = "white";
    icon.innerHTML = '<i class="fas fa-compact-disc fa-spin"></i>'; icon.style.color = "white";
    
    timers.popupSearch = setTimeout(() => {
        const stationName = CONFIG.stations[state.currentStation].name; 
        let displayTitle = "Müzik Yayını"; let displayArtist = stationName; let foundData = false;
        
        if('mediaSession' in navigator && navigator.mediaSession.metadata) {
            if(navigator.mediaSession.metadata.title) { displayTitle = navigator.mediaSession.metadata.title; foundData = true; }
            if(navigator.mediaSession.metadata.artist) { displayArtist = navigator.mediaSession.metadata.artist; }
        }
        
        title.innerText = foundData ? "Şarkı Bulundu" : "Şu An Yayında"; 
        title.style.color = foundData ? "#4caf50" : "var(--theme-color)";
        song.innerHTML = `<span style="color:var(--theme-color); font-size:0.85em; display:block; margin-bottom:2px;">${displayArtist}</span>${displayTitle}`;
        icon.innerHTML = '<i class="fas fa-music"></i>'; icon.style.color = "var(--theme-color)";
        timers.popupClose = setTimeout(() => { popup.classList.remove('active'); }, 5000);
    }, 3000);
}

function stopPopupSequence() {
    clearTimeout(timers.popupSearch); clearTimeout(timers.popupResult); clearTimeout(timers.popupClose);
    const popup = document.getElementById('songPopup'); if(popup) popup.classList.remove('active');
}

function updateMediaSessionMetadata() {
    if ('mediaSession' in navigator) {
        const artUrl = new URL('assets/profil.webp', window.location.href).href;
        navigator.mediaSession.metadata = new MediaMetadata({ 
            title: CONFIG.stations[state.currentStation].name, 
            artist: "Yusuf Ali Blog", 
            album: "Canlı Yayın", 
            artwork: [{ src: artUrl, sizes: '512x512', type: 'image/webp' }] 
        });
    }
}