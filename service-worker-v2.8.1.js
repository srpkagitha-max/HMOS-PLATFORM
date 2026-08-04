const CACHE = "hmos-v2.8.1";
const BASE = "/HMOS-PLATFORM/";
const STATIC_ASSETS = [
  BASE,
  `${BASE}index.html?v=2.8.1`,
  `${BASE}styles.css?v=2.8.1`,
  `${BASE}app-v2.8.1.js`,
  `${BASE}firebase-service-v2.8.1.js`,
  `${BASE}firebase-config.js`,
  `${BASE}manifest.json?v=2.8.1`,
  `${BASE}icon-192.png`,
  `${BASE}icon-512.png`
];
self.addEventListener("install", event => { self.skipWaiting(); event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC_ASSETS))); });
self.addEventListener("activate", event => { event.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))])); });
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate" || /\.(?:js|css|html)$/.test(url.pathname)) {
    event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request).then(r => r || caches.match(`${BASE}index.html?v=2.8.1`))));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
});
