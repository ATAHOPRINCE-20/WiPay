// UgPay Service Worker - Network-First Cache Strategy with Auto-Purge
const CACHE_NAME = 'ugpay-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => caches.delete(cache))
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First strategy for all requests (Never serve stale index.html or old JS chunks)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Skip API requests from SW handling
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache successful static asset responses
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          // Do NOT cache index.html or root HTML document
          const isHtml = event.request.headers.get('accept')?.includes('text/html') || url.pathname === '/' || url.pathname === '/index.html';
          if (!isHtml) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache only if offline
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/index.html') || caches.match('/');
          }
        });
      })
  );
});
