const CACHE = "hmos-v2-foundation";
const ASSETS = ["./", "index.html", "styles.css", "app.js", "firebase-config.js", "firebase-service.js", "manifest.json"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener("fetch", event => { if (event.request.method === "GET") event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request))); });
