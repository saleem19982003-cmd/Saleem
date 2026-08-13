const CACHE_NAME = 'saleem-pwa-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/app.html',
    '/app.js',
    '/styles.css',
    '/favicon.svg',
    '/manifest.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
