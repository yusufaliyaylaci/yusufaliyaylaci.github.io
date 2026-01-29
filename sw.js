const CACHE_NAME = 'yali-app-v2.2.7'; // Otomasyon burayi gunceller
const URLS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/main.js',
    './js/ui.js',
    './js/radio.js',
    './js/weather.js',
    './js/state.js',
    './js/config.js',
    './js/ui_helper.js',
    './assets/icon.ico',
    './assets/profil.webp',
    './manifest.json'
];

// 1. KURULUM (INSTALL)
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                // Kritik dosyalari onbellekle
                return cache.addAll(URLS_TO_CACHE);
            })
    );
});

// 2. AKTİFLEŞTİRME (ACTIVATE)
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
    
    // Eski surumleri temizle
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// 3. İSTEK YAKALAMA (FETCH)
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // --- KRİTİK DÜZELTME: İNDİRME DOSYALARINI GÖRMEZDEN GEL ---
    // APK, EXE, DEB vb. dosyalari Service Worker yakalamamali.
    // Birakin tarayici (Browser) bu dosyalari direkt indirsin.
    if (url.match(/\.(apk|exe|deb|rpm|pacman|zip|tar\.gz|dmg|iso)$/i)) {
        return; // SW hiçbir şey yapmaz, topu tarayıcıya atar.
    }

    // STRATEJİ 1: NETWORK FIRST (Önce İnternet)
    // HTML, API, CSS ve JS dosyalari icin
    if (
        event.request.mode === 'navigate' || 
        url.endsWith('.json') || 
        url.includes('api.github.com') ||
        url.includes('.css') ||
        url.includes('.js')
    ) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }

    // STRATEJİ 2: CACHE FIRST (Önce Cache)
    // Resimler, fontlar vb.
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            });
        })
    );
});
