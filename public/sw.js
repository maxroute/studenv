// Studenv's service worker does one thing: when a page can't be loaded because
// there is no connection, it shows the offline page. It never stores pages,
// API answers or files, so signed-in content is not kept and nothing goes stale.
const CACHE = "studenv-offline-v1";
const OFFLINE_PAGE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_PAGE, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith("studenv-offline-") && name !== CACHE).map((name) => caches.delete(name)),
      );
      // Lets the page request start while the worker is still waking up.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  // Only whole-page loads; everything else goes to the network untouched.
  if (event.request.mode !== "navigate" || event.request.method !== "GET") return;

  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) || (await fetch(event.request));
      } catch (error) {
        const offline = await caches.match(OFFLINE_PAGE);
        if (offline) return offline;
        throw error;
      }
    })(),
  );
});
