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
        frame: false,
        transparent: true
    });

    mainWindow.loadFile('index.html');
}

// --- PENCERE KONTROLLERİ ---
ipcMain.on('minimize-app', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('close-app', () => { if (mainWindow) mainWindow.close(); });

// --- GÜNCELLEME OLAYLARI (DEBUG İÇİN) ---

// 1. Güncelleme Aranıyor
autoUpdater.on('checking-for-update', () => {
    console.log('Güncelleme kontrol ediliyor...');
});

// 2. Güncelleme Bulundu (İndiriliyor)
autoUpdater.on('update-available', () => {
    dialog.showMessageBox({
        type: 'info',
        title: 'Güncelleme Bulundu',
        message: 'Yeni bir sürüm var! Arka planda indiriliyor, lütfen bekleyin...',
        buttons: ['Tamam']
    });
});

// 3. Güncelleme Yok (Zaten en son sürümdesin)
// (Bunu normalde kullanıcıya göstermeyiz ama test için açabilirsin)
/*
autoUpdater.on('update-not-available', () => {
    dialog.showMessageBox({
        type: 'info',
        title: 'Güncelsiniz',
        message: 'Şu an en son sürümü kullanıyorsunuz.',
        buttons: ['Tamam']
    });
});
*/

// 4. HATA ÇIKTI (En Önemlisi Bu!)
autoUpdater.on('error', (err) => {
    dialog.showErrorBox('Güncelleme Hatası', 'Hata detayı: ' + (err.message || err));
});

// 5. İndirme Bitti (Yükle)
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
    
    // Uygulama açıldıktan 3 saniye sonra güncellemeyi kontrol et
    setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify();
    }, 3000);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});