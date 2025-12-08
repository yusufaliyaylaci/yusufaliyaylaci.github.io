const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

// --- İMZA KONTROLÜNÜ KAPAT ---
autoUpdater.verifyUpdateCodeSignature = false;

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "YaliApp",
        icon: path.join(__dirname, 'assets/icon.ico'),
        webPreferences: {
            // GÜVENLİK GÜNCELLEMESİ BAŞLANGICI
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

    // --- F11 (TAM EKRAN) DURUMUNU TAKİP ET ---
    mainWindow.on('enter-full-screen', () => {
        mainWindow.webContents.send('fullscreen-update', true);
    });

    mainWindow.on('leave-full-screen', () => {
        mainWindow.webContents.send('fullscreen-update', false);
    });
}

// --- PENCERE KONTROLLERİ ---
ipcMain.on('minimize-app', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('close-app', () => { if (mainWindow) mainWindow.close(); });

// --- SÜRÜM BİLGİSİ İSTEĞİ ---
ipcMain.on('get-app-version', (event) => {
    if (mainWindow) mainWindow.webContents.send('app-version', app.getVersion());
});

// --- GÜNCELLEME OLAYLARI ---
autoUpdater.on('checking-for-update', () => { console.log('Güncelleme kontrol ediliyor...'); });

autoUpdater.on('update-available', () => {
    dialog.showMessageBox({
        type: 'info',
        title: 'Güncelleme Bulundu',
        message: 'Yeni bir sürüm tespit edildi. Arka planda indiriliyor, lütfen bekleyin...',
        buttons: ['Tamam']
    });
});

autoUpdater.on('error', (err) => {
    dialog.showErrorBox('Güncelleme Hatası', 'Hata detayı: ' + (err.message || err));
});

autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
        type: 'info',
        title: 'Güncelleme Hazır',
        message: 'Yeni versiyon indi. Uygulama şimdi yeniden başlatılıp güncellenecek.',
        buttons: ['Yükle ve Yeniden Başlat']
    }).then((result) => {
        autoUpdater.quitAndInstall();
    });
});

app.whenReady().then(() => {
    createWindow();
    
    // --- F11 TUŞUNU ENGELLE ---
    globalShortcut.register('F11', () => {
        console.log('F11 devre dışı bırakıldı.');
        return false;
    });
    
    setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify();
    }, 3000);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});