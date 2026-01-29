if (window.electronAPI) {
    window.electronAPI.onFullscreenChanged((_event, isFullscreen) => {
        updateFullscreenButton(isFullscreen);
    });
} else {
    console.log("ElectronAPI bulunamadı. Lütfen preload.js dosyasını kontrol edin.");
}

function updateFullscreenButton(isFullscreen) {
    const fullscreenBtn = document.getElementById('fullscreen-btn') || document.querySelector('.fullscreen-btn');
    const icon = fullscreenBtn ? fullscreenBtn.querySelector('i') : null;

    if (icon) {
        if (isFullscreen) {
            icon.classList.remove('fa-expand');
            icon.classList.add('fa-compress');
        } else {
            icon.classList.remove('fa-compress');
            icon.classList.add('fa-expand');
        }
    }
}