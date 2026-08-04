const CACHE = "hmos-v2-4-institute-pro";
const STATIC_ASSETS = ["./", "index.html", "styles.css", "manifest.json"];
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC_ASSETS))); });
self.addEventListener("activate", e => e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener("fetch", e => {
  if(e.request.method!=="GET") return;
  const u=new URL(e.request.url); if(u.origin!==self.location.origin) return;
  const code=/\.(?:js|html)$/.test(u.pathname)||e.request.mode==="navigate";
  if(code){e.respondWith(fetch(e.request,{cache:"no-store"}).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(e.request,r.clone()));return r;}).catch(()=>caches.match(e.request).then(x=>x||caches.match("index.html"))));return;}
  e.respondWith(caches.match(e.request).then(x=>x||fetch(e.request).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(e.request,r.clone()));return r;})));
});
