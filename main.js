const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const DiscordRPC = require('discord-rpc');

// --- İMZA KONTROLÜNÜ KAPAT ---
autoUpdater.verifyUpdateCodeSignature = false;
autoUpdater.autoDownload = true;

// --- DISCORD AYARLARI ---
const clientId = '1446054622350540810'; 
let rpc;

let mainWindow;
let tray = null;
let isQuitting = false;

// --- YARDIMCI FONKSİYON: PENCERE ANİMASYONU ---
// Pencerenin opaklığını (görünürlüğünü) yavaşça değiştirir.
function animateWindow(win, targetOpacity, callback) {
    if (!win || win.isDestroyed()) return;

    // Mevcut opaklığı al
    let opacity = win.getOpacity();
    
    // Animasyon adımı (Hız ayarı: 0.05 arttır/azalt)
    const step = targetOpacity > opacity ? 0.05 : -0.05;

    const timer = setInterval(() => {
        if (!win || win.isDestroyed()) {
            clearInterval(timer);
            return;
        }

        opacity += step;

        // Hedefe ulaşıldı mı kontrol et
        if ((step > 0 && opacity >= targetOpacity) || (step < 0 && opacity <= targetOpacity)) {
            win.setOpacity(targetOpacity);
            clearInterval(timer);
            if (callback) callback();
        } else {
            win.setOpacity(opacity);
        }
    }, 10); // Her 10 milisaniyede bir işlem yap (Akıcılık)
}

function createWindow() {
    // asar: false yaptığımız için __dirname artık her yerde güvenli çalışır
    const iconName = process.platform === 'win32' ? 'assets/icon.ico' : 'assets/yaliapp.png';
    const iconPath = path.join(__dirname, iconName);
    
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "YaliApp",
        icon: iconPath,
        opacity: 0, // Başlangıçta görünmez (Animasyon için)
        show: false, // İlk oluşturulduğunda gösterme
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false,
            webSecurity: true 
        },
        autoHideMenuBar: true,
        frame: false,
        transparent: true
    });

    mainWindow.loadFile('index.html');

    // Pencere hazır olduğunda animasyonla göster
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        animateWindow(mainWindow, 1.0); // 0'dan 1'e fade-in
    });

    // Kapanma isteği geldiğinde kontrol et
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            // Kapanmadan önce fade-out animasyonu yap
            animateWindow(mainWindow, 0, () => {
                mainWindow.hide();
            });
            return false;
        }
    });

    // Tam ekran olaylarını dinle ve arayüze bildir (İkon değişimi için)
    mainWindow.on('enter-full-screen', () => { 
        mainWindow.webContents.send('fullscreen-update', true);
        mainWindow.webContents.send('ui-fullscreen-changed', true); // İkon için özel sinyal
    });
    
    mainWindow.on('leave-full-screen', () => { 
        mainWindow.webContents.send('fullscreen-update', false);
        mainWindow.webContents.send('ui-fullscreen-changed', false); // İkon için özel sinyal
    });

    // Simge durumundan geri yüklenirken animasyon
    mainWindow.on('restore', () => {
        mainWindow.setOpacity(0); // Önce görünmez yap
        animateWindow(mainWindow, 1.0); // Sonra yavaşça göster
    });
}

function createTray() {
    try {
        const iconName = process.platform === 'win32' ? 'assets/icon.ico' : 'assets/yaliapp.png';
        const iconPath = path.join(__dirname, iconName);
        const trayIcon = nativeImage.createFromPath(iconPath);
        
        tray = new Tray(trayIcon);
        
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Göster', click: () => {
                mainWindow.show();
                animateWindow(mainWindow, 1.0);
            }},
            { label: 'Durdur/Oynat', click: () => mainWindow.webContents.send('media-toggle') },
            { type: 'separator' },
            { label: 'Çıkış', click: () => { isQuitting = true; app.quit(); }}
        ]);
        
        tray.setToolTip('YaliApp - Radyo');
        tray.setContextMenu(contextMenu);
        
        tray.on('double-click', () => {
            mainWindow.show();
            animateWindow(mainWindow, 1.0);
        });
        
    } catch (error) {
        console.error("Tray oluşturulurken hata:", error);
    }
}

// --- OTOMATİK GÜNCELLEME DÖNGÜSÜ ---
function startAutoUpdateCheck() {
    // Uygulama açıldıktan 5 saniye sonra ilk kontrolü yap
    setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify();
    }, 5000);

    // Sonra her 30 dakikada bir kontrol et (30 * 60 * 1000 ms)
    setInterval(() => {
        console.log("Periyodik güncelleme kontrolü yapılıyor...");
        autoUpdater.checkForUpdatesAndNotify();
    }, 30 * 60 * 1000);
}

// --- DISCORD RPC ---
function initDiscordRPC() {
    rpc = new DiscordRPC.Client({ transport: 'ipc' });
    
    rpc.on('ready', () => {
        console.log('Discord RPC Hazır!');
        setActivity('Ana Sayfa', 'Geziniyor');
    });

    rpc.login({ clientId }).catch(err => {
        console.warn('Discord RPC Bağlanamadı:', err);
    });
}

function setActivity(details, state, smallImageKey = 'icon') {
    if (!rpc) return;
    rpc.setActivity({
        details: details,
        state: state,
        startTimestamp: new Date(),
        largeImageKey: 'yaliapp_logo',
        largeImageText: 'YaliApp - Radyo',
        smallImageKey: smallImageKey,
        instance: false,
    }).catch(console.error);
}

// --- IPC OLAYLARI VE ANİMASYONLAR ---
ipcMain.on('minimize-app', () => { 
    if (mainWindow) {
        // Önce fade-out yap, bittiğinde minimize et
        animateWindow(mainWindow, 0, () => {
            mainWindow.minimize();
            // Minimize olduktan sonra opaklığı tekrar 1 yap ki
            // kullanıcı taskbar'dan açtığında veya restore olduğunda
            // Windows native animasyonları çalışabilsin veya manuel restore devreye girsin.
            // Ancak biz 'restore' olayını dinlediğimiz için orada 0'dan başlatacağız.
        });
    }
});

ipcMain.on('close-app', () => { 
    if (mainWindow) {
        animateWindow(mainWindow, 0, () => {
            mainWindow.hide();
        });
    }
});

ipcMain.on('get-app-version', (event) => { if (mainWindow) mainWindow.webContents.send('app-version', app.getVersion()); });
ipcMain.on('update-discord-activity', (event, data) => { setActivity(data.details, data.state); });

// --- GÜNCELLEME SİSTEMİ ---
autoUpdater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) {
        mainWindow.webContents.send('update-downloaded', info);
        setTimeout(() => { 
            autoUpdater.quitAndInstall(true, true); 
        }, 3000);
    }
});

autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow) mainWindow.webContents.send('update-progress', {
        percent: progressObj.percent,
        speed: progressObj.bytesPerSecond
    });
});

app.whenReady().then(() => {
    createTray();
    createWindow();
    initDiscordRPC();
    startAutoUpdateCheck(); // Sık güncelleme kontrolünü başlat
    
    globalShortcut.register('F11', () => { return false; });
    
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => {
    isQuitting = true;
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') { } });