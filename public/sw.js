const CACHE = "callista-shell-v1";
const base = new URL("./", self.location).href;
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch(base, { cache: "reload" });
      if (!response.ok) throw new Error("App shell unavailable");
      const html = await response.clone().text();
      const assets = [
        ...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g),
      ].map((match) => new URL(match[1], base).href);
      await cache.addAll([
        ...assets,
        new URL("manifest.webmanifest", base).href,
        new URL("icons/icon-192.png", base).href,
        new URL("icons/icon-512.png", base).href,
        new URL("icons/icon-maskable.png", base).href,
        new URL("brand/callista-mark.png", base).href,
      ]);
      await cache.put(base, response);
    })(),
  );
  // A new version waits until open tabs close; never reload an active recording.
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      await Promise.all(
        (await caches.keys())
          .filter((key) => key.startsWith("callista-shell-") && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (event.request.mode === "navigate")
        return (await cache.match(base)) || fetch(event.request);
      // These are same-origin, immutable build assets. Preview servers may add Vary: Origin;
      // the install request and a module-script request use different Origin headers.
      return (
        (await cache.match(event.request, { ignoreVary: true })) ||
        fetch(event.request)
      );
    })(),
  );
});
