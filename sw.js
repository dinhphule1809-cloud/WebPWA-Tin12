/* Bản cache có namespace riêng: không can thiệp cache của ứng dụng khác. */
const CACHE_NAME = 'tin12-study-space-v3-20261123';
const PREFIX = 'tin12-';
const FILES = ['./','./index.html','./style.css','./script.js','./questions.json','./manifest.json','./lib/jszip.min.js','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith(caches.match(req, {ignoreSearch: false}).then(cached => {
    if (cached) return cached;
    return fetch(req).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(req,copy)));
      }
      return response;
    });
  }));
});
