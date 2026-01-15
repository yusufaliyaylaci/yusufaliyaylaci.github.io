const CACHE_NAME = 'yali-blog-v2.0.2';
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
    './assets/photo7.webp',
    './assets/photo8.webp',
    './assets/photo9.webp',
    './assets/yaliapp.png'
];

// 1. KURULUM: Hemen aktif ol (skipWaiting)
self.addEventListener('install', (e) => {
    // Yeni SW yüklendiği an bekleme yapmadan "activate" aşamasına geç
    self.skipWaiting(); 
    
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. AKTİVASYON: Eski cache'leri sil ve sayfayı hemen kontrol altına al
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[SW] Eski cache siliniyor:', key);
                    return caches.delete(key);
                }
            }));
        }).then(() => {
            // Sayfayı yenilemeye gerek kalmadan yeni SW'nin kontrolü devralmasını sağla
            return self.clients.claim();
        })
    );
});

// 3. FETCH STRATEJİSİ (Network First for HTML, Cache First for Assets)
self.addEventListener('fetch', (e) => {
    const req = e.request;
    const url = new URL(req.url);

    // Eğer istek ana sayfa (HTML) ise -> Önce İNTERNETTEN çek, yoksa cache'den ver.
    // Bu sayede kullanıcı her zaman en güncel versiyon numarasını (v=...) alır.
    if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
        e.respondWith(
            fetch(req).catch(() => {
                return caches.match(req);
            })
        );
    } 
    // Diğer dosyalar (CSS, JS, Resim) -> Önce CACHE, yoksa internet.
    // Zaten index.html güncel olacağı için, CSS/JS dosyalarını yeni versiyon parametresiyle isteyecektir.
    else {
        e.respondWith(
            caches.match(req).then((response) => {
                return response || fetch(req);
            })
        );
    }
});
