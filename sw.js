const CACHE_NAME = 'crm-pro-cache-v1';
const CORE_ASSETS = [
  '/',
  'index.html',
  'index.css',
];

// On install, pre-cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting()) // Activate new service worker immediately
  );
});

// On activate, clean up old caches
self.addEventListener('activate', event => {
  const currentCaches = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return cacheNames.filter(cacheName => !currentCaches.includes(cacheName));
    }).then(cachesToDelete => {
      return Promise.all(cachesToDelete.map(cacheToDelete => {
        return caches.delete(cacheToDelete);
      }));
    }).then(() => self.clients.claim()) // Take control of all open clients
  );
});

// On fetch, serve from cache, falling back to network
self.addEventListener('fetch', event => {
  // We only handle GET requests
  if (event.request.method !== 'GET') {
      return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        // Return response from cache if found
        if (response) {
          return response;
        }

        // Otherwise, fetch from network
        return fetch(event.request).then(networkResponse => {
          // Add the new response to the cache
          cache.put(event.request, networkResponse.clone());
          // And return it to the browser
          return networkResponse;
        });
      });
    })
  );
});