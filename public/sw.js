const CACHE_NAME = "chikitsaak-static-v1";
const OFFLINE_URL = "/offline.html";
const OFFLINE_FALLBACK_ROUTES = new Set(["/", "/about", "/contact"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("chikitsaak-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.mode !== "navigate" ||
    !OFFLINE_FALLBACK_ROUTES.has(url.pathname)
  ) return;

  // Only explicitly allowed public routes receive the offline document. Successful
  // navigations are never cached, so authenticated HTML and private data stay out.
  event.respondWith(fetch(request).catch(async () => {
    const offline = await caches.match(OFFLINE_URL);
    return offline || Response.error();
  }));
});
