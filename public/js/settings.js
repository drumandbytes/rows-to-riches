// The Settings tab's own wiring: company name, auto-buyer options, notifications, account code, export and
// import. Loaded the first time the tab is opened.
import * as E from "./economy.js";
import * as sync from "./sync.js";
import { encodeSave, decodeSave } from "./seal.js";
import { pushAvailable, initPush, enablePush, disablePush } from "./push.js";

export function createSettings({ state, prefs, setPref, $, esc, modal, toast, saveLocal, render, pushCloud, codeSignIn, replaceState, fromSave, autoBuyerOwned, gitopsOwned, grantSecret }) {
  function update() {
    if (document.activeElement !== $("opt-company")) $("opt-company").value = state().company;
    const bots = { radar: (state().board.radarbot ?? 0) > 0, board: (state().xeno_tech.boardbot ?? 0) > 0, xeno: state().bangs >= 1, bang: state().bangs >= 100 };
    const automation = autoBuyerOwned() || E.boardLevel(state(), "autoreplat") || bots.radar || bots.board || bots.xeno;
    $("auto-none").hidden = !!automation;
    $("auto-wrap").hidden = !autoBuyerOwned();
    $("auto-gitops").hidden = !gitopsOwned();
    $("auto-gitops-hint").hidden = gitopsOwned() || !autoBuyerOwned();
    const set = state().settings;
    $("opt-auto-sources").checked = set.autoSources;
    $("opt-auto-strategy").value = set.autoStrategy;
    $("opt-auto-upgrades").checked = set.autoUpgrades;
    $("opt-upg-strategy").value = set.upgStrategy;
    $("opt-auto-columns").checked = set.autoColumns;
    $("autoreplat-wrap").hidden = !E.boardLevel(state(), "autoreplat");
    for (const k of ["radar", "board", "xeno", "bang"]) {
      $(`auto-${k}-wrap`).hidden = !bots[k];
      $(`opt-auto-${k}`).checked = set[`auto${k[0].toUpperCase()}${k.slice(1)}`];
    }
    $("chal-confirm-wrap").hidden = !state().chalEver.length;
    $("opt-chal-confirm").checked = !prefs.skipChalConfirm;
    if (document.activeElement !== $("opt-autoreplat")) $("opt-autoreplat").value = state().settings.autoReplatAt;
    const box = $("cloud");
    const signedIn = sync.session.token ? "in" : "out";
    if (box.dataset.state === signedIn) return;
    box.dataset.state = signedIn;
    box.innerHTML = sync.session.token
      ? `<p>Signed in with an account code. Progress syncs every minute and when you leave the page.</p>
         <div class="row-buttons"><button type="button" id="sync-now">Sync now</button><button type="button" id="new-code">🔑 Get a new account code</button><button type="button" id="sign-out">Sign out</button><button type="button" class="danger" id="delete-account">Delete account</button></div>
         <p class="muted" id="sync-status"></p>`
      : `<p class="muted">Play on several devices with an <b>account code</b>: no email, no password. Create one here, then enter it on your other devices.</p>
         <div class="row-buttons"><button type="button" class="primary" id="create-code">🔑 Create an account code</button></div>
         <form class="cloud-form" id="code-form"><input type="text" id="code-input" required autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="R2R-XXXX-XXXX-XXXX-XXXX-XXXX" aria-label="Account code" />
         <button type="submit">Sign in with code</button><p class="muted" id="code-status"></p></form>`;
  }

  function showCode(code, fresh) {
    const link = `${location.origin}/#code=${code}`;
    modal(
      `<h2>${fresh ? "Your account code" : "Your new account code"}</h2>
       <p class="account-code" id="account-code">${esc(code)}</p>
       <p>Enter it on your other devices under Settings → Save. Write it down or keep it in your password manager: <b>this is the only time it's shown</b>, and nothing else can recover it.</p>
       ${fresh ? "" : `<p class="muted">The old code no longer works. Devices already signed in stay signed in.</p>`}
       <div class="row-buttons"><button type="button" id="copy-code">📋 Copy code</button><button type="button" id="copy-link">🔗 Copy sign-in link</button>${navigator.share ? `<button type="button" id="share-code">📤 Share</button>` : ""}</div>
       <p class="muted">Anyone with the code or link can play this save, so share it only with your own devices.</p>`,
      [["I've saved it", "primary"]],
    );
    const copy = async (text, btn) => {
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "✅ Copied";
      } catch {
        getSelection().selectAllChildren($("account-code"));
      }
    };
    $("copy-code").onclick = (e) => copy(code, e.currentTarget);
    $("copy-link").onclick = (e) => copy(link, e.currentTarget);
    if ($("share-code")) $("share-code").onclick = () => navigator.share({ title: "Rows to Riches account code", text: code, url: link }).catch(() => {});
  }

  // The offline notification toggle only shows where both the browser and the server support it.
  pushAvailable().then(async (ok) => {
    if (!ok) return;
    $("push-wrap").hidden = false;
    $("opt-push").checked = await initPush();
  });
  $("opt-push").addEventListener("change", async (e) => {
    e.target.disabled = true;
    if (!e.target.checked) await disablePush().catch(() => {});
    else if (!(await enablePush().catch(() => false))) {
      e.target.checked = false;
      toast(Notification.permission === "denied" ? "Notifications are blocked for this site in your browser's settings." : "This browser couldn't turn on notifications.", "info");
    }
    e.target.disabled = false;
  });

  $("opt-company").addEventListener("change", (e) => {
    state().company = E.cleanCompany(e.target.value);
    e.target.value = state().company;
    saveLocal();
    if (state().company) toast(`🏷️ Welcome to <b>${esc(state().company)}</b>.`);
    render(true);
  });

  // Read the Docs: every Help section opened at least once this session.
  const helpOpened = new Set();
  for (const d of document.querySelectorAll(".help details")) {
    d.addEventListener("toggle", () => {
      if (d.open) helpOpened.add(d.querySelector("summary").textContent);
      if (helpOpened.size === document.querySelectorAll(".help details").length) grantSecret("readdocs");
    });
  }

  $("opt-autoreplat").addEventListener("change", (e) => {
    state().settings.autoReplatAt = Math.max(1.1, Number(e.target.value) || 2);
    saveLocal();
  });
  // Auto-buyer settings live in the save (they're about this game, not this device).
  for (const [id, key, kind] of [
    ["opt-auto-sources", "autoSources", "check"], ["opt-auto-upgrades", "autoUpgrades", "check"], ["opt-auto-columns", "autoColumns", "check"],
    ["opt-auto-radar", "autoRadar", "check"], ["opt-auto-board", "autoBoard", "check"], ["opt-auto-xeno", "autoXeno", "check"], ["opt-auto-bang", "autoBang", "check"],
    ["opt-auto-strategy", "autoStrategy", "value"], ["opt-upg-strategy", "upgStrategy", "value"],
  ]) {
    $(id).addEventListener("change", (e) => {
      state().settings[key] = kind === "check" ? e.target.checked : e.target.value;
      saveLocal();
      updateSettings();
    });
  }

  $("cloud").addEventListener("submit", (e) => {
    e.preventDefault();
    codeSignIn($("code-input").value, $("code-status"));
  });

  function exportSave() {
    E.tick(state(), Date.now());
    const text = encodeSave(state());
    modal(`<h2>Export save</h2><p class="muted">Copy this somewhere safe.</p><textarea readonly id="export-text">${text}</textarea>`, [
      ["Copy", "primary", () => navigator.clipboard?.writeText(text).then(() => toast("Copied."))],
      ["Close"],
    ]);
    $("export-text").select();
  }

  function importSave() {
    modal(`<h2>Import save</h2><p class="muted">Paste an exported save. This replaces progress on this device.</p><textarea id="import-text"></textarea>`, [
      ["Cancel"],
      ["Import", "primary", () => {
        try {
          const next = fromSave(decodeSave($("import-text").value));
          replaceState(next);
          toast(next.modified ? "Save imported. It's from an edited or pre-0.4 export, so it plays normally but won't be ranked." : "Save imported.");
          pushCloud({ force: true });
        } catch {
          toast("That doesn't look like a save.");
        }
      }],
    ]);
  }

  return { update, showCode, exportSave, importSave };
}
