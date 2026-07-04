const CACHE_NAME = "our-analysis-v2";

const APP_SHELL = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/app.js",
  "/js/storage.js",
  "/js/recorder.js",
  "/js/export.js",
  "/js/instructivo.js",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // Nunca cachear llamadas a la API: siempre red, sin fallback offline
  // (transcribir requiere conexión sí o sí).
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // App shell: cache-first, actualiza en segundo plano.
  event.respondWith(
    caches.match(request).then(cached => {
      const fetchPromise = fetch(request)
        .then(networkResponse => {
          if (request.method === "GET" && networkResponse && networkResponse.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, networkResponse.clone()));
          }
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
