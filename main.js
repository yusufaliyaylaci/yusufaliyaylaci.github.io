const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const DiscordRPC = require('discord-rpc'); // Discord modülü

// --- İMZA KONTROLÜNÜ KAPAT ---
autoUpdater.verifyUpdateCodeSignature = false;

// --- DISCORD AYARLARI ---
// https://discord.com/developers/applications adresinden bir Client ID almalısın.
const clientId = '1446054622350540810'; // BURAYA KENDİ CLIENT ID'Nİ YAZ
let rpc;

let mainWindow;
let tray = null;
let isQuitting = false; // Uygulamanın gerçekten kapanıp kapanmayacağını kontrol eder

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "YaliApp",
        icon: path.join(__dirname, 'assets/icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false
        },
        autoHideMenuBar: true,
        frame: false,
        transparent: true
    });

    mainWindow.loadFile('index.html');

    // --- KAPATMA DAVRANIŞINI DEĞİŞTİR (TRAY İÇİN) ---
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide(); // Kapatma, gizle
            return false;
        }
    });

    // --- F11 (TAM EKRAN) DURUMUNU TAKİP ET ---
    mainWindow.on('enter-full-screen', () => {
        mainWindow.webContents.send('fullscreen-update', true);
    });

    mainWindow.on('leave-full-screen', () => {
        mainWindow.webContents.send('fullscreen-update', false);
    });
}

// --- TRAY (SİSTEM TEPSİSİ) OLUŞTURMA ---
function createTray() {
    tray = new Tray(path.join(__dirname, 'assets/icon.ico'));
    
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Göster', click: () => mainWindow.show() },
        { label: 'Durdur/Oynat', click: () => mainWindow.webContents.send('media-toggle') },
        { type: 'separator' },
        { label: 'Çıkış', click: () => {
            isQuitting = true;
            app.quit();
        }}
    ]);

    tray.setToolTip('YaliApp - Blog & Radyo');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => mainWindow.show());
}

// --- DISCORD RPC BAŞLATMA ---
function initDiscordRPC() {
    rpc = new DiscordRPC.Client({ transport: 'ipc' });
    
    rpc.on('ready', () => {
        console.log('Discord RPC Hazır!');
        // Varsayılan durum
        setActivity('Ana Sayfa', 'Geziniyor');
    });

    rpc.login({ clientId }).catch(console.error);
}

function setActivity(details, state, smallImageKey = 'icon') {
    if (!rpc) return;
    rpc.setActivity({
        details: details, // Örn: Power FM
        state: state,     // Örn: Dinleniyor...
        startTimestamp: new Date(),
        largeImageKey: 'yaliapp_logo', // Discord Developer Portal'a yüklediğin resim anahtarı
        largeImageText: 'YaliApp',
        smallImageKey: smallImageKey,
        instance: false,
    }).catch(console.error);
}

// --- PENCERE KONTROLLERİ ---
ipcMain.on('minimize-app', () => { if (mainWindow) mainWindow.minimize(); });

// 'close-app' tetiklendiğinde Tray moduna geçmesi için sadece hide yapıyoruz
ipcMain.on('close-app', () => { 
    if (mainWindow) mainWindow.hide(); 
});

ipcMain.on('get-app-version', (event) => {
    if (mainWindow) mainWindow.webContents.send('app-version', app.getVersion());
});

// --- RENDERER'DAN GELEN DISCORD GÜNCELLEMELERİ ---
ipcMain.on('update-discord-activity', (event, data) => {
    setActivity(data.details, data.state);
});

// --- BAŞLATMA ---
app.whenReady().then(() => {
    createTray();
    createWindow();
    initDiscordRPC();
    
    globalShortcut.register('F11', () => { return false; });
    setTimeout(() => { autoUpdater.checkForUpdatesAndNotify(); }, 3000);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

// macOS hariç tüm pencereler kapansa bile (bizim durumumuzda gizlense bile) çalışmaya devam et
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // Tray kullandığımız için app.quit() yapmıyoruz
    }
});