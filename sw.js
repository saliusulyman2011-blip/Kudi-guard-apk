const CACHE_NAME = 'KUDI_GUARD_V3'; 
const FILES_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './app.js',
  './currency.js',
  './worker.js',
  './manifest.json',
  './icon1.png',
  './icon2.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});

self.addEventListener('push', e => {
  const data = e.data.text()
  e.waitUntil(
    self.registration.showNotification('Kudi Guide', {
      body: data,
      icon: './icon1.png',
      badge: './icon1.png'
    })
  );
});