/**
 * Service Worker PWA
 * ==================
 * 
 * Questo service worker gestisce:
 * 1. Caching delle risorse statiche per funzionamento offline
 * 2. Strategia cache-first per le risorse dell'app
 * 
 * NOTA: Le notifiche push sono gestite da OneSignalSDKWorker.js
 * Questo SW si occupa solo della funzionalità PWA base.
 */

const CACHE_NAME = 'pwa-push-v1';

// Risorse da cachare per il funzionamento offline
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/icon-192.svg',
    '/icon-512.svg'
];

/**
 * Evento Install
 * Viene eseguito quando il SW viene installato per la prima volta
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Installazione service worker...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching risorse statiche');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                // Attiva immediatamente il nuovo SW
                return self.skipWaiting();
            })
    );
});

/**
 * Evento Activate
 * Viene eseguito quando il SW diventa attivo
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Attivazione service worker...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Eliminazione cache obsoleta:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                // Prendi il controllo di tutte le pagine immediatamente
                return self.clients.claim();
            })
    );
});

/**
 * Evento Fetch
 * Intercetta tutte le richieste di rete
 * Strategia: Cache First, poi Network
 */
self.addEventListener('fetch', (event) => {
    // Ignora richieste non-GET
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Ignora richieste a OneSignal (gestite dal loro SW)
    if (event.request.url.includes('onesignal.com')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Risorsa trovata in cache
                    return cachedResponse;
                }
                
                // Non in cache, fetch dalla rete
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Non cachare risposte non valide
                        if (!networkResponse || networkResponse.status !== 200) {
                            return networkResponse;
                        }
                        
                        // Cache della risposta per uso futuro
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        
                        return networkResponse;
                    })
                    .catch(() => {
                        // Offline e non in cache - ritorna fallback se disponibile
                        console.log('[SW] Offline, risorsa non in cache:', event.request.url);
                    });
            })
    );
});

