/* Service worker — offline app shell for Success Academy Family Connect.
 * Bump CACHE when shipping new assets. */
const CACHE = 'sa-fc-v2';
const SHELL = [
  '.', 'index.html', 'styles.css', 'manifest.webmanifest', 'seed.json',
  'js/app.js', 'js/core.js', 'js/store.js', 'js/feed.js', 'js/messages.js',
  'js/engage.js', 'js/records.js', 'js/directory.js', 'js/admin.js',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => {}));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// network-first: always fresh when online, fall back to cache offline (no stale assets)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // let cross-origin (e.g. fonts) pass through
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((c) => c || caches.match('index.html')))
  );
});
