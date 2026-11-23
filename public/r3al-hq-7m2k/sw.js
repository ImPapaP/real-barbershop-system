// Dashboard offline helper. Keeps a copy of the dashboard's page, scripts, styles and images on this device so the
// dashboard still opens without internet. The data itself is kept by Firestore's own offline copy.
//  - pages: from the internet first, the saved copy when offline
//  - versioned files (?v=...): the saved copy (they never change; a new version has a new address)
//  - other files and the Firebase library: the saved copy right away, refreshed in the background
const CACHE = 'rb-dash-v1';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'login.html']).catch(() => {}))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('rb-dash-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const keep = (req, res) => { if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); } return res; };
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url), same = url.origin === location.origin;
  // only our own files, the Firebase library and fonts; never the database or sign-in traffic
  if (!same && !/^(www\.gstatic\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname)) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => keep(req, r)).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./'))));
    return;
  }
  if (same && url.searchParams.has('v')) { e.respondWith(caches.match(req).then(r => r || fetch(req).then(x => keep(req, x)))); return; }
  e.respondWith(caches.match(req).then(hit => { const net = fetch(req).then(x => keep(req, x)).catch(() => hit); return hit || net; }));
});
