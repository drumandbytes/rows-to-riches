// Anonymous gameplay stats. No cookies and no identifiers of any kind: each event is an
// event name, coarse context (environment, phone or desktop, new or returning) and a few
// numbers about the save. Off when the player opts out or the browser sends Global
// Privacy Control / Do Not Track.

import { prefs } from "./prefs.js";

const startedAt = Date.now();

export const allowed = () => prefs.stats !== false && !navigator.globalPrivacyControl && navigator.doNotTrack !== "1";

/** `s` is the save; `extra` may carry { detail } (e.g. which challenge). */
export function track(event, s, extra = {}) {
  if (!allowed()) return;
  const body = {
    e: event,
    env: s.settings.env ?? "localhost",
    device: matchMedia("(pointer: coarse)").matches ? "mobile" : "desktop",
    // "Returning" is worked out from the local save; only the flag leaves the browser.
    visitor: s.stats.onlineMs > 10 * 60_000 ? "returning" : "new",
    notation: prefs.notation,
    detail: extra.detail ?? "",
    sessionSecs: Math.round((Date.now() - startedAt) / 1000),
    playHours: Math.round((s.stats.onlineMs / 3.6e6) * 100) / 100,
    log10Rows: Math.round(Math.log10(s.everRows + 1) * 10) / 10,
    replat: s.replat,
    acq: s.acq,
    contact: s.contact,
    bangs: s.bangs,
    ach: s.ach.length,
    chalWins: s.chalWins,
    quarters: s.stats.quarters,
  };
  const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
  // sendBeacon survives the page closing; it sends no cookies because there are none.
  if (!navigator.sendBeacon?.("/api/t", blob)) fetch("/api/t", { method: "POST", body: blob, keepalive: true }).catch(() => {});
}
