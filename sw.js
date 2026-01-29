const CACHE_NAME = 'yali-app-';

// Önbelleğe alınacak temel dosyalar
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/main.js',
  './js/ui.js',
  './js/ui_helper.js',
  './js/radio.js',
  './js/weather.js',
  './js/state.js',
  './js/config.js',
  './assets/icon.ico'
];

// 1. KURULUM (INSTALL): Statik dosyaları önbelleğe al
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Yeni SW'yi hemen aktif et
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Dosyalar önbelleğe alınıyor');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. AKTİVASYON (ACTIVATE): Eski önbellekleri temizle
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Eski önbellek temizleniyor:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Tüm istemcileri hemen kontrol altına al
});

// 3. İSTEK YAKALAMA (FETCH): İndirme fix'i burada
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);


  if (url.pathname.match(/\.(apk|exe|deb|rpm|pacman|zip|tar\.gz|dmg|iso)$/i)) {
      console.log('[ServiceWorker] İndirme dosyası tespit edildi, pas geçiliyor:', url.pathname);
      return; 
  }

  // Standart Cache Stratejisi (Cache-First)
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 1. Cache'de varsa oradan döndür
        if (response) {
          return response;
        }

        // 2. Cache'de yoksa internetten çek
        return fetch(event.request).then(
          (response) => {
            // Geçersiz veya hatalı yanıtları cache'leme
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Yanıtı kopyala ve dinamik olarak cache'e ekle
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});
