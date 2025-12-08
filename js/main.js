import { state, timers, setAudioContext } from './state.js';
import { CONFIG } from './config.js';
import { initRadio, togglePlay, playRadio, triggerChangeStation, setupVolumeControl, toggleMute, setupAudioContext } from './radio.js';
import { initWeather, enableSearchMode, disableSearchMode } from './weather.js';
import * as UI from './ui.js';

export let isElectron = false;
export let ipcRenderer = null;

// GÜVENLİK GÜNCELLEMESİ: Context Isolation uyumlu kontrol
if (window.ipcRenderer) {
    ipcRenderer = window.ipcRenderer;
    isElectron = true;
} else {
    isElectron = false;
}

// -------------------------------------------------------------------------
// UYGULAMA BAŞLATMA MANTIĞI
// -------------------------------------------------------------------------

function startExperience() {
    // iOS için ses kilidini açma
    if (UI.getOS() === 'iOS') {
        document.body.addEventListener('touchstart', setupAudioContext, { once: true });
    } else {
        setupAudioContext();
    }

    const overlay = document.getElementById("overlay");
    if(overlay) overlay.classList.add('slide-down-active');
    
    document.getElementById("mainCard").style.opacity = "1";
    document.getElementById("mainCard").style.transform = "translateY(0) scale(1.12)";
    document.getElementById("footerText").classList.add('copyright-visible');
    document.getElementById("weatherWidget").classList.add('visible');

    UI.createDynamicElements();
    initRadio();
    setupInteractions(); 
    UI.initOnlineCounter();

    // RADYO BAŞLATMA (togglePlay yerine playRadio kullanarak takılmayı önledik)
    setTimeout(() => { playRadio(); }, 100);
    
    setTimeout(() => {
        UI.initClock();
        initWeather();
        UI.initSnow();
        setupVolumeControl();
        UI.initPageIndicators();
    }, 100);
    
    setTimeout(() => { if(overlay) overlay.style.display = 'none'; }, 1500);
}

// -------------------------------------------------------------------------
// OLAY DİNLEYİCİLERİ (Event Listeners)
// -------------------------------------------------------------------------

function setupEventListeners() {
    // 1. Overlay (Başlat)
    document.getElementById('overlay')?.addEventListener('click', startExperience);

    // 2. Radyo Kontrolleri
    document.getElementById('playBtn')?.addEventListener('click', togglePlay);
    document.getElementById('btnPrevStation')?.addEventListener('click', () => triggerChangeStation(-1));
    document.getElementById('btnNextStation')?.addEventListener('click', () => triggerChangeStation(1));
    document.getElementById('btnVolMute')?.addEventListener('click', toggleMute);

    // 3. Fotoğraf Navigasyon
    document.getElementById('navLeft')?.addEventListener('click', UI.prevPhoto);
    document.getElementById('navRight')?.addEventListener('click', UI.nextPhoto);

    // 4. Hava Durumu
    document.getElementById('btnCityChange')?.addEventListener('click', enableSearchMode);
    document.getElementById('btnCityCancel')?.addEventListener('click', disableSearchMode);

    // 5. Modal ve İndirme
    document.getElementById('btnModalClose')?.addEventListener('click', () => UI.toggleDownloadModal());
    document.querySelector('.modal-overlay')?.addEventListener('click', UI.closeDownloadModal);
    document.getElementById('linux-main-btn')?.addEventListener('click', UI.showLinuxOptions);
    document.getElementById('btnLinuxBack')?.addEventListener('click', UI.showMainOptions);
    
    // 6. Bağlantı Hatası
    document.getElementById('btnRetryConnection')?.addEventListener('click', () => checkConnection(true));
}

function setupInteractions() {
    // 1. Profil Resmi Tıklama
    const profileImg = document.getElementById("profileImg");
    if(profileImg) {
        profileImg.style.cursor = "pointer";
        profileImg.addEventListener('click', (e) => {
            e.stopPropagation();
            if(state.stage === 1 && !isElectron) { state.stage = 0; UI.changeStage(); }
        });
    }

    // 2. Hava Durumu Genişletme
    const wWidget = document.getElementById("weatherWidget");
    if(wWidget) {
        wWidget.addEventListener('click', (e) => {
            if(wWidget.classList.contains('search-mode')) return;
            if(state.stage === 4) return;
            state.stage = 4; UI.changeStage(); e.stopPropagation();
        });
    }

    // 3. Radyo Player Genişletme
    const rPlayer = document.getElementById("playerBox");
    if(rPlayer) {
        rPlayer.addEventListener('click', (e) => {
            if(e.target.closest('button') || e.target.closest('input')) return;
            if(state.stage === 3) return;
            state.stage = 3; UI.changeStage(); e.stopPropagation();
        });
    }

    // 4. Boşluğa Tıklama (Geri Dön)
    document.addEventListener('click', (e) => {
        if(state.stage === 3 || state.stage === 4) {
            const insideRadio = e.target.closest('.radio-player');
            const insideWeather = e.target.closest('.weather-widget');
            if(state.stage === 3 && !insideRadio && !isElectron) UI.goDefaultPage();
            if(state.stage === 4 && !insideWeather) UI.goDefaultPage();
        }
        if(state.stage === 0) {
            const insideCard = e.target.closest('.card');
            if(!insideCard) UI.goDefaultPage();
        }
    });

    // 5. Scroll (Tekerlek) Kontrolü
    window.addEventListener('wheel', (e) => {
        if(state.isScrolling) return;
        if (isElectron) {
            if(e.deltaY > 0) { 
                if(state.stage === 1) { state.stage = 3; UI.changeStage(); UI.lockScroll(); } 
                else if(state.stage === 3) { state.stage = 4; UI.changeStage(); UI.lockScroll(); } 
            } else { 
                if(state.stage === 4) { state.stage = 3; UI.changeStage(); UI.lockScroll(); } 
                else if(state.stage === 3) { state.stage = 1; UI.changeStage(); UI.lockScroll(); } 
            }
        } else {
            if(e.deltaY > 0) { 
                if(state.stage < 4) { state.stage++; UI.changeStage(); UI.lockScroll(); } 
                else { UI.triggerBump('bump-up'); UI.lockScroll(400); }
            } else { 
                if(state.stage > 0) { state.stage--; UI.changeStage(); UI.lockScroll(); } 
                else { UI.triggerBump('bump-down'); UI.lockScroll(400); }
            }
        }
    });

    // 6. Dokunmatik (Touch) Kontrolü
    let touchStartY = 0;
    document.addEventListener('touchstart', (e) => { touchStartY = e.changedTouches[0].screenY; }, {passive: false});
    document.addEventListener('touchend', (e) => {
        if(state.isScrolling) return;
        const diff = touchStartY - e.changedTouches[0].screenY;
        if(Math.abs(diff) > 50) {
            if(isElectron) {
                if(diff > 0) {
                    if(state.stage === 1) { state.stage = 3; UI.changeStage(); UI.lockScroll(); }
                    else if(state.stage === 3) { state.stage = 4; UI.changeStage(); UI.lockScroll(); }
                } else {
                    if(state.stage === 4) { state.stage = 3; UI.changeStage(); UI.lockScroll(); }
                    else if(state.stage === 3) { state.stage = 1; UI.changeStage(); UI.lockScroll(); }
                }
            } else {
                if(diff > 0) { 
                    if(state.stage < 4) { state.stage++; UI.changeStage(); UI.lockScroll(); } 
                    else { UI.triggerBump('bump-up'); UI.lockScroll(400); } 
                } else { 
                    if(state.stage > 0) { state.stage--; UI.changeStage(); UI.lockScroll(); } 
                    else { UI.triggerBump('bump-down'); UI.lockScroll(400); } 
                }
            }
        }
    }, {passive: false});
}

// -------------------------------------------------------------------------
// BAĞLANTI KONTROLÜ VE İNDİRME LİNKLERİ
// -------------------------------------------------------------------------

const offlineOverlay = document.getElementById('offline-overlay');

function updateOnlineStatus(isOnline) {
    if (isOnline) {
        if(offlineOverlay && offlineOverlay.classList.contains('active')) {
            offlineOverlay.classList.remove('active');
            console.log("İnternet bağlantısı sağlandı.");
        }
    } else {
        if(offlineOverlay) offlineOverlay.classList.add('active');
        console.log("İnternet bağlantısı koptu.");
    }
}

window.addEventListener('online', () => checkConnection(true));
window.addEventListener('offline', () => updateOnlineStatus(false));

async function checkConnection(manual = false) {
    if (!navigator.onLine) { updateOnlineStatus(false); return; }
    try {
        const checkUrl = isElectron 
            ? 'https://yusufaliyaylaci.github.io/assets/icon.ico?' + new Date().getTime() 
            : 'assets/icon.ico?' + new Date().getTime();

        const resp = await fetch(checkUrl, { method: 'HEAD', cache: 'no-store' });
        if (resp.ok || (isElectron && resp.type === 'opaque')) { 
            updateOnlineStatus(true); 
        } else { 
            updateOnlineStatus(false); 
        }
    } catch (e) { 
        updateOnlineStatus(false); 
    }
    
    if(manual) { 
        const btn = document.querySelector('.retry-btn'); 
        if(btn) {
            const oldText = btn.innerText; 
            btn.innerText = "Kontrol ediliyor..."; 
            setTimeout(() => btn.innerText = oldText, 1000); 
        }
    }
}

async function updateDownloadButton() {
    const user = "yusufaliyaylaci"; 
    const repo = "yusufaliyaylaci.github.io"; 
    const winBtn = document.getElementById('modal-win-btn');
    const winVerTag = document.getElementById('win-ver-tag');
    const debBtn = document.getElementById('modal-deb-btn');
    const debVerTag = document.getElementById('deb-ver-tag');
    const rpmBtn = document.getElementById('modal-rpm-btn');
    const rpmVerTag = document.getElementById('rpm-ver-tag');
    const archBtn = document.getElementById('modal-arch-btn');
    const archVerTag = document.getElementById('arch-ver-tag');

    if (!winBtn) return;
    const fallbackUrl = `https://github.com/${user}/${repo}/releases/latest`;

    try {
        const response = await fetch(`https://api.github.com/repos/${user}/${repo}/releases/latest`);
        if (!response.ok) throw new Error("API Hatası");
        const data = await response.json();
        const versionLabel = data.tag_name.startsWith('v') ? data.tag_name : 'v' + data.tag_name;

        const exeAsset = data.assets.find(asset => asset.name.endsWith('.exe'));
        if (exeAsset && winBtn) {
            winBtn.href = exeAsset.browser_download_url;
            if(winVerTag) winVerTag.innerText = versionLabel;
        } else if(winBtn) { winBtn.href = fallbackUrl; }

        const debAsset = data.assets.find(asset => asset.name.endsWith('.deb'));
        if (debAsset && debBtn) {
            debBtn.href = debAsset.browser_download_url;
            if(debVerTag) debVerTag.innerText = versionLabel;
        } else if(debBtn) { debBtn.href = fallbackUrl; if(debVerTag) debVerTag.innerText = "Bulunamadı"; debBtn.classList.add("disabled"); }

        const rpmAsset = data.assets.find(asset => asset.name.endsWith('.rpm'));
        if (rpmAsset && rpmBtn) {
            rpmBtn.href = rpmAsset.browser_download_url;
            if(rpmVerTag) rpmVerTag.innerText = versionLabel;
        } else if(rpmBtn) { rpmBtn.href = fallbackUrl; if(rpmVerTag) rpmVerTag.innerText = "Bulunamadı"; rpmBtn.classList.add("disabled"); }

        const archAsset = data.assets.find(asset => asset.name.endsWith('.pacman') || asset.name.endsWith('.pkg.tar.zst'));
        if (archAsset && archBtn) {
            archBtn.href = archAsset.browser_download_url;
            if(archVerTag) archVerTag.innerText = versionLabel;
        } else if(archBtn) { archBtn.href = fallbackUrl; if(archVerTag) archVerTag.innerText = "Bulunamadı"; archBtn.classList.add("disabled"); }

    } catch (error) {
        if(winBtn) winBtn.href = fallbackUrl;
    }
}

// -------------------------------------------------------------------------
// BAŞLATMA (Initialization - Race Condition Fix)
// -------------------------------------------------------------------------

function initApp() {
    setupEventListeners(); 
    checkConnection();
    updateDownloadButton();
}

// Sayfa zaten yüklendiyse bekleme, direkt başlat
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Periyodik bağlantı kontrolü
setInterval(() => { 
    if (offlineOverlay && !offlineOverlay.classList.contains('active')) { 
        checkConnection(); 
    } 
}, 30000);

// Service Worker Başlatma
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js'); });
}