// ╔══════════════════════════════════════════════════════╗
// ║   FlousFlow Service Worker  – Gharbi Ramzi           ║
// ║   Network-first for index.html, cache-first for CDN  ║
// ╚══════════════════════════════════════════════════════╝

// ⚠️ IMPORTANT: Change this version each time you deploy a new index.html
// Just increment the number: v3 → v4 → v5 ...
const CACHE_NAME = 'flousflow-v2';

// App shell + external CDN resources to cache on install
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  // Fonts
  'https://fonts.googleapis.com/css2?family=Cabinet+Grotesk:wght@400;500;700;800;900&family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap',
  // Libraries
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
];

// ── Install: pre-cache all resources ─────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing FlousFlow PWA – cache:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      const results = await Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err => {
            console.warn('[SW] Failed to cache:', url, err.message);
          })
        )
      );
      console.log('[SW] Pre-cache complete');
      return results;
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating – removing old caches...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for index.html, cache-first for CDN ─────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Skip Gist API calls (always need network)
  if (event.request.url.includes('api.github.com')) return;
  if (event.request.url.includes('gist.github.com')) return;

  const url = new URL(event.request.url);
  const isHTML = url.pathname.endsWith('.html') || url.pathname.endsWith('/') || event.request.mode === 'navigate';

  if (isHTML) {
    // Network-first pour index.html → fallback cache si offline
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first pour CDN, fonts, libs
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (!response || response.status !== 200 || response.type === 'opaque') return response;
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
          return response;
        }).catch(() => {});
      })
    );
  }
});

// ── Message handler: force update ─────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
