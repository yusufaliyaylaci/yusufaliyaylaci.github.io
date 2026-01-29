import { state, timers, setAudioContext } from './state.js';
import { CONFIG, APP_VERSION } from './config.js';
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

// Capacitor Native Kontrolü
if (window.Capacitor && window.Capacitor.isNativePlatform) {
    isNative = window.Capacitor.isNativePlatform();
}

function startExperience() {
    // 1. APPLE CİHAZ DÜZELTMESİ
    if (UI.getOS() === 'iOS' || UI.getOS() === 'Mac OS') {
        const audio1 = document.getElementById("bgMusic1");
        const audio2 = document.getElementById("bgMusic2");

        if(audio1) audio1.removeAttribute("crossorigin");
        if(audio2) audio2.removeAttribute("crossorigin");
    }

    // 2. SES MOTORUNU BAŞLATMA
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

    // 5. GÜNCELLEME SİSTEMLERİNİ TETİKLEME
    if(isElectron) {
        UI.initUpdateHandler();
    }
    if(isNative) {
        setTimeout(checkForUpdates, 3000);
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
    
    // İndirme Modalı İşlemleri
    const downloadBtn = document.querySelector('.download-btn-container'); // Ana ekrandaki indirme butonu
    const closeBtn = document.getElementById('btnModalClose');
    const modalOverlay = document.querySelector('.modal-overlay');

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            UI.toggleDownloadModal();
            // Modal açıldığında Android butonunu parlat
            triggerAndroidShine();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            UI.toggleDownloadModal();
        });
    }
    if (modalOverlay) {
        modalOverlay.addEventListener('click', UI.closeDownloadModal);
    }

    // Linux Toggle Butonu
    const btnToggleLinux = document.getElementById('btn-toggle-linux');
    const linuxOptionsPanel = document.getElementById('linux-options-panel');
    if(btnToggleLinux && linuxOptionsPanel) {
        btnToggleLinux.addEventListener('click', () => {
            const isHidden = linuxOptionsPanel.style.display === 'none';
            linuxOptionsPanel.style.display = isHidden ? 'flex' : 'none';
            btnToggleLinux.innerHTML = isHidden 
                ? '<i class="fas fa-chevron-up"></i> Linux Seçeneklerini Gizle' 
                : '<i class="fas fa-linux"></i> Diğer Linux Seçenekleri';
        });
    }

    document.getElementById('btnRetryConnection')?.addEventListener('click', () => checkConnection(true));
}

// Android Butonu Parlatma Efekti
let shineTimeout;
function triggerAndroidShine() {
    const androidBtn = document.getElementById('btn-download-android');
    if (!androidBtn || androidBtn.classList.contains('disabled')) return;

    // Varsa eski animasyonu durdur
    clearTimeout(shineTimeout);
    androidBtn.classList.remove('animate-shine');

    // Biraz bekleyip başlat (modal açılış efektiyle karışmasın)
    setTimeout(() => {
        androidBtn.classList.add('animate-shine');
        // 3 saniye sonra durdur
        shineTimeout = setTimeout(() => {
            androidBtn.classList.remove('animate-shine');
        }, 3500);
    }, 300);
}


function setupInteractions() {
    // ... (Bu kısım aynı kalacak, önceki koddan kopyalayabilirsiniz veya bu tam kodu kullanın) ...
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

    window.addEventListener('wheel', (e) => {
        if(state.isScrolling) return;
        if (isElectron || isNative) {
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

    let touchStartY = 0;
    document.addEventListener('touchstart', (e) => { touchStartY = e.changedTouches[0].screenY; }, {passive: false});
    document.addEventListener('touchend', (e) => {
        if(state.isScrolling) return;
        const diff = touchStartY - e.changedTouches[0].screenY;
        if(Math.abs(diff) > 50) {
            if(isElectron || isNative) {
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

const offlineOverlay = document.getElementById('offline-overlay');

function updateOnlineStatus(isOnline) {
    if (isOnline) {
        if(offlineOverlay && offlineOverlay.classList.contains('active')) {
            offlineOverlay.classList.remove('active');
        }
    } else {
        if(offlineOverlay) offlineOverlay.classList.add('active');
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

// ----------------------------------------------------
// DİNAMİK İNDİRME BUTONLARI (TÜM PLATFORMLAR)
// ----------------------------------------------------
async function updateDownloadButtons() {
    const user = "yusufaliyaylaci"; 
    const repo = "yusufaliyaylaci.github.io";
    const fallbackUrl = `https://github.com/${user}/${repo}/releases/latest`;

    // Buton Elementleri
    const winBtn = document.getElementById('btn-download-win');
    const winVerTag = document.getElementById('win-ver-tag');
    const androidBtn = document.getElementById('btn-download-android');
    const androidVerTag = document.getElementById('android-ver-tag');
    const debBtn = document.getElementById('btn-download-deb');
    const rpmBtn = document.getElementById('btn-download-rpm');
    const pacmanBtn = document.getElementById('btn-download-pacman');

    try {
        const response = await fetch(`https://api.github.com/repos/${user}/${repo}/releases/latest`);
        if (!response.ok) throw new Error("API Hatası");
        const data = await response.json();
        const versionLabel = data.tag_name.startsWith('v') ? data.tag_name : 'v' + data.tag_name;

        // Helper: Varlık (Asset) bulma fonksiyonu
        const findAsset = (ext) => data.assets.find(asset => asset.name.endsWith(ext));

        // Windows EXE
        const exeAsset = findAsset('.exe');
        if (exeAsset && winBtn) {
            winBtn.href = exeAsset.browser_download_url;
            if(winVerTag) winVerTag.innerText = versionLabel;
        } else if(winBtn) { winBtn.href = fallbackUrl; }

        // Android APK
        const apkAsset = findAsset('.apk');
        if (apkAsset && androidBtn) {
            androidBtn.href = apkAsset.browser_download_url;
            androidBtn.classList.remove('disabled');
            if(androidVerTag) androidVerTag.innerText = versionLabel;
            // APK bulunduğunda parlama efekti için hazır hale getir
            androidBtn.classList.add('shiny-btn');
        } else if(androidBtn) {
            androidBtn.href = fallbackUrl;
        }

        // Linux Distroları
        const debAsset = findAsset('.deb');
        if(debAsset && debBtn) debBtn.href = debAsset.browser_download_url;

        const rpmAsset = findAsset('.rpm');
        if(rpmAsset && rpmBtn) rpmBtn.href = rpmAsset.browser_download_url;

        const pacmanAsset = findAsset('.pacman');
        if(pacmanAsset && pacmanBtn) pacmanBtn.href = pacmanAsset.browser_download_url;

    } catch (error) {
        console.error("İndirme linkleri alınamadı:", error);
        // Hata durumunda hepsi releases sayfasına gitsin
        [winBtn, androidBtn, debBtn, rpmBtn, pacmanBtn].forEach(btn => {
            if(btn) btn.href = fallbackUrl;
        });
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
    // İndirme butonlarını güncelle (Sadece web ve native'de)
    if(!isElectron) {
        updateDownloadButtons();
    }
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
// ... (Bu kısım aynı kalacak) ...
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
    if (!isNative) return;
    // ... (Aynı kodlar) ...
    // Kodu kısaltmak için burayı tekrarlamıyorum, önceki cevaptaki checkForUpdates ve showUpdateModal fonksiyonları burada olacak.
    // Eğer elinizde yoksa söyleyin tekrar atayım.
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

// ----------------------------------------------------
// WEB SİTESİ OTO-YENİLEME SİSTEMİ
// ----------------------------------------------------
async function checkWebVersion() {
    if (isNative || isElectron) return;
    const checkUrl = 'version.json?t=' + new Date().getTime();
    try {
        const response = await fetch(checkUrl);
        if (!response.ok) return;
        const data = await response.json();
        const remoteVersion = data.version;
        if (remoteVersion !== APP_VERSION) {
            console.log("Sayfa yenileniyor...");
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for(let registration of registrations) { registration.unregister(); }
                    window.location.reload(true);
                });
            } else {
                window.location.reload(true);
            }
        }
    } catch (e) { console.log("Versiyon kontrolü yapılamadı (Web):", e); }
}
setTimeout(checkWebVersion, 1000);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkWebVersion();
});