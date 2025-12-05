const CACHE_NAME = 'yali-blog-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './icon.ico',
    './profil.jpg',
    './photo1.jpg',
    './photo2.jpg',
    './photo3.jpg',
    './photo4.jpg',
    './photo5.jpg',
    './photo6.jpg',
    './photo7.jpg'
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