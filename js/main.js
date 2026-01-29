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
    // Temel Eventler
    document.getElementById('overlay')?.addEventListener('click', startExperience);
    document.getElementById('playBtn')?.addEventListener('click', togglePlay);
    document.getElementById('btnPrevStation')?.addEventListener('click', () => triggerChangeStation(-1));
    document.getElementById('btnNextStation')?.addEventListener('click', () => triggerChangeStation(1));
    document.getElementById('btnVolMute')?.addEventListener('click', toggleMute);
    document.getElementById('navLeft')?.addEventListener('click', UI.prevPhoto);
    document.getElementById('navRight')?.addEventListener('click', UI.nextPhoto);
    document.getElementById('btnCityChange')?.addEventListener('click', enableSearchMode);
    document.getElementById('btnCityCancel')?.addEventListener('click', disableSearchMode);
    document.getElementById('btnRetryConnection')?.addEventListener('click', () => checkConnection(true));

    // --- İNDİRME MODALI VE LINUX GEÇİŞLERİ (DÜZELTİLMİŞ) ---
    
    // Element Tanımları
    const modalOverlay = document.querySelector('.modal-overlay');
    const closeBtn = document.getElementById('btnModalClose');
    const downloadBtn = document.querySelector('.download-btn-container'); // Varsa ana sayfadaki buton
    
    // Panel Elementleri
    const btnLinux = document.getElementById('linux-main-btn');
    const btnLinuxBack = document.getElementById('btnLinuxBack');
    const gridMain = document.getElementById('main-platform-grid');
    const gridLinux = document.getElementById('linux-platform-grid');

    // 1. Modalı Açma (Ana Sayfadan)
    if (downloadBtn) {
        downloadBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            if(UI.toggleDownloadModal) UI.toggleDownloadModal();
            else if(modalOverlay) modalOverlay.classList.add('open'); // Fallback
            
            // Her açılışta ana menüyü göster, Linux'u gizle
            if(gridMain) gridMain.style.display = 'grid';
            if(gridLinux) gridLinux.style.display = 'none';
            
            triggerAndroidShine();
        });
    }

    // 2. Modalı Kapatma (X Butonu)
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            // Doğrudan sınıfı kaldırarak kapatmayı garantiye alalım
            if(modalOverlay) modalOverlay.classList.remove('open'); 
        });
    }

    // 3. Modalı Kapatma (Boşluğa Tıklama)
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.classList.remove('open');
            }
        });
    }

    // 4. Linux Menüsüne Geçiş (İleri)
    if (btnLinux && gridMain && gridLinux) {
        btnLinux.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            // Efektli geçiş
            gridMain.style.display = 'none';
            gridLinux.style.display = 'grid'; // Grid yapısını koru
            
            // Animasyon tetiklemek için ufak bir hack
            gridLinux.classList.remove('fade-in');
            void gridLinux.offsetWidth; // Reflow
            gridLinux.classList.add('fade-in');
        });
    }

    // 5. Ana Menüye Dönüş (Geri)
    if (btnLinuxBack && gridMain && gridLinux) {
        btnLinuxBack.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            // Efektli geçiş
            gridLinux.style.display = 'none';
            gridMain.style.display = 'grid';
            
            gridMain.classList.remove('fade-in');
            void gridMain.offsetWidth; // Reflow
            gridMain.classList.add('fade-in');
        });
    }
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
// DİNAMİK İNDİRME BUTONLARI VE VERSİYON KONTROLÜ
// ----------------------------------------------------
async function updateDownloadButtons() {
    // Repo Ayarları
    const GITHUB_USER = "yusufaliyaylaci";
    const GITHUB_REPO = "yusufaliyaylaci.github.io";
    const API_URL = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/releases/latest`;
    const FALLBACK_URL = `https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases/latest`;

    // UI Elementleri (ID'ler index.html ile eşleşmeli)
    const ui = {
        win: { btn: document.getElementById('modal-win-btn'), tag: document.getElementById('win-ver-tag') },
        android: { btn: document.getElementById('modal-android-btn'), tag: document.getElementById('android-ver-tag'), mainBtn: document.getElementById('btn-download-android') },
        deb: { btn: document.getElementById('modal-deb-btn'), tag: document.getElementById('deb-ver-tag') },
        rpm: { btn: document.getElementById('modal-rpm-btn'), tag: document.getElementById('rpm-ver-tag') },
        arch: { btn: document.getElementById('modal-arch-btn'), tag: document.getElementById('arch-ver-tag') }
    };

    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`API Hatası: ${response.status}`);
        
        const data = await response.json();
        const version = data.tag_name; // Örn: "v2.2.2"
        const assets = data.assets || [];

        // Yardımcı: Uzantıya göre asset URL bul (Case-insensitive)
        const findLink = (ext) => {
            const asset = assets.find(a => a.name.toLowerCase().endsWith(ext.toLowerCase()));
            return asset ? asset.browser_download_url : null;
        };

        // Yardımcı: Buton güncelleme
        const updateBtn = (target, url, verText, enable = true) => {
            if (!target.btn) return;
            target.btn.href = url;
            if (target.tag) target.tag.innerText = verText;
            
            if (enable) {
                target.btn.classList.remove('disabled');
                target.btn.classList.add('active');
            } else {
                target.btn.href = FALLBACK_URL; 
                if (target.tag) target.tag.innerText = "Manuel İndir";
            }
        };

        // 1. Windows (.exe)
        const winUrl = findLink('.exe');
        updateBtn(ui.win, winUrl || FALLBACK_URL, winUrl ? version : "Github'a Git", !!winUrl);

        // 2. Android (.apk)
        const apkUrl = findLink('.apk');
        updateBtn(ui.android, apkUrl || FALLBACK_URL, apkUrl ? version : "Yakında", !!apkUrl);
        
        if (ui.android.mainBtn) {
            ui.android.mainBtn.href = apkUrl || FALLBACK_URL;
            if (apkUrl) {
                ui.android.mainBtn.classList.remove('disabled');
                ui.android.mainBtn.classList.add('shiny-btn');
            }
        }

        // 3. Linux (.deb, .rpm, .pacman)
        updateBtn(ui.deb, findLink('.deb'), version);
        updateBtn(ui.rpm, findLink('.rpm'), version);
        
        // Arch bazen .zst kullanır
        const archUrl = findLink('.pacman') || findLink('.zst'); 
        updateBtn(ui.arch, archUrl, version);

        console.log(`[Update] İndirme linkleri güncellendi: ${version}`);

    } catch (error) {
        console.warn("Versiyon bilgisi alınamadı, varsayılan linkler kullanılıyor.", error);
        
        Object.values(ui).forEach(item => {
            if (item.btn) {
                item.btn.href = FALLBACK_URL;
                if (item.tag) item.tag.innerText = "Manuel Kontrol";
            }
        });
        
        if (ui.android.mainBtn) ui.android.mainBtn.href = FALLBACK_URL;
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