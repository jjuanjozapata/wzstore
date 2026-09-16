// Service Worker para soporte Offline y carga ultrarrápida Cache-First
const CACHE_NAME = 'wzstore-cache-v10';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './politicas.html',
  './styles.css',
  './app.js',
  './db.js',
  './favicon.svg',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Instalación y almacenamiento inicial de recursos críticos
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(
        ASSETS_TO_CACHE.map((asset) => cache.add(asset))
      );
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(`[SW] Advertencia: no se pudo precachear ${ASSETS_TO_CACHE[index]}:`, result.reason);
        }
      });
    }).then(() => self.skipWaiting())
  );
});

// Activación y limpieza de versiones obsoletas de caché
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Listener fetch con manejo diferenciado para Supabase, navegación y recursos estáticos
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.hostname.endsWith('supabase.co')) return;
  if (event.request.method !== 'GET') return;

  // Solicitudes hacia rutas que contengan '/admin': Network-Only sin intervención de caché
  if (url.pathname.includes('/admin')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Solicitudes de navegación: Network-First con fallback offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || caches.match('./index.html');
        });
      })
    );
    return;
  }

  const isLocalAsset = url.origin === self.location.origin &&
    ['/app.js', '/styles.css', '/db.js'].some(path => url.pathname.endsWith(path));

  // Recursos locales críticos: Network-First con fallback a caché
  if (isLocalAsset) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Recursos multimedia externos (imágenes y videos): Network-Only para evitar QuotaExceededError en navegadores WebKit
  const isExternalMedia = url.origin !== self.location.origin && (
    event.request.destination === 'image' ||
    event.request.destination === 'video' ||
    /\.(jpe?g|png|gif|webp|svg|avif|ico|bmp|mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url.pathname)
  );

  if (isExternalMedia) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Estrategia Cache-First para el resto de recursos
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Almacenar solo respuestas válidas
        if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
          return networkResponse;
        }

        // Excluir recursos multimedia externos del almacenamiento dinámico en caché para evitar QuotaExceededError en navegadores WebKit
        const contentType = networkResponse.headers.get('content-type') || '';
        const isExternalMediaResponse = url.origin !== self.location.origin && (
          contentType.startsWith('image/') ||
          contentType.startsWith('video/')
        );

        if (!isExternalMediaResponse) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch(() => {});
          });
        }

        return networkResponse;
      });
    })
  );
});