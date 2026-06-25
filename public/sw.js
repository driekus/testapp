const CACHE_NAME = 'letter-quest-v4';
const APP_SHELL = [
  '/',
  '/index.html',
  '/admin.html',
  '/feedback.html',
  '/final-question.html',
  '/rankings.html',
  '/winner.html',
  '/mock-payment.html',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Only cache same-origin requests (app shell / assets).
  // All cross-origin requests (Supabase API, storage) go straight to the network.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => cachedResponse || fetch(event.request)),
  );
});

