// Opt-in notifications for while the game is closed: offline cap full, challenge about to
// time out. While hidden, the server holds the schedule for this browser's push endpoint;
// coming back cancels it.

import { unb64url } from "./b64.js";

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// Kept in memory so the "hidden" request can go out synchronously while the page closes.
let endpoint = null;

const post = (body) => fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});

async function currentSub() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Whether the server has push set up; the toggle stays hidden otherwise. */
export async function pushAvailable() {
  if (!pushSupported()) return false;
  const res = await fetch("/api/push/key").catch(() => null);
  return !!res?.ok;
}

/** Restores the endpoint after a reload. Resolves to whether this browser is subscribed. */
export async function initPush() {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  endpoint = (await currentSub())?.endpoint ?? null;
  return !!endpoint;
}

export async function enablePush() {
  if ((await Notification.requestPermission()) !== "granted") return false;
  const { key } = await (await fetch("/api/push/key")).json();
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64url(key) }));
  endpoint = sub.endpoint;
  return true;
}

export async function disablePush() {
  const sub = await currentSub();
  if (sub) {
    post({ endpoint: sub.endpoint, events: [] });
    await sub.unsubscribe();
  }
  endpoint = null;
}

/** events: [{ kind, at (ms), body }], or [] to cancel. The texts go to Cache Storage, where
 *  the service worker reads them when the (payload-less) push arrives. */
export function schedulePush(events) {
  if (!endpoint) return;
  post({ endpoint, events: events.map(({ kind, at }) => ({ kind, at })) });
  if (events.length) caches.open("r2r-push").then((c) => c.put("/push-plan", Response.json(events))).catch(() => {});
}
