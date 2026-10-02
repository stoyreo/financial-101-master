/* Financial 101 Master service worker (v3.10.0).
 * SAFETY (May 10/11 data-isolation incidents): never cache API responses, auth or
 * page HTML. Only immutable build assets and icons are cached. Bump CACHE_VERSION
 * with every release so old assets are dropped. */
const CACHE_VERSION = "v3.10.0";
const STATIC_CACHE = "f101-static-" + CACHE_VERSION;

const OFFLINE_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  "<title>Offline</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;" +
  "font-family:system-ui,sans-serif;background:#0B1330;color:#F4D27A;padding:24px;text-align:center}" +
  "p{max-width:32ch;line-height:1.5;color:#e2e8f0}button{margin-top:16px;min-height:44px;padding:0 20px;" +
  "border-radius:10px;border:0;background:#F4D27A;color:#0B1330;font-weight:600}</style></head><body><div>" +
  "<h1>You're offline</h1><p>Your plan is safe. Reconnect to see your latest numbers.</p>" +
  '<button onclick="location.reload()">Try again</button></div></body></html>';

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(["/icons/icon-192.png", "/icons/icon-512.png"])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })
      )
    );
  }
});
