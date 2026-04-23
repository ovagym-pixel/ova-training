const CACHE_VERSION = "ova-v1";
const CACHE_NAME = `ova-training-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/tokens.css",
  "./css/app.css",
  "./js/app.js",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith("ova-training-") && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.hostname.includes("firestore.googleapis.com") ||
      url.hostname.includes("firebaseauth") ||
      url.hostname.includes("api.groq.com")) {
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        fetch(request).then(fresh => {
          if (fresh.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, fresh));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(request).then(response => {
        if (response.ok && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
