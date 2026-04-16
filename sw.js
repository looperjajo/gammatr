/**
 * @file sw.js
 * @description Service Worker de GammaTR.
 * Estrategia: Cache First para assets estáticos, Network First para datos.
 * Permite uso offline parcial (UI carga, datos en vivo no disponibles).
 */

const CACHE_NAME = 'gammatr-v1.0.1';

// Assets a cachear en la instalación
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/state.js',
  './js/app.js',
  './js/binance.js',
  './js/indicators.js',
  './js/signals.js',
  './js/gemini.js',
  './js/supabase.js',
  './js/alerts.js',
  './js/ui.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // CDN resources (se cachean en runtime)
];

// URLs externas a cachear en runtime
const CDN_ORIGINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net'
];

// ===== INSTALACIÓN =====
self.addEventListener('install', event => {
  console.log('[SW] Instalando GammaTR v1.0.1...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cachear assets estáticos ignorando los que fallen (CDN)
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] No se pudo cachear:', url, err))
        )
      );
    }).then(() => {
      console.log('[SW] Assets cacheados correctamente');
      return self.skipWaiting(); // Activar inmediatamente
    })
  );
});

// ===== ACTIVACIÓN =====
self.addEventListener('activate', event => {
  console.log('[SW] Activando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      // Eliminar caches de versiones anteriores
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Eliminando cache antiguo:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ===== FETCH: estrategia híbrida =====
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar WebSocket ni API calls de datos en vivo
  if (request.url.includes('stream.binance.com') ||
      request.url.includes('api.binance.com') ||
      request.url.includes('generativelanguage.googleapis.com') ||
      request.url.includes('supabase.co')) {
    return; // Dejar pasar sin caché
  }

  // CDN y fuentes: Cache First con fallback a network
  const isCDN = CDN_ORIGINS.some(origin => url.hostname.includes(origin));
  if (isCDN) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Assets locales: Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }
});

/**
 * @description Estrategia Cache First: devuelve del caché si existe,
 * si no hace fetch y cachea la respuesta.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Solo cachear respuestas exitosas
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline: devolver página de fallback si existe
    if (request.destination === 'document') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

// ===== PUSH NOTIFICATIONS (futuro) =====
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body || 'Nueva alerta de GammaTR',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || './' },
    actions: [
      { action: 'open', title: 'Ver ahora' },
      { action: 'dismiss', title: 'Descartar' }
    ]
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'GammaTR', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || './';
  event.waitUntil(clients.openWindow(url));
});
