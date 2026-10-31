// Per-device preferences (volumes, quality, notation). Kept out of the save so a phone
// and a desktop can differ, and never synced to the cloud.

const KEY = "r2r.prefs";
const DEFAULTS = { master: 0.7, sfx: 0.6, music: 0.35, muted: false, quality: "high", notation: "suffix", clock: "auto", mood: "auto",
  // Motion and pop-ups (Settings → Display).
  motion: matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full",
  particles: true, shake: true, sceneMode: "animated", toasts: "all", querylog: true, tourDone: false, skipChalConfirm: false, seenVersion: "",
  // Anonymous gameplay stats (no cookies, no ids); off with Global Privacy Control too.
  stats: true };

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export const prefs = load();

export function setPref(key, value) {
  prefs[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode: prefs last until reload */
  }
}
