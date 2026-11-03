// Service worker: makes the game installable, playable offline, and quick to open. The game is local-first
// already, so caching the app shell is all it takes.
//
// Cache-first from a cache named for the release: reopening the app answers from the cache and never waits
// on the network (a network-first worker made every launch cost as much as a first visit: all the round
// trips of the module chain, every time). A release changes this file (the version below), which is what
// makes the browser install the new shell in the background and the page offer a reload (main.js). /api/*
// and cross-origin requests are left to the browser, and so are requests that ask for no-store (the changelog).
// On localhost (dev, tests; 127.0.0.1 behaves like production) it always uses the network, so edits never meet a stale copy.

const VERSION = "0.7.7"; // x-release-please-version
const CACHE = `r2r-shell-${VERSION}`;
const DEV = self.location.hostname === "localhost";
const SHELL = [
  "/",
  "/style.css",
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  ...["jetbrains-mono", "space-grotesk"].map((f) => `/fonts/${f}-latin-wght-normal.woff2`),
  ...["main", "economy", "format", "flavor", "scene", "frames", "morph", "sharecard", "feedback", "incidents", "prestige", "settings", "stats", "walkthrough", "whatsnew", "completion", "widgets", "sync", "prefs", "audio", "music", "erd", "active", "analytics", "tour", "push", "seal", "names", "leaderboard", "b64", "big", "lib/break_infinity"].map((m) => `/js/${m}.js`),
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
  if (DEV || req.method !== "GET" || req.cache === "no-store" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ??
        fetch(req)
          .then((res) => {
            // Only cache clean URLs, so one page never ends up cached under many query strings.
            if (res.ok && !url.search) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => (req.mode === "navigate" ? caches.match("/") : Response.error())),
    ),
  );
});
