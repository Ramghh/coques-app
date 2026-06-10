// ╔══════════════════════════════════════════════════════╗
// ║   FlousFlow Service Worker  – Gharbi Ramzi           ║
// ║   Auto-versioning via Last-Modified header           ║
// ╚══════════════════════════════════════════════════════╝

const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Cabinet+Grotesk:wght@400;500;700;800;900&family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
];

const CACHE_BASE = 'flousflow';

// ── Récupérer la version depuis Last-Modified de index.html ──────────────
async function getVersion() {
  try {
    const res = await fetch('./index.html', { method: 'HEAD', cache: 'no-store' });
    const lastMod = res.headers.get('last-modified');
    if (lastMod) return CACHE_BASE + '-' + new Date(lastMod).getTime();
  } catch(e) {}
  return CACHE_BASE + '-fallback';
}

// ── Install ───────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    getVersion().then(async version => {
      console.log('[SW] Installing – cache:', version);
      const cache = await caches.open(version);
      await Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Skip:', url, err.message))
        )
      );
      await self.skipWaiting();
    })
  );
});

// ── Activate: supprimer anciens caches ───────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    getVersion().then(async version => {
      console.log('[SW] Activating – keeping:', version);
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k.startsWith(CACHE_BASE) && k !== version)
          .map(k => { console.log('[SW] Deleting:', k); return caches.delete(k); })
      );
      return self.clients.claim();
    })
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('api.github.com')) return;
  if (event.request.url.includes('gist.github.com')) return;

  const url = new URL(event.request.url);
  const isHTML = url.pathname.endsWith('.html') || url.pathname.endsWith('/') || event.request.mode === 'navigate';

  if (isHTML) {
    // Network-first → fallback cache offline
    event.respondWith(
      fetch(event.request)
        .then(async response => {
          if (response && response.status === 200) {
            const version = await getVersion();
            const cache = await caches.open(version);
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first pour CDN/fonts/libs
    event.respondWith(
      caches.match(event.request).then(async cached => {
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response && response.status === 200 && response.type !== 'opaque') {
            const version = await getVersion();
            const cache = await caches.open(version);
            cache.put(event.request, response.clone());
          }
          return response;
        } catch(e) { return new Response('', {status: 503}); }
      })
    );
  }
});

// ── Message handler ───────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
