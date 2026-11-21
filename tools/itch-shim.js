// Inlined into the itch.io build before the game loads. There is no server behind itch's
// iframe, so fail the server calls the way a player who's offline would (the game already
// handles that), and don't register a service worker.
window.R2R_OFFLINE = true;
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === "string" ? input : (input && input.url) || "";
  if (url.startsWith("/api/") || url.startsWith("/CHANGELOG")) return Promise.reject(new TypeError("offline build"));
  return realFetch(input, init);
};
navigator.sendBeacon = () => true;
try { delete Navigator.prototype.serviceWorker; } catch (e) { /* keep it */ }
