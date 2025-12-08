// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipcRenderer', {
    send: (channel, data) => {
        // Sadece izin verilen kanallardan mesaj gönderilmesine izin ver
        const validChannels = ['minimize-app', 'close-app', 'get-app-version'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    on: (channel, func) => {
        // Sadece izin verilen kanallardan gelen mesajları dinle
        const validChannels = ['app-version', 'fullscreen-update'];
        if (validChannels.includes(channel)) {
            // Güvenlik için orijinal 'event' nesnesini göndermek yerine boş bir obje gönderiyoruz
            ipcRenderer.on(channel, (event, ...args) => func({}, ...args));
        }
    }
});