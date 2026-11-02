// The Stats tab: the stats table, run history, Data Catalog grid and the share card.
// Loaded the first time the tab is opened.
import { createHistoryChart } from "./widgets.js";

export function createStats({ E, state, fmt, fmtDuration, esc, $ }) {
  const histChart = createHistoryChart($("hist"), (v) => fmt(v));

  function buildAch() {
    const icon = (a) => (a.id.startsWith("own_") ? E.PRODUCERS.find((p) => a.id.startsWith(`own_${p.id}_`))?.icon : { rows: "🗄️", clicks: "👆", cols: "🧱", incidents: "🚨", replat: "💡", acq: "📈", contact: "👽", bangs: "🌀", chal: "🏁", env: "🗺️", combo: "🔥", speed: "⏱️", night: "🌙", full: "🧩", no: "🙌", online: "🌱", rate: "🚿" }[a.id.split("_")[0]]);
    // Secrets stay out of the grid (and the count) until earned, so nobody can tell how many exist.
    const list = E.ACHIEVEMENTS.filter((a) => !a.secret || state().ach.includes(a.id));
    $("ach").innerHTML = list.map((a) => {
      const got = state().ach.includes(a.id);
      // "Click Me" looks like any other locked entry; players find it by poking around.
      const plain = a.id === "clickme" && !got;
      const title = got ? `${a.name}: ${a.desc}` : plain ? "Locked" : `??? — ${a.desc}`;
      const glyph = a.id === "clickme" ? "👉" : a.id === "named" ? "🏷️" : a.secret ? "🕵️" : (icon(a) ?? "⭐");
      return `<button type="button" class="${got ? "got" : ""}" data-ach="${a.id}" title="${esc(title)}" aria-label="${esc(got ? a.name : "Locked")}">${plain ? "⭐" : glyph}</button>`;
    }).join("");
    $("ach-count").textContent = `${state().ach.length}/${list.length}`;
  }

  function update() {
    const now = Date.now();
    const rows = [
      ["Company", esc(state().company || "unnamed")],
      ["Rows (bank)", fmt(state().rows)],
      ["Rows this run", fmt(state().runRows)],
      ["Rows/s", fmt(E.rate(state(), now))],
      ["Per INSERT", fmt(E.clickValue(state(), now))],
      ["Global multiplier", `×${fmt(E.globalMultiplier(state()))}`],
      ["INSERTs by hand", fmt(state().clicks)],
      ["Incidents resolved", fmt(state().incidents)],
      ["Re-platforms", fmt(state().replat)],
      ["Insights", fmt(state().ins)],
      ["Acquisitions", fmt(state().acq)],
      ["Equity", fmt(state().eq)],
      ["First Contacts", fmt(state().contact)],
      ["Xenobytes", fmt(state().xeno)],
      ["Universes", fmt(state().bangs + 1)],
      ["Axioms", fmt(state().axioms)],
      ["Rows this company", fmt(state().coRows)],
      ["Rows this universe", fmt(state().allRows)],
      ["Rows ever", fmt(state().everRows)],
      ["Best rows/s", fmt(state().stats.bestRate)],
      ["Data gravity", E.rawRate(state()).gt(E.GRAVITY_AT) ? `−${(100 * (1 - E.baseRate(state()).div(E.rawRate(state())).toNumber())).toFixed(1)}% (raw ${fmt(E.rawRate(state()))}/s)` : `none below ${fmt(E.GRAVITY_AT)}/s`],
      ["Best single INSERT", fmt(state().stats.bestClick)],
      ["Longest combo", `×${state().stats.bestCombo}`],
      ["Fastest re-platform", state().stats.fastestReplat ? fmtDuration(state().stats.fastestReplat / 1000) : "—"],
      ["Fastest acquisition", state().stats.fastestAcq ? fmtDuration(state().stats.fastestAcq / 1000) : "—"],
      ["Longest time away", fmtDuration(state().stats.longestAway / 1000)],
      ["Time played", fmtDuration(state().stats.onlineMs / 1000)],
      ["Challenges completed", fmt(state().chalWins)],
      ["Emails received", fmt(state().inbox.length)],
      ["This run", fmtDuration((now - state().runStartedAt) / 1000)],
      ["Playing since", new Date(state().startedAt).toLocaleDateString()],
      ["Offline cap", fmtDuration(E.offlineCapSecs(state()))],
      ...(state().modified ? [["Save", "modified: plays normally, not ranked"]] : []),
    ];
    const html = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
    if ($("stats").innerHTML !== html) $("stats").innerHTML = html;
    updateHistory(now);
  }

  const RUN_NAMES = { replat: ["💡", "Re-platform"], acq: ["📈", "Acquisition"], contact: ["👽", "First Contact"], bang: ["🌀", "Big Bang"], catalog: ["🎉", "Catalog Everything"] };
  function updateHistory(now) {
    const { pts, runs } = state().hist;
    $("hist").hidden = pts.length < 2;
    if (pts.length >= 2) {
      histChart.draw(pts, runs, now);
      $("hist").setAttribute("aria-label", `Production over time: from ${fmt(E.big(10).pow(pts[0][1]))} to ${fmt(E.big(10).pow(pts.at(-1)[1]))} rows per second.`);
    }
    const html = runs.slice(-8).reverse().map((r) => {
      const [icon, name] = RUN_NAMES[r.layer];
      return `<li><span aria-hidden="true">${icon}</span><span>${name}</span><b>${fmtDuration(r.ms / 1000)}</b><span class="when">${fmtDuration((now - r.at) / 1000)} ago</span></li>`;
    }).join("");
    if ($("runs").innerHTML !== html) $("runs").innerHTML = html;
  }

  // A picture of the run for posting. Drawn on demand by sharecard.js, which loads only now.
  async function shareCard(button) {
    const label = button.textContent;
    button.disabled = true;
    try {
      const { makeShareCard } = await import("./sharecard.js");
      const now = Date.now();
      const prestiges = [["💡", state().replat], ["📈", state().acq], ["👽", state().contact], ["🌀", state().bangs]].filter(([, n]) => n > 0);
      const blob = await makeShareCard({
        company: state().company,
        rows: fmt(state().everRows),
        rate: fmt(E.rate(state(), now)),
        env: E.environmentFor(state()).name,
        hue: E.environmentFor(state()).hue,
        tiles: [
          ["sources", fmt(state().prod.reduce((a, b) => a + b, 0))],
          ["catalog entries", String(state().ach.length)],
          ["playing for", fmtDuration((now - state().playthroughStartedAt) / 1000)],
          ["playthroughs", String(state().completions + (E.canCatalog(state()) ? 1 : 0))],
        ],
        prestiges,
        url: "rowstoriches.drumandbytes.dev",
      });
      const file = new File([blob], "rows-to-riches.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "Rows to Riches", text: "My data team so far. https://rowstoriches.drumandbytes.dev/" });
      else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "rows-to-riches.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      }
    } catch {
      /* cancelled, or the browser can't share files */
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }
  $("share-card").addEventListener("click", (e) => shareCard(e.currentTarget));

  return { update, buildAch };
}
