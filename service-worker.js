const CACHE = "hmos-v2-3-1-instant-open";
const ASSETS = ["./", "index.html", "styles.css", "app.js", "firebase-config.js", "firebase-service.js", "manifest.json"];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
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

  const isFreshCode = event.request.mode === "navigate" || /\.(?:js|html)$/.test(url.pathname);
  if (isFreshCode) {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request.mode === "navigate" ? "index.html" : event.request, response.clone()));
      return response;
    }).catch(() => caches.match(event.request.mode === "navigate" ? "index.html" : event.request)));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  })));
});
