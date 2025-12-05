const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "YaliApp",
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: true,
        frame: false, // <-- ÇERÇEVEYİ KALDIRDIK (Frameless)
        transparent: true // Kenarların keskin olmaması için (Opsiyonel)
    });

    mainWindow.loadFile('index.html');
}

// --- PENCERE KONTROL KOMUTLARI (Renderer'dan gelen) ---
ipcMain.on('minimize-app', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('close-app', () => {
    if (mainWindow) mainWindow.close();
});

// ------------------------------------------------------

app.whenReady().then(() => {
    createWindow();
    
    autoUpdater.checkForUpdatesAndNotify();
    
    autoUpdater.on('update-downloaded', () => {
        dialog.showMessageBox({
            type: 'info',
            title: 'Güncelleme Hazır',
            message: 'Yeni versiyon indirildi. Yüklemek için uygulama yeniden başlatılacak.',
            buttons: ['Yeniden Başlat']
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});