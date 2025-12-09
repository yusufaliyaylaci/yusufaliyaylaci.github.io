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

function createWindow() {
    // Pencere ikonu için de platform kontrolü yapalım
    const iconName = process.platform === 'win32' ? 'assets/icon.ico' : 'assets/yaliapp.png';
    
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "YaliApp",
        icon: path.join(__dirname, iconName),
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

    mainWindow.on('close', (event) => {
        // Eğer kullanıcı çarpıya bastıysa gizle, ama
        // sistem/update kapatıyorsa (isQuitting=true) engelleme, kapanmasına izin ver.
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            return false;
        }
    });

    mainWindow.on('enter-full-screen', () => { mainWindow.webContents.send('fullscreen-update', true); });
    mainWindow.on('leave-full-screen', () => { mainWindow.webContents.send('fullscreen-update', false); });
}

function createTray() {
    try {
        // --- KRİTİK DÜZELTME ---
        // İşletim sistemine göre doğru ikonu seçiyoruz
        let iconPath;
        if (process.platform === 'win32') {
            iconPath = path.join(__dirname, 'assets/icon.ico');
        } else {
            // Linux ve macOS için PNG kullan
            iconPath = path.join(__dirname, 'assets/yaliapp.png');
        }
        
        // NativeImage oluştururken hata olursa yakalamak için kontrol
        const trayIcon = nativeImage.createFromPath(iconPath);
        
        // Linux'ta ikon boyutunu ayarlamak gerekebilir (genelde 32x32 veya sistem varsayılanı)
        // Windows .ico dosyası içinden uygun boyutu kendi seçer.
        if (process.platform !== 'win32') {
             // trayIcon.resize({ width: 24, height: 24 }); // Gerekirse açılabilir
        }
        
        tray = new Tray(trayIcon);
        
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Göster', click: () => mainWindow.show() },
            { label: 'Durdur/Oynat', click: () => mainWindow.webContents.send('media-toggle') },
            { type: 'separator' },
            { label: 'Çıkış', click: () => { isQuitting = true; app.quit(); }}
        ]);
        
        tray.setToolTip('YaliApp - Radyo');
        tray.setContextMenu(contextMenu);
        
        tray.on('double-click', () => mainWindow.show());
        
    } catch (error) {
        console.error("Tray oluşturulurken hata:", error);
    }
}

// --- DISCORD RPC BAŞLATMA ---
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

// --- IPC OLAYLARI ---
ipcMain.on('minimize-app', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('close-app', () => { if (mainWindow) mainWindow.hide(); });
ipcMain.on('get-app-version', (event) => { if (mainWindow) mainWindow.webContents.send('app-version', app.getVersion()); });
ipcMain.on('update-discord-activity', (event, data) => { setActivity(data.details, data.state); });

// --- GÜNCELLEME OLAYLARI ---
autoUpdater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow) mainWindow.webContents.send('update-progress', {
        percent: progressObj.percent,
        speed: progressObj.bytesPerSecond
    });
});

autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) {
        mainWindow.webContents.send('update-downloaded', info);
        setTimeout(() => { 
            // Sessiz modda kur ve uygulamayı yeniden başlat
            autoUpdater.quitAndInstall(true, true); 
        }, 3000);
    }
});

app.whenReady().then(() => {
    createTray();
    createWindow();
    initDiscordRPC();
    
    globalShortcut.register('F11', () => { return false; });
    setTimeout(() => { autoUpdater.checkForUpdatesAndNotify(); }, 3000);

    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// --- ÖNEMLİ EKLEME: GÜNCELLEME/KAPATMA İZNİ ---
// Uygulama tamamen kapanmaya hazırlanırken (Update veya CMD+Q ile)
// isQuitting bayrağını true yapıyoruz ki 'close' olayı engellemesin.
app.on('before-quit', () => {
    isQuitting = true;
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') { } });