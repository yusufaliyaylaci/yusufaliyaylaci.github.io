const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipcRenderer', {
    send: (channel, data) => {
        // İzin verilen kanallar (Discord güncellemesi eklendi)
        const validChannels = ['minimize-app', 'close-app', 'get-app-version', 'update-discord-activity'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    on: (channel, func) => {
        // Dinlenen kanallar (Medya kontrolü eklendi)
        const validChannels = ['app-version', 'fullscreen-update', 'media-toggle'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func({}, ...args));
        }
    }
});