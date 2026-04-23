/* ================================
   Service Worker – To Do List
   Version : v1.0.0
   IMPORTANT : incrémenter CACHE_VERSION à chaque changement
   ================================ */

const CACHE_VERSION = "v1.0.0";  // ⬅️ CHANGE CE NUMÉRO À CHAQUE UPDATE
const CACHE_NAME = `todo-cache-${CACHE_VERSION}`;

// Fichiers essentiels
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

// Installation : nouveau cache
self.addEventListener("install", (event) => {
  self.skipWaiting(); // force l’activation immédiate
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    })
  );
});

// Activation : suppression des anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch :
// - index.html → network first (évite de rester bloqué)
// - le reste → cache first
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Toujours essayer le réseau pour la page principale
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put("./index.html", copy);
          });
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Autres ressources
  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req);
    })
  );
});
