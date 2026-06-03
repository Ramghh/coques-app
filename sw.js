// ╔══════════════════════════════════════════════════════╗
// ║   FlousFlow Service Worker  – Gharbi Ramzi           ║
// ║   Cache-first strategy for full offline support      ║
// ╚══════════════════════════════════════════════════════╝

const CACHE_NAME = 'flousflow-v1';
const CACHE_VERSION = 1;

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
  console.log('[SW] Installing FlousFlow PWA...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Cache each URL individually so one failure doesn't block the rest
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
  console.log('[SW] Activating...');
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

// ── Fetch: cache-first, fallback to network ───────────────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip Gist API calls (always need network)
  if (event.request.url.includes('api.github.com')) return;
  if (event.request.url.includes('gist.github.com')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Serve from cache, update cache in background (stale-while-revalidate)
        const networkFetch = fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, response.clone());
              });
            }
            return response;
          })
          .catch(() => {}); // Ignore network errors in background
        return cached;
      }

      // Not in cache → fetch from network and cache it
      return fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Offline fallback for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});

// ── Message handler: force update ─────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
