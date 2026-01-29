const CACHE_NAME = 'yali-app-v2.2.5';
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
    self.skipWaiting(); // Bekleme yapma, hemen geç
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Önbellek açıldı');
                return cache.addAll(URLS_TO_CACHE);
            })
    );
});

// 2. AKTİFLEŞTİRME (ACTIVATE)
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim()); // Sayfayı hemen ele geçir
    
    // Eski cache'leri temizle
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

    // STRATEJİ 1: NETWORK FIRST (Önce İnternet, Yoksa Cache)
    // HTML, JSON (API), CSS ve JS dosyaları için bunu kullanıyoruz.
    // Böylece kodda yaptığın değişiklik anında yansır.
    if (
        event.request.mode === 'navigate' || 
        url.endsWith('.json') || 
        url.includes('api.github.com') ||
        url.includes('.css') ||  // CSS dosyalarını ekledik
        url.includes('.js')      // JS dosyalarını ekledik
    ) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }

    // STRATEJİ 2: CACHE FIRST (Önce Cache, Yoksa İnternet)
    // Resimler, fontlar vb. nadir değişenler için.
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                // Cache'e at (Dinamik caching)
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
