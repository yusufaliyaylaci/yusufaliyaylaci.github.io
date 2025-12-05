const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater'); // <-- YENİ EKLENDİ
const path = require('path');

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "YaliApp",
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: true,
        frame: true
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();
    
    // --- GÜNCELLEME KONTROLÜ BAŞLANGICI ---
    // Güncelleme kontrolünü başlat
    autoUpdater.checkForUpdatesAndNotify();
    
    // Güncelleme bulunduğunda
    autoUpdater.on('update-available', () => {
        // İstersen burada kullanıcıya bildirim gönderebilirsin
        console.log('Güncelleme mevcut');
    });

    // Güncelleme indirildiğinde
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
    // --- GÜNCELLEME KONTROLÜ BİTİŞİ ---

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});