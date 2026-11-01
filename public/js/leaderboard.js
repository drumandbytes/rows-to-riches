// Leaderboards, client side (server: worker/leaderboard.js). Every game silently gets a
// signed start ticket; nothing else leaves the browser until the player opts in. Then the
// sealed save goes up as a checkpoint at each milestone and every 15 minutes.

import { randomName } from "./names.js";
import { Decimal } from "./big.js";

const CHECKPOINT_MS = 15 * 60e3;
const BOARD_LABELS = { fastest: "🏁 Fastest Catalog", rows: "📈 Most rows", bangs: "🌀 Most Big Bangs", catalogs: "📚 Most Catalogs" };

export function createLeaderboard({ state, encodeSave, fmt, fmtDuration, esc, toast, $ }) {
  let available = false;
  let board = "fastest";
  let lastSent = 0;
  let lastMilestones = -1;
  let stopped = ""; // why checkpoints stopped this session (a refused save), if they did
  let asking = false;

  const post = (path, body) =>
    fetch(`/api/lb/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }))
      .catch(() => ({ status: 0, data: {} }));

  // The ticket's payload is readable (only its signature is secret): late = issued mid-game.
  const ticketInfo = (t) => {
    try {
      return JSON.parse(atob(t.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
    } catch {
      return {};
    }
  };

  async function ensureTicket() {
    const s = state();
    if (s.lb.ticket || asking) return;
    asking = true;
    // A brand-new game gets a ticket that counts for the fastest board; anything further
    // along is "late" and counts for the others only.
    const fresh = s.everRows.lt(1000) && s.replat + s.acq + s.contact + s.bangs + s.completions === 0;
    const r = await post("ticket", { fresh });
    asking = false;
    if (r.data.ticket && !state().lb.ticket) state().lb.ticket = r.data.ticket;
  }

  async function checkpoint() {
    const s = state();
    if (!available || !s.lb.optIn || !s.lb.ticket || s.modified || stopped) return;
    lastSent = Date.now();
    if (!s.lb.name) s.lb.name = randomName();
    let r = await post("checkpoint", { ticket: s.lb.ticket, save: encodeSave(s), name: s.lb.name });
    // Names are unique: a taken one (rare, ~1.2M of them) quietly becomes another.
    for (let tries = 0; r.status === 409 && tries < 5; tries++) {
      s.lb.name = randomName();
      r = await post("checkpoint", { ticket: s.lb.ticket, save: encodeSave(s), name: s.lb.name });
    }
    if (r.status === 200) {
      Object.assign(state().lb, { name: r.data.name, locked: true });
      boardCache.key = ""; // our own entry just changed
      if (!$("pane-stats").hidden) render(true);
    } else if (r.status === 422 || r.status === 400) {
      stopped = r.data.error ?? "The server refused this save.";
      toast(`🏁 ${esc(stopped)}`, "info");
      render();
    }
  }

  let boardCache = { key: "", at: 0, data: null };
  async function loadBoard(force) {
    const me = ticketInfo(state().lb.ticket).n ?? "";
    const key = `${board}:${me}`;
    if (!force && boardCache.key === key && Date.now() - boardCache.at < 60e3) return boardCache.data;
    const r = await fetch(`/api/lb/board?b=${board}&me=${encodeURIComponent(me)}`).then((x) => x.json()).catch(() => null);
    boardCache = { key, at: Date.now(), data: r };
    return r;
  }

  const showValue = (v) => (board === "fastest" ? fmtDuration(v / 1000) : board === "rows" ? `${fmt(Decimal.pow(10, v))} rows` : fmt(v));
  const row = (r) => `<li class="${r.me ? "me" : ""}"><span class="lb-rank">#${r.rank}</span><span class="lb-name">${esc(r.name)}${r.me ? " (you)" : ""}</span><span class="lb-value">${showValue(r.value)}</span></li>`;

  async function render(fetchBoard = false) {
    const el = $("lb");
    el.hidden = !available;
    if (!available) return;
    const s = state();
    const late = ticketInfo(s.lb.ticket).late;
    const notes = [
      s.modified && "This save was modified, so it can't be ranked.",
      stopped,
      s.lb.optIn && late && "This game was already underway when it got its ticket, so it isn't on the Fastest Catalog board. A new game is.",
    ].filter(Boolean);
    $("lb-join").checked = s.lb.optIn;
    $("lb-join").disabled = s.modified;
    $("lb-name").innerHTML = s.lb.optIn
      ? `Listed as <b>${esc(s.lb.name || "…")}</b>${s.lb.locked ? "" : ' <button type="button" class="linkish" id="lb-reroll">another name</button>'}`
      : "";
    $("lb-notes").innerHTML = notes.map((n) => `<p class="muted">${esc(n)}</p>`).join("");
    $("lb-remove").hidden = !s.lb.locked;
    for (const b of $("lb-boards").querySelectorAll("button")) b.classList.toggle("on", b.dataset.board === board);
    if (!fetchBoard) return;
    const data = await loadBoard(fetchBoard === "force");
    const top = data?.top ?? [];
    $("lb-list").innerHTML = top.length
      ? top.map(row).join("") + (data.me ? `<li class="lb-gap">⋯</li>${row(data.me)}` : "")
      : `<li class="muted">Nobody here yet. ${board === "fastest" ? "Be the first to Catalog Everything." : "Join, and you're on it."}</li>`;
  }

  function wire() {
    $("lb-boards").innerHTML = Object.entries(BOARD_LABELS).map(([k, l]) => `<button type="button" data-board="${k}">${l}</button>`).join("");
    $("lb-boards").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-board]");
      if (!b) return;
      board = b.dataset.board;
      render(true);
    });
    $("lb-join").addEventListener("change", (e) => setOptIn(e.target.checked));
    $("lb-name").addEventListener("click", (e) => {
      if (e.target.id !== "lb-reroll") return;
      state().lb.name = randomName();
      render();
    });
    $("lb-remove").addEventListener("click", async () => {
      const s = state();
      const r = await post("remove", { ticket: s.lb.ticket });
      if (r.status !== 200) return toast("Couldn't reach the leaderboard. Try again later.", "info");
      Object.assign(s.lb, { optIn: false, locked: false, name: "" });
      boardCache.key = "";
      toast("🏁 You've been removed from the leaderboards.");
      render("force");
    });
  }

  function setOptIn(on) {
    const s = state();
    s.lb.optIn = on && !s.modified;
    if (s.lb.optIn && !s.lb.name) s.lb.name = randomName();
    render();
    if (s.lb.optIn) checkpoint();
  }

  return {
    get available() {
      return available;
    },
    async init() {
      const r = await fetch("/api/lb/board?b=fastest").catch(() => null);
      available = !!r?.ok;
      if (!available) return;
      wire();
      await ensureTicket();
      render();
    },
    setOptIn,
    render,
    /** From the game loop: a ticket for new games, checkpoints at milestones and every 15 min. */
    tick(s) {
      if (!available) return;
      if (!s.lb.ticket) return void ensureTicket();
      const milestones = s.acq + s.contact + s.bangs + s.completions;
      const due = milestones !== lastMilestones || Date.now() - lastSent > CHECKPOINT_MS;
      if (lastMilestones === -1) lastMilestones = milestones;
      else if (due) {
        lastMilestones = milestones;
        checkpoint();
      }
    },
  };
}
