const CACHE_NAME = 'yali-blog-v1.8.4';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    
    './js/main.js',
    './js/config.js',
    './js/state.js',
    './js/ui.js',
    './js/radio.js',
    './js/weather.js',

    './assets/icon.ico',
    './assets/profil.webp',
    './assets/photo1.webp',
    './assets/photo2.webp',
    './assets/photo3.webp',
    './assets/photo4.webp',
    './assets/photo5.webp',
    './assets/photo6.webp',
    './assets/photo7.webp'
];

// 1. Service Worker Kurulumu (Dosyaları Önbelleğe Al)
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. Fetch Olayı (İnternet Yoksa Önbellekten Getir)
self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => {
            return response || fetch(e.request);
        })
    );
});

// 3. Eski Önbelleği Temizle (Versiyon Değiştiğinde)
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
});
