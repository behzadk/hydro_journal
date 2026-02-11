/* sw.js — Service worker: network-first for app shell + data, cache-first for CDN/icons */

const CACHE_NAME = 'hydro-journal-v2';

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

// Activate: clean up old caches, take control immediately
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

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and GitHub API calls
  if (event.request.method !== 'GET') return;
  if (url.hostname === 'api.github.com') return;

  // CDN resources and icons: cache-first (they don't change)
  if (url.hostname !== self.location.hostname || url.pathname.match(/\/icons\//)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Everything else (app shell, data, images): network-first
  event.respondWith(networkFirst(event.request));
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
