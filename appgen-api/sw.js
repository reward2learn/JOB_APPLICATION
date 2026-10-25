/* Cognitive Training Lab — service worker (cache shell + offline-capable game assets). */
const CACHE = "appgen-lab-v21";
const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/manifest-chess.webmanifest",
  "/manifest-snl.webmanifest",
  "/appgen/assets/appgen-wtd.css",
  "/appgen/assets/appgen-doc.css",
  "/appgen/assets/appgen-wtd.js",
  "/appgen/assets/appgen-wtd-store.js",
  "/appgen/assets/appgen-wtd-chess.js",
  "/appgen/assets/appgen-wtd-chess-101.js",
  "/appgen/assets/appgen-wtd-chess-strategies.js",
  "/appgen/assets/appgen-wtd-chess-board-theme.js",
  "/appgen/assets/appgen-wtd-chess-scene-bg.js",
  "/appgen/assets/appgen-wtd-chess-scene-light.js",
  "/appgen/assets/appgen-wtd-chess-settings.js",
  "/appgen/assets/appgen-wtd-studio.js",
  "/appgen/assets/appgen-wtd-orbit-free.js",
  "/appgen/assets/appgen-wtd-snl.js",
  "/appgen/assets/appgen-wtd-snl-board.js",
  "/appgen/assets/appgen-wtd-snl-dice.js",
  "/appgen/assets/appgen-wtd-snl-pieces.js",
  "/appgen/assets/appgen-wtd-snl-levels.js",
  "/appgen/assets/appgen-wtd-3d.js",
  "/appgen/assets/pwa/icon-lab-192.png",
  "/appgen/assets/pwa/icon-lab-512.png",
  "/appgen/assets/pwa/icon-chess-192.png",
  "/appgen/assets/pwa/icon-chess-512.png",
  "/appgen/assets/pwa/icon-snl-192.png",
  "/appgen/assets/pwa/icon-snl-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isNavigatable(request) {
  return request.mode === "navigate" || (request.destination === "document");
}

/** WTD ES modules — cache-first can serve stale store.js vs new chess/snl (missing exports). */
function isWtdModulePath(pathname) {
  return /\/appgen\/assets\/appgen-wtd/.test(pathname);
}

function networkFirstThenCache(req) {
  return fetch(req)
    .then((res) => {
      if (res && res.status === 200 && res.type !== "opaque") {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() => caches.match(req));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for APIs (multiplayer / auth / presence).
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(JSON.stringify({ ok: false, error: "Offline", offline: true }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    return;
  }

  // Navigation: network first, fall back to cached shell.
  if (isNavigatable(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
    );
    return;
  }

  if (isWtdModulePath(url.pathname)) {
    event.respondWith(networkFirstThenCache(req));
    return;
  }

  // Static assets: cache-first, then network + cache.
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (!res || res.status !== 200 || res.type === "opaque") return res;
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      });
    })
  );
});
