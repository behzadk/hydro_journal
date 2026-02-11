/* sw.js — Service worker: cache app shell, network-first for data/images */

const CACHE_NAME = 'hydro-journal-v1';

const APP_SHELL = [
  './',
  './index.html',
  './app.html',
  './settings.html',
  './css/style.css',
  './js/site.js',
  './js/auth.js',
  './js/github-api.js',
  './js/submit.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for data/images, cache-first for app shell
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and GitHub API calls
  if (event.request.method !== 'GET') return;
  if (url.hostname === 'api.github.com') return;

  // Data and images: network-first
  if (url.pathname.includes('/data/') || url.pathname.includes('/images/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // CDN resources and app shell: cache-first
  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}
