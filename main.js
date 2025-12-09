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
    // asar: false yaptığımız için __dirname artık her yerde güvenli çalışır
    const iconName = process.platform === 'win32' ? 'assets/icon.ico' : 'assets/yaliapp.png';
    const iconPath = path.join(__dirname, iconName);
    
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "YaliApp",
        icon: iconPath,
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

    // Kapanma isteği geldiğinde kontrol et
    mainWindow.on('close', (event) => {
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
        // Platforma göre ikon seçimi
        const iconName = process.platform === 'win32' ? 'assets/icon.ico' : 'assets/yaliapp.png';
        const iconPath = path.join(__dirname, iconName);
        
        const trayIcon = nativeImage.createFromPath(iconPath);
        
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

// --- IPC OLAYLARI ---
ipcMain.on('minimize-app', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('close-app', () => { if (mainWindow) mainWindow.hide(); });
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
            // Sessiz kurulum ve otomatik restart
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
    
    globalShortcut.register('F11', () => { return false; });
    setTimeout(() => { autoUpdater.checkForUpdatesAndNotify(); }, 3000);

    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// Güncelleme veya tam çıkış komutu geldiğinde bayrağı kaldır
app.on('before-quit', () => {
    isQuitting = true;
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') { /* Tray için boş */ } });