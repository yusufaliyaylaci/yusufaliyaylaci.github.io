import { state, timers, setAudioContext } from './state.js';
import { CONFIG, APP_VERSION } from './config.js'; // APP_VERSION buraya eklendi
import { initRadio, togglePlay, playRadio, triggerChangeStation, setupVolumeControl, toggleMute, setupAudioContext } from './radio.js';
import { initWeather, enableSearchMode, disableSearchMode } from './weather.js';
import * as UI from './ui.js';

export let isElectron = false;
export let isNative = false; // Android/iOS tespiti
export let ipcRenderer = null;

// Platform Kontrolleri
if (window.ipcRenderer) {
    ipcRenderer = window.ipcRenderer;
    isElectron = true;
} else {
    isElectron = false;
}

// Capacitor Native Kontrolü (Web sitesini bozmadan)
if (window.Capacitor && window.Capacitor.isNativePlatform) {
    isNative = window.Capacitor.isNativePlatform();
}

function startExperience() {
    // 1. APPLE CİHAZ DÜZELTMESİ (CORS Hatasını Önler)
    if (UI.getOS() === 'iOS' || UI.getOS() === 'Mac OS') {
        const audio1 = document.getElementById("bgMusic1");
        const audio2 = document.getElementById("bgMusic2");

        if(audio1) audio1.removeAttribute("crossorigin");
        if(audio2) audio2.removeAttribute("crossorigin");

        console.log("Apple cihazı için CORS modu kapatıldı.");
    }

    // 2. SES MOTORUNU BAŞLATMA
    // iOS'ta ses motoru sadece dokunma ile başlar.
    if (UI.getOS() === 'iOS') { 
        document.body.addEventListener('touchstart', setupAudioContext, { once: true }); 
    } else { 
        setupAudioContext();
    }

    // 3. ARAYÜZ BAŞLATMA
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

    // 4. OTOMATİK OYNATMA MANTIĞI
    const urlParams = new URLSearchParams(window.location.search);
    const isJoinAction = urlParams.get('action') === 'join';

    if (isElectron || isNative) {
        // App modunda hemen başla
        setTimeout(() => { playRadio(); }, 100);
        setTimeout(() => { UI.triggerRadioCard(); }, 2000);
    } else {
        if (!isJoinAction) {
            setTimeout(() => { playRadio(); }, 100);
        }
    }
    
    setTimeout(() => {
        UI.initClock();
        initWeather();
        UI.initSnow();
        setupVolumeControl();
        UI.initPageIndicators();
    }, 100);
    
    setTimeout(() => { if(overlay) overlay.style.display = 'none'; }, 1500);

    // Native App ise güncelleme kontrolü yapmaya gerek yok (Store halleder) veya farklı bir yöntem gerekir.
    if(isElectron) {
        UI.initUpdateHandler();
    }
}

function setupEventListeners() {
    document.getElementById('overlay')?.addEventListener('click', startExperience);
    document.getElementById('playBtn')?.addEventListener('click', togglePlay);
    document.getElementById('btnPrevStation')?.addEventListener('click', () => triggerChangeStation(-1));
    document.getElementById('btnNextStation')?.addEventListener('click', () => triggerChangeStation(1));
    document.getElementById('btnVolMute')?.addEventListener('click', toggleMute);
    document.getElementById('navLeft')?.addEventListener('click', UI.prevPhoto);
    document.getElementById('navRight')?.addEventListener('click', UI.nextPhoto);
    document.getElementById('btnCityChange')?.addEventListener('click', enableSearchMode);
    document.getElementById('btnCityCancel')?.addEventListener('click', disableSearchMode);
    
    const closeBtn = document.getElementById('btnModalClose');
    if (closeBtn) {
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        newCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            UI.toggleDownloadModal();
        });
    }

    document.querySelector('.modal-overlay')?.addEventListener('click', UI.closeDownloadModal);
    document.getElementById('linux-main-btn')?.addEventListener('click', UI.showLinuxOptions);
    document.getElementById('btnLinuxBack')?.addEventListener('click', UI.showMainOptions);
    document.getElementById('btnRetryConnection')?.addEventListener('click', () => checkConnection(true));
}

function setupInteractions() {
    const profileImg = document.getElementById("profileImg");
    if(profileImg) {
        profileImg.style.cursor = "pointer";
        profileImg.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            if(state.stage === 1 && !isElectron && !isNative) { state.stage = 0; UI.changeStage(); } 
        });
    }

    const wWidget = document.getElementById("weatherWidget");
    if(wWidget) {
        wWidget.addEventListener('click', (e) => {
            if(wWidget.classList.contains('search-mode')) return;
            if(state.stage === 4) return;
            state.stage = 4; UI.changeStage(); e.stopPropagation();
        });
    }

    const rPlayer = document.getElementById("playerBox");
    if(rPlayer) {
        rPlayer.addEventListener('click', (e) => {
            if(e.target.closest('button') || e.target.closest('input')) return;
            if(state.stage === 3) return;
            state.stage = 3; UI.changeStage(); e.stopPropagation();
        });
    }

    document.addEventListener('click', (e) => {
        if(state.stage === 3 || state.stage === 4) {
            const insideRadio = e.target.closest('.radio-player');
            const insideWeather = e.target.closest('.weather-widget');
            if(state.stage === 3 && !insideRadio && !isElectron && !isNative) UI.goDefaultPage();
            if(state.stage === 4 && !insideWeather) UI.goDefaultPage();
        }
        if(state.stage === 0) { 
            const insideCard = e.target.closest('.card'); 
            if(!insideCard) UI.goDefaultPage(); 
        }
    });

    // Masaüstü ve Web Scroll
    window.addEventListener('wheel', (e) => {
        if(state.isScrolling) return;
        if (isElectron || isNative) {
            // App modunda sayfalar arası geçiş
            if(e.deltaY > 0) { 
                if(state.stage === 1) { state.stage = 3; UI.changeStage(); UI.lockScroll(); } 
                else if(state.stage === 3) { state.stage = 4; UI.changeStage(); UI.lockScroll(); } 
            } else { 
                if(state.stage === 4) { state.stage = 3; UI.changeStage(); UI.lockScroll(); } 
                else if(state.stage === 3) { state.stage = 1; UI.changeStage(); UI.lockScroll(); } 
            }
        } else {
            // Web modunda kart efektleri
            if(e.deltaY > 0) { 
                if(state.stage < 4) { state.stage++; UI.changeStage(); UI.lockScroll(); } 
                else { UI.triggerBump('bump-up'); UI.lockScroll(400); }
            } else { 
                if(state.stage > 0) { state.stage--; UI.changeStage(); UI.lockScroll(); } 
                else { UI.triggerBump('bump-down'); UI.lockScroll(400); }
            }
        }
    });

    // Mobil Dokunmatik (Swipe)
    let touchStartY = 0;
    document.addEventListener('touchstart', (e) => { touchStartY = e.changedTouches[0].screenY; }, {passive: false});
    document.addEventListener('touchend', (e) => {
        if(state.isScrolling) return;
        const diff = touchStartY - e.changedTouches[0].screenY;
        if(Math.abs(diff) > 50) {
            if(isElectron || isNative) {
                // App Modu Swipe
                if(diff > 0) { 
                    if(state.stage === 1) { state.stage = 3; UI.changeStage(); UI.lockScroll(); } 
                    else if(state.stage === 3) { state.stage = 4; UI.changeStage(); UI.lockScroll(); } 
                } else { 
                    if(state.stage === 4) { state.stage = 3; UI.changeStage(); UI.lockScroll(); } 
                    else if(state.stage === 3) { state.stage = 1; UI.changeStage(); UI.lockScroll(); } 
                }
            } else {
                // Web Modu Swipe
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
        const checkUrl = (isElectron || isNative)
            ? 'https://yusufaliyaylaci.com/assets/icon.ico?' + new Date().getTime() 
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
    const androidBtn = document.getElementById('modal-android-btn');
    const androidVerTag = document.getElementById('android-ver-tag');

    if (!winBtn && !androidBtn) return;
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

        const apkAsset = data.assets.find(asset => asset.name.endsWith('.apk'));
        if (apkAsset && androidBtn) {
            androidBtn.href = apkAsset.browser_download_url;
            androidBtn.classList.remove('disabled'); 
            if(androidVerTag) androidVerTag.innerText = versionLabel + " (APK)";
        }

    } catch (error) {
        if(winBtn) winBtn.href = fallbackUrl;
        if(androidBtn) androidBtn.href = fallbackUrl;
    }
}

if (isElectron && ipcRenderer) {
    ipcRenderer.on('app-mode-listener', () => { activateListenerMode(); });
}

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('action') === 'join') {
    if (!isElectron && !isNative) {
        window.location.href = "yaliapp://join"; 
    } else {
        activateListenerMode();
    }
}

function activateListenerMode() {
    document.body.classList.add('listener-mode');
    state.isListenerMode = true;
    if(isElectron && ipcRenderer) {
        ipcRenderer.send('update-discord-activity', { 
            details: CONFIG.stations[state.currentStation].name, 
            state: "Yusuf Ali ile Birlikte 🎧" 
        });
    }
    const statusText = document.getElementById('statusText');
    if(statusText) statusText.innerText = "Birlikte Dinleniyor";
    if(state && !state.isPlaying) {
        setTimeout(() => {
            const playBtn = document.getElementById('playBtn');
            if(playBtn) playBtn.click();
        }, 500);
    }
}

function initApp() {
    setupEventListeners(); 
    checkConnection();
    updateDownloadButton();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

setInterval(() => { if (offlineOverlay && !offlineOverlay.classList.contains('active')) { checkConnection(); } }, 30000);
if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js'); }); }


// ----------------------------------------------------
// ANDROID GÜNCELLEME KONTROLÜ
// ----------------------------------------------------

function compareVersions(v1, v2) {
    const clean = v => v.replace('v', '').split('.').map(Number);
    const [a, b] = [clean(v1), clean(v2)];
    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return 1;
        if (a[i] < b[i]) return -1;
    }
    return 0;
}

async function checkForUpdates() {
    // 1. KONTROL: Eğer Native (Android/iOS) değilse DUR.
    if (!isNative) return;

    console.log(`Android Sürüm Kontrolü: ${APP_VERSION}`);
    const user = "yusufaliyaylaci"; 
    const repo = "yusufaliyaylaci.github.io"; 
    
    try {
        const response = await fetch(`https://api.github.com/repos/${user}/${repo}/releases/latest`);
        if (!response.ok) return;
        
        const data = await response.json();
        const latestVer = data.tag_name; 
        
        if (compareVersions(latestVer, APP_VERSION) > 0) {
            console.log(`Yeni güncelleme bulundu: ${latestVer}`);
            showUpdateModal(latestVer, data.body, data.assets);
        }
    } catch (e) {
        console.log("Güncelleme kontrolü yapılamadı:", e);
    }
}

function showUpdateModal(version, notes, assets) {
    if (document.getElementById('new-update-modal')) return;

    const apkAsset = assets.find(a => a.name.endsWith('.apk'));
    const downloadUrl = apkAsset ? apkAsset.browser_download_url : `https://github.com/yusufaliyaylaci/yusufaliyaylaci.github.io/releases/latest`;

    const modalHTML = `
    <div id="new-update-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(5px);">
        <div style="background:#1e1e1e; padding:25px; border-radius:15px; width:90%; max-width:400px; border:1px solid #333; box-shadow:0 10px 40px rgba(0,0,0,0.5); text-align:center; animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
            <div style="font-size:3rem; margin-bottom:15px;">🚀</div>
            <h2 style="color:#fff; margin:0 0 10px 0; font-family:'Poppins',sans-serif;">Yeni Sürüm Mevcut!</h2>
            <p style="color:#aaa; margin-bottom:20px; font-size:0.9rem;">YaliApp <strong>${version}</strong> sürümü yayınlandı.</p>
            
            <div style="background:#252525; padding:10px; border-radius:8px; margin-bottom:20px; text-align:left; max-height:100px; overflow-y:auto; font-size:0.8rem; color:#ccc;">
                ${notes || 'Hata düzeltmeleri ve performans iyileştirmeleri.'}
            </div>

            <a href="${downloadUrl}" target="_blank" style="display:block; width:100%; padding:12px; background:#4caf50; color:white; text-decoration:none; border-radius:8px; font-weight:bold; margin-bottom:10px; transition:0.2s;">
                <i class="fas fa-download"></i> Güncellemeyi İndir
            </a>
            <div id="btnSkipUpdate" style="cursor:pointer; color:#666; font-size:0.8rem; margin-top:10px;">Daha Sonra Hatırlat</div>
        </div>
    </div>
    <style>@keyframes popIn { from{transform:scale(0.8);opacity:0;} to{transform:scale(1);opacity:1;} }</style>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHTML;
    document.body.appendChild(div);

    document.getElementById('btnSkipUpdate').addEventListener('click', () => {
        document.getElementById('new-update-modal').remove();
    });
}

// Uygulama açıldıktan 3 saniye sonra kontrol et
setTimeout(checkForUpdates, 3000);