/* =========================================================
   Service Worker — To-Do-List
   Objectif : éviter les versions figées (Safari/iOS/iPadOS)

   À FAIRE À CHAQUE DÉPLOIEMENT IMPORTANT :
   ➜ Incrémenter CACHE_VERSION (ex: "2026-04-22.1" -> "2026-04-22.2")

   Stratégies :
   - Navigations (index.html) : NETWORK FIRST (anti-cache)
   - Ressources (js/css/images/fonts) : STALE-WHILE-REVALIDATE
   - Autres GET same-origin : CACHE FIRST
   - Nettoyage des anciens caches + prise de contrôle immédiate
   ========================================================= */

const CACHE_VERSION = "2026-04-22.1";

const PRECACHE = `precache-${CACHE_VERSION}`;
const RUNTIME  = `runtime-${CACHE_VERSION}`;

// Liste minimale pour démarrer + offline
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

// Petite aide : déterminer si une requête est "un fichier" (asset) qu'on veut mettre en cache runtime
function isCacheableAsset(request) {
  // destination peut être: "script", "style", "image", "font", etc.
  const dest = request.destination;
  return dest === "script" || dest === "style" || dest === "image" || dest === "font";
}

// Petite aide : normaliser une URL pour éviter de créer un cache différent pour ?v=...
function stripSearch(urlString) {
  const u = new URL(urlString);
  // On enlève la query pour éviter le cache dupliqué, SAUF si c'est sw.js lui-même
  if (!u.pathname.endsWith("/sw.js") && !u.pathname.endsWith("sw.js")) {
    u.search = "";
  }
  return u.toString();
}

self.addEventListener("install", (event) => {
  // Active tout de suite la nouvelle version du SW [1](https://stackoverflow.com/questions/17695497/can-i-use-icloud-api-in-web-application)
  self.skipWaiting();

  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);

    // On force un fetch "fresh" des fichiers du coeur (bypass du cache HTTP)
    // pour éviter Safari qui garde des réponses trop longtemps.
    const freshRequests = CORE_ASSETS.map((p) => new Request(p, { cache: "reload" }));
    await cache.addAll(freshRequests);
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Supprime les anciens caches
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => {
        if (k !== PRECACHE && k !== RUNTIME) return caches.delete(k);
      })
    );

    // Prend le contrôle immédiatement des pages ouvertes [2](https://www.techbloat.com/how-to-fix-icloud-keychain-problems-in-safari-on-ios-and-mac.html)
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // On ne gère que le GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 1) NAVIGATIONS : NETWORK FIRST (anti "site figé")
  // Safari/PWA reste souvent bloqué sur un index.html en cache, donc on force le réseau d'abord.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const netRes = await fetch(req);

        // Mettre à jour le cache avec la réponse la plus récente
        const cache = await caches.open(PRECACHE);
        await cache.put("./index.html", netRes.clone());

        return netRes;
      } catch (e) {
        // Offline: fallback sur index en cache
        const cached = await caches.match("./index.html");
        if (cached) return cached;

        // Dernier recours: page minimale
        return new Response(
          "<!doctype html><meta charset='utf-8'><title>Hors ligne</title><h1>Hors ligne</h1><p>Reconnecte-toi puis recharge.</p>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
    })());
    return;
  }

  // 2) Si pas same-origin, on laisse le réseau gérer
  if (!sameOrigin) return;

  // URL normalisée (pour éviter les doublons dus à ?v=xxx)
  const normalizedUrl = stripSearch(req.url);

  // 3) ASSETS (js/css/images/fonts) : stale-while-revalidate
  if (isCacheableAsset(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const cached = await cache.match(normalizedUrl);

      // On lance une mise à jour en arrière-plan
      const fetchPromise = fetch(req).then(async (res) => {
        // On ne cache que les réponses OK
        if (res && res.ok) {
          await cache.put(normalizedUrl, res.clone());
        }
        return res;
      }).catch(() => null);

      // Si cache dispo, on renvoie cache tout de suite
      if (cached) {
        // mais on "laisse" fetchPromise se faire
        fetchPromise.catch(() => {});
        return cached;
      }

      // sinon on attend le réseau
      const netRes = await fetchPromise;
      if (netRes) return netRes;

      // fallback: si vraiment rien
      return new Response("", { status: 504, statusText: "Offline" });
    })());
    return;
  }

  // 4) Autres requêtes GET : cache-first simple
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME);
    const cached = await cache.match(normalizedUrl);
    if (cached) return cached;

    try {
      const netRes = await fetch(req);
      if (netRes && netRes.ok) {
        await cache.put(normalizedUrl, netRes.clone());
      }
      return netRes;
    } catch (e) {
      return new Response("", { status: 504, statusText: "Offline" });
    }
  })());
});
