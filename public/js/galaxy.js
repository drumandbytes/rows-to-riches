// galaxy.click cloud saves (https://galaxy.click/docs/dev/features/saving). When the game
// is embedded there, galaxy keeps saves for signed-in players, so they get cloud saves
// without our account codes (galaxy doesn't allow a login in the embed). Messages go to
// window.top with galaxy's origin as the target, so anywhere else they're simply dropped.

const ORIGIN = "https://galaxy.click";
const AUTOSAVE_SLOT = 0; // galaxy's convention: 0 is the autosave, 1–10 are manual
const AUTOSAVE_MS = 60e3;

/** onCloudAhead({ raw, sealed }) returns true when it asks the player (then call resume()). */
export function createGalaxySaves({ state, encodeSave, decodeSave, summary, onCloudAhead, toast, target = window.top, source = window }) {
  let signedIn = true; // until galaxy says no_account
  // No autosave until galaxy's copy has been compared with this browser's: a fresh browser
  // would otherwise overwrite a player's cloud save before they could load it.
  let ready = false;
  let lastSave = 0;
  const post = (msg) => target.postMessage(msg, ORIGIN);

  function save(force = false) {
    if (!signedIn || !ready || (!force && Date.now() - lastSave < AUTOSAVE_MS)) return;
    lastSave = Date.now();
    post({ action: "save", slot: AUTOSAVE_SLOT, label: "Autosave", summary: summary(state()), data: encodeSave(state()) });
  }

  function onMessage(e) {
    if (e.origin !== ORIGIN || e.source !== target) return;
    const m = e.data;
    if (m?.message === "no_account") {
      signedIn = false;
      return;
    }
    if (m?.type === "saved" && m.error) {
      if (m.message === "too_big") toast("galaxy.click couldn't store this save: it's too big.", "info");
      return;
    }
    if (m?.type !== "save_content" || m.slot !== AUTOSAVE_SLOT) return;
    let asking = false;
    if (!m.error && typeof m.content === "string") {
      try {
        asking = onCloudAhead(decodeSave(m.content));
      } catch {
        /* not one of our saves */
      }
    }
    // An empty slot or an older save: autosave from now on. Otherwise wait for the answer.
    if (!asking) ready = true;
  }

  return {
    /** Announces saving support, then asks for the autosave to compare with this browser's. */
    start() {
      source.addEventListener("message", onMessage);
      post({ action: "supports", saving: true, eval: false });
      post({ action: "load", slot: AUTOSAVE_SLOT });
    },
    save,
    /** After the player answered the "galaxy save is ahead" prompt. */
    resume() {
      ready = true;
      save(true);
    },
  };
}
