// MOTI Service Worker
// Keep the app installable, but never cache private financial records or API responses.
// Activation also removes older caches created by previous service-worker versions.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Intentionally no fetch handler: requests always use the network and are never cached.
