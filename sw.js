/* ==========================================================
   Argus — service worker (rend l'application installable et
   utilisable hors-ligne pour sa coquille).

   PRINCIPE (important) :
    - On met en cache la COQUILLE (HTML, CSS, JS, icônes) ;
    - on ne met JAMAIS en cache /api/* : les réponses de
      l'agent doivent toujours venir du serveur (fraîches).
   ========================================================== */
'use strict';

const CACHE = 'argus-coquille-v5';
const COQUILLE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/style.css',
  '/assets/app.js',
  '/assets/icone-192.png',
  '/assets/icone-512.png',
  '/assets/icone-maskable-192.png',
  '/assets/icone-maskable-512.png',
  '/assets/apple-touch-icon.png',
  '/assets/demo/plan-vauban.svg',
  '/assets/demo/facade-garibaldi.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 1. Jamais de cache pour l'API ni les fichiers de l'utilisateur : réseau direct.
  if (req.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/fichiers/')) {
    return;
  }

  // 2. Hors domaine (ex. Google Fonts) : on laisse le navigateur faire.
  if (url.origin !== self.location.origin) return;

  // 3. Coquille : cache d'abord (instantané), puis réseau en arrière-plan.
  e.respondWith(
    caches.match(req).then((enCache) => {
      const reseau = fetch(req).then((rep) => {
        if (rep && rep.ok) {
          const copie = rep.clone();
          caches.open(CACHE).then((c) => c.put(req, copie));
        }
        return rep;
      }).catch(() => enCache);
      return enCache || reseau;
    })
  );
});
