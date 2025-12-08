const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipcRenderer', {
    send: (channel, data) => {
        const validChannels = ['minimize-app', 'close-app', 'get-app-version', 'update-discord-activity'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    on: (channel, func) => {
        const validChannels = [
            'app-version', 
            'fullscreen-update', 
            'media-toggle',
            'update-available', 
            'update-progress', 
            'update-downloaded'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func({}, ...args));
        }
    }
});