/* =========================================================
   Service Worker — To-Do-List (version claire)
   Objectif : éviter les versions figées sur Safari/iOS/iPadOS

   À CHAQUE DÉPLOIEMENT IMPORTANT :
   ➜ incrémente CACHE_VERSION (ex: "2026-04-22.1" -> "2026-04-22.2")
   ========================================================= */

const CACHE_VERSION = "2026-04-22.2";

const CACHE_CORE = `core-${CACHE_VERSION}`;
const CACHE_ASSETS = `assets-${CACHE_VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

// 1) INSTALL : mettre en cache le minimum + activer tout de suite
self.addEventListener("install", (event) => {
  self.skipWaiting(); // active immédiatement le nouveau SW [1](https://tanaschita.com/ios-sf-symbols/)

  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_CORE);
    // cache: "reload" = demande une version fraîche (utile pour Safari)
    await cache.addAll(CORE_ASSETS.map((p) => new Request(p, { cache: "reload" })));
  })());
});

// 2) ACTIVATE : supprimer les anciens caches + prendre le contrôle tout de suite
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => {
        if (k !== CACHE_CORE && k !== CACHE_ASSETS) return caches.delete(k);
      })
    );
    await self.clients.claim(); // contrôle immédiat des pages ouvertes 
  })());
});

// 3) FETCH :
// - Navigation (index.html) : NETWORK FIRST (anti-cache)
// - Assets (js/css/images/fonts) : cache puis mise à jour en arrière-plan
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // A) NAVIGATION : NETWORK FIRST (c'est LE correctif anti "figé")
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        // Met à jour index.html dans le cache core
        const cache = await caches.open(CACHE_CORE);
        await cache.put("./index.html", res.clone());
        return res;
      } catch {
        // offline : retourne le cache
        const cached = await caches.match("./index.html");
        return cached || new Response("Hors ligne", { status: 503 });
      }
    })());
    return;
  }

  // On ne gère que le même domaine (sinon on laisse au réseau)
  if (!sameOrigin) return;

  const dest = req.destination;
  const isAsset = (dest === "script" || dest === "style" || dest === "image" || dest === "font");

  // B) ASSETS : cache d'abord, mais on met à jour en arrière-plan
  if (isAsset) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_ASSETS);
      const cached = await cache.match(req);

      const update = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);

      return cached || (await update) || new Response("", { status: 504 });
    })());
    return;
  }

  // C) Autres GET : cache-first simple
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_ASSETS);
    const cached = await cache.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      if (res && res.ok) await cache.put(req, res.clone());
      return res;
    } catch {
      return new Response("", { status: 504 });
    }
  })());
});
