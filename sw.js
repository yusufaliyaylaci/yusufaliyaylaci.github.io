const CACHE_NAME = 'yali-blog-v1.4.0';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/script.js',
    './assets/icon.ico',
    './assets/profil.jpg',
    './assets/photo1.jpg',
    './assets/photo2.jpg',
    './assets/photo3.jpg',
    './assets/photo4.jpg',
    './assets/photo5.jpg',
    './assets/photo6.jpg',
    './assets/photo7.jpg'
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
