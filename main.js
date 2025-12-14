const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu, nativeImage, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const DiscordRPC = require('discord-rpc');

// --- İMZA KONTROLÜNÜ KAPAT ---
autoUpdater.verifyUpdateCodeSignature = false;
autoUpdater.autoDownload = true;

// --- PROTOKOL TANIMLAMASI ---
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('yaliapp', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('yaliapp');
}

// --- DISCORD AYARLARI ---
const clientId = '1446054622350540810'; 
let rpc;

let mainWindow;
let tray = null;
let isQuitting = false;

// --- YARDIMCI FONKSİYON: PENCERE ANİMASYONU ---
function animateWindow(win, targetOpacity, callback) {
    if (!win || win.isDestroyed()) return;
    let opacity = win.getOpacity();
    const step = targetOpacity > opacity ? 0.05 : -0.05;

    const timer = setInterval(() => {
        if (!win || win.isDestroyed()) {
            clearInterval(timer);
            return;
        }
        opacity += step;
        if ((step > 0 && opacity >= targetOpacity) || (step < 0 && opacity <= targetOpacity)) {
            win.setOpacity(targetOpacity);
            clearInterval(timer);
            if (callback) callback();
        } else {
            win.setOpacity(opacity);
        }
    }, 10);
}

function createWindow() {
    const iconName = process.platform === 'win32' ? 'assets/icon.ico' : 'assets/yaliapp.png';
    const iconPath = path.join(__dirname, iconName);
    
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "YaliApp",
        icon: iconPath,
        opacity: 0,
        show: false,
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

    // Linkleri tarayıcıda aç
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        animateWindow(mainWindow, 1.0);
    });

    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            animateWindow(mainWindow, 0, () => {
                mainWindow.hide();
            });
            return false;
        }
    });

    mainWindow.on('enter-full-screen', () => { 
        mainWindow.webContents.send('fullscreen-update', true);
        mainWindow.webContents.send('ui-fullscreen-changed', true);
    });
    
    mainWindow.on('leave-full-screen', () => { 
        mainWindow.webContents.send('fullscreen-update', false);
        mainWindow.webContents.send('ui-fullscreen-changed', false);
    });

    mainWindow.on('restore', () => {
        mainWindow.setOpacity(0);
        animateWindow(mainWindow, 1.0);
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

function startAutoUpdateCheck() {
    setTimeout(() => { autoUpdater.checkForUpdatesAndNotify(); }, 5000);
    setInterval(() => {
        console.log("Periyodik güncelleme kontrolü yapılıyor...");
        autoUpdater.checkForUpdatesAndNotify();
    }, 30 * 60 * 1000);
}

// --- DEEP LINK İŞLEME ---
function processDeepLink(url) {
    console.log("Link algılandı:", url);
    if (url && url.includes('join')) {
        if(mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('app-mode-listener');
        }
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
    
    const siteUrl = "https://yusufaliyaylaci.com/?action=join";

    rpc.setActivity({
        details: details,
        state: state,
        // startTimestamp: new Date(),  <-- BU SATIR ARTIK YOK, SAYAC ÇIKMAZ
        largeImageKey: 'yaliapp_logo',
        largeImageText: 'YaliApp - Radyo',
        smallImageKey: smallImageKey,
        instance: false,
        buttons: [
            { label: "Birlikte Dinle", url: siteUrl }
        ]
    }).catch(console.error);
}

// --- IPC OLAYLARI ---
ipcMain.on('minimize-app', () => { 
    if (mainWindow) {
        animateWindow(mainWindow, 0, () => {
            mainWindow.minimize();
            setTimeout(() => mainWindow.setOpacity(1), 500); 
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
autoUpdater.on('update-available', (info) => { if (mainWindow) mainWindow.webContents.send('update-available', info); });
autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) {
        mainWindow.webContents.send('update-downloaded', info);
        setTimeout(() => { autoUpdater.quitAndInstall(true, true); }, 3000);
    }
});
autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow) mainWindow.webContents.send('update-progress', { percent: progressObj.percent, speed: progressObj.bytesPerSecond });
});

// --- SINGLE INSTANCE LOCK ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            const url = commandLine.find(arg => arg.startsWith('yaliapp://'));
            if (url) processDeepLink(url);
        }
    });

    app.whenReady().then(() => {
        createTray();
        createWindow();
        initDiscordRPC();
        startAutoUpdateCheck();
        
        if (process.platform === 'win32') {
            const url = process.argv.find(arg => arg.startsWith('yaliapp://'));
            if (url) {
                mainWindow.webContents.once('did-finish-load', () => {
                    processDeepLink(url);
                });
            }
        }

        globalShortcut.register('F11', () => { return false; });
        app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
        
        app.on('open-url', (event, url) => {
            event.preventDefault();
            processDeepLink(url);
        });
    });
}

app.on('before-quit', () => { isQuitting = true; });
app.on('will-quit', () => { globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') { } });