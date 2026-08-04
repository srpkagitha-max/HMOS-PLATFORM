const CACHE = "hmos-v2.6.5";
const BASE = "/HMOS-PLATFORM/";
const STATIC_ASSETS = [
  BASE,
  `${BASE}index.html`,
  `${BASE}styles.css?v=2.6.5`,
  `${BASE}app.js?v=2.6.5`,
  `${BASE}firebase-config.js`,
  `${BASE}firebase-service.js`,
  `${BASE}manifest.json?v=2.6.5`,
  `${BASE}icon-192.png`,
  `${BASE}icon-512.png`
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  ]));
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(response => {
          if (response.ok) caches.open(CACHE).then(cache => cache.put(`${BASE}index.html`, response.clone()));
          return response;
        })
        .catch(() => caches.match(`${BASE}index.html`))
    );
    return;
  }

  const isCode = /\.(?:js|css|html)$/.test(url.pathname);
  if (isCode) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(response => {
          if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      return response;
    }))
  );
});
