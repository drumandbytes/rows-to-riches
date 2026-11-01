// Service worker: makes the game installable and playable offline. The game is local-first
// already, so caching the app shell is all it takes.
//
// Network-first for everything same-origin: online you always get the latest deploy (the
// server sends no-cache anyway); offline the last good copy is served. /api/* is never
// cached, and cross-origin requests (fonts, analytics) are left to the browser.

const CACHE = "r2r-shell-v2";
const SHELL = [
  "/",
  "/style.css",
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  ...["jetbrains-mono", "space-grotesk"].map((f) => `/fonts/${f}-latin-wght-normal.woff2`),
  ...["main", "economy", "format", "flavor", "scene", "widgets", "sync", "prefs", "audio", "music", "erd", "active", "analytics", "tour", "push", "big", "vendor/break_infinity"].map((m) => `/js/${m}.js`),
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Only cache clean URLs, so one page never ends up cached under many query strings.
        if (res.ok && !url.search) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) ?? (req.mode === "navigate" ? caches.match("/") : Response.error())),
  );
});

// Scheduled notifications (opt-in). Pushes have no payload: the page left the plan in Cache
// Storage when it was hidden, so show whatever in it is due. Tags keep a repeat from stacking.
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const res = await (await caches.open("r2r-push")).match("/push-plan");
      const plan = res ? await res.json() : [];
      const due = plan.filter((e) => e.at <= Date.now() + 60_000);
      const show = due.length ? due : [{ kind: "cap", body: "Your pipelines miss you." }];
      await Promise.all(show.map((e) => self.registration.showNotification("Rows to Riches", { body: e.body, icon: "/icon-192.png", tag: e.kind })));
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => list.find((c) => new URL(c.url).origin === self.location.origin)?.focus() ?? self.clients.openWindow("/")),
  );
});
