import * as E from "./economy.js";
import { fmt, fmtDuration, setNotation, NOTATIONS } from "./format.js";
import { prefs, setPref } from "./prefs.js";
import * as audio from "./audio.js";
import { TICKER, OFFLINE_JOKES, FINALE, INBOX } from "./flavor.js";
import { createScene, producerHue } from "./scene.js";
import { onFrame, setFrameCap } from "./frames.js";
import { createQueryLog, createSparkline, sparks, banner, confetti } from "./widgets.js";
import * as sync from "./sync.js";
import { renderErd, erdKey } from "./erd.js";
import { createActive } from "./active.js";
import { createPrestige } from "./prestige.js";
import { track, allowed as statsAllowed, browserOptOut } from "./analytics.js";
import { encodeSave, decodeSave } from "./seal.js";
import { createLeaderboard } from "./leaderboard.js";
import { schedulePush } from "./push.js";

const SAVE_KEY = "r2r.save";
// Set once this browser has written a sealed save. Before that, an unsealed (plain JSON)
// save is the pre-seal format and migrates clean; after it, an unsealed one was edited.
const SEALED_KEY = "r2r.sealed";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let S = loadLocal();
let tab = "sources";
let structureKey = "";
let lastCloudPush = 0;
let cloudDirty = false;
let nextIncidentAt = Date.now() + 45_000;
const clickTimes = [];
let combo = 0;
let lastClickAt = 0;
let comboTimer = 0;
let shownRows = 0;
let lastLoopAt = Date.now();
let rageClicks = 0;

/** Secret achievements the client detects; checkAchievements picks them up next tick. */
function grantSecret(id) {
  if (!S.secrets.includes(id)) S.secrets.push(id);
}

const VERSION = "0.7.2"; // x-release-please-version
const scene = createScene($("scene"));
// OKRs, all-hands and stakeholder requests (active.js).
const active = createActive({
  E, fmt, esc, toast, modal, confetti, $, setHtml,
  sfx: audio.sfx,
  state: () => S,
  changed: () => afterPurchase(),
  track: (event, extra) => track(event, S, extra),
});

// Leaderboards (leaderboard.js); hidden unless the server has them set up.
const lb = createLeaderboard({ state: () => S, encodeSave, fmt, fmtDuration, esc, toast, $ });

const queryLog = createQueryLog($("querylog"));
const spark = createSparkline($("spark"));

// The INSERT button grows up with click upgrades.
const INSERT_LABELS = [
  "INSERT INTO rows VALUES (…)",
  "INSERT INTO rows VALUES (…)",
  "INSERT … VALUES (…),(…),(…)",
  "INSERT INTO rows SELECT * FROM batch",
  "COPY rows FROM STDIN",
  "EXECUTE bulk_insert(:batch)",
  "PRODUCE → topic.rows",
  "✨ AI.generate(rows)",
  "🧠 think rows into existence",
];
const COMBO_MAX = 20;
const comboMult = () => 1 + Math.min(combo, COMBO_MAX) * 0.05;

// ---- persistence -------------------------------------------------------------

function loadLocal() {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (text) return fromSave(decodeSave(text), localStorage.getItem(SEALED_KEY) !== null);
  } catch {
    /* corrupt or blocked storage: start fresh */
  }
  return E.newState();
}

/** A decoded save as state; `strict` marks unsealed saves as modified (see SEALED_KEY). */
function fromSave({ raw, sealed }, strict = true) {
  const s = E.normalize(raw);
  if (!sealed && strict) s.modified = true;
  return s;
}

function saveLocal() {
  try {
    localStorage.setItem(SAVE_KEY, encodeSave(S));
    localStorage.setItem(SEALED_KEY, "1");
  } catch {
    /* private mode */
  }
  cloudDirty = true;
}

function replaceState(next) {
  S = next;
  structureKey = "";
  // An imported or cloud save may be hours old: credit that time with the offline cap.
  applyOffline();
  saveLocal();
  render(true);
}

// ---- offline progress --------------------------------------------------------

function applyOffline() {
  const now = Date.now();
  const away = (now - S.lastTick) / 1000;
  if (away < 1) return;
  const counted = Math.min(away, E.offlineCapSecs(S));
  S.stats.longestAway = Math.max(S.stats.longestAway, away * 1000);
  // Buffs don't keep running while the game is closed.
  if (away > 60) S.buffs = [];
  // Offline runs at reduced speed; a quick tab switch (the first minute) doesn't.
  S.lastTick = now - E.offlineCredit(counted) * 1000;
  const gained = E.tick(S, now);
  if (away > 60 && gained > 0) {
    const joke = OFFLINE_JOKES[Math.floor(Math.random() * OFFLINE_JOKES.length)](Math.max(1, Math.round(counted / 60)));
    const capped = away > counted ? ` Only the first ${fmtDuration(counted)} count (Bigger Disks on the Tech Radar raises the cap).` : "";
    modal(`<h2>Welcome back</h2><p>While you were away for ${fmtDuration(away)}, your pipelines ingested <b>${fmt(gained)}</b> rows.</p><p class="muted">${esc(joke)}</p><p class="muted">Offline, pipelines run at ${E.TUNING.offlineRate * 100}% speed.${capped}</p>`, [["Nice", "primary"]]);
  }
}

// ---- actions -----------------------------------------------------------------

function doInsert(x, y) {
  const now = Date.now();
  if (!E.clickAllowed(S)) {
    floatText("INSERT disabled", x, y);
    if (++rageClicks >= 20) grantSecret("rageclick");
    return;
  }
  while (clickTimes.length && clickTimes[0] < now - 1000) clickTimes.shift();
  if (clickTimes.length >= 20) return; // matches the server's plausibility budget
  clickTimes.push(now);
  combo = now - lastClickAt < 600 ? combo + 1 : 1;
  lastClickAt = now;
  E.tick(S, now);
  const v = E.clickValue(S, now).mul(comboMult());
  E.earn(S, v);
  S.clicks++;
  S.stats.runClicks++;
  S.stats.bestClick = E.big(S.stats.bestClick).max(v);
  scene.burst(combo >= 10 ? 3 : 1);
  audio.sfx("click", combo);
  E.addMomentum(S);
  S.stats.maxMomentum = Math.max(S.stats.maxMomentum, S.momentum);
  floatText(`+${fmt(v)}`, x, y);
  bump();
  showCombo();
  render();
}

function showCombo() {
  S.stats.bestCombo = Math.max(S.stats.bestCombo, combo);
  const el = $("combo");
  clearTimeout(comboTimer);
  if (combo >= 3) {
    el.textContent = `COMBO ×${combo}${combo >= COMBO_MAX ? " MAX" : ""} · +${Math.round((comboMult() - 1) * 100)}%`;
    el.classList.remove("on");
    void el.offsetWidth; // restart the pop animation
    el.classList.add("on");
  }
  comboTimer = setTimeout(() => {
    combo = 0;
    el.classList.remove("on");
  }, 700);
}

function bump() {
  const el = $("rows");
  el.classList.add("bump");
  setTimeout(() => el.classList.remove("bump"), 110);
}

// Sell mode is a per-visit toggle, not saved: coming back in sell mode would be a trap.
let selling = false;

function buyAmount(i) {
  const b = S.settings.buy;
  if (selling) return b === "max" ? E.sellable(S, i) : Math.min(b, E.sellable(S, i));
  if (b === "max") return Math.max(1, E.maxAffordable(S, i));
  return b;
}

function sparkFrom(btn, hue) {
  const r = btn?.getBoundingClientRect();
  if (r) sparks(r.left + r.width / 2, r.top + r.height / 2, hue ?? E.environmentFor(S).hue);
}

function onSellProducer(i) {
  E.tick(S, Date.now());
  const n = buyAmount(i);
  const value = E.sellValue(S, i, n);
  if (!E.sellProducer(S, i, n)) return audio.sfx("deny");
  audio.sfx("sell");
  const p = E.PRODUCERS[i];
  if (S.prod[i] === 42) grantSecret("answer");
  // Otherwise the auto-buyer would buy them straight back.
  if (autoBuyerOwned() && S.settings.autoSources && !S.settings.autoSkip.includes(p.id)) {
    S.settings.autoSkip = [...S.settings.autoSkip, p.id];
    toast(`🤖 ${esc(p.name)} left out of the auto-buyer so it stays at ${S.prod[i]}. Tick 🤖 on its card to undo.`);
  } else toast(`💸 Sold ${n} ${esc(n === 1 ? p.name : p.plural)} for ${fmt(value)} rows.`, "info");
  afterPurchase();
}

function onBuyProducer(i, btn) {
  if (selling) return onSellProducer(i);
  E.tick(S, Date.now());
  if (!E.buyProducer(S, i, buyAmount(i))) return audio.sfx("deny");
  audio.sfx("buy");
  sparkFrom(btn, producerHue(i));
  const node = btn?.closest(".node");
  if (node) {
    node.classList.remove("pop");
    void node.offsetWidth;
    node.classList.add("pop");
  }
  afterPurchase();
}

// Upgrades bought in quick succession share one toast instead of stacking up.
let deployBatch = [];
let deployTimer = 0;
function deployedToast(u) {
  deployBatch.push(u);
  clearTimeout(deployTimer);
  deployTimer = setTimeout(() => {
    const [first, ...rest] = deployBatch;
    deployBatch = [];
    if (!rest.length) toast(`${first.icon} <b>${esc(first.name)}</b> deployed.`, "info");
    else toast(`🚀 <b>${rest.length + 1} upgrades</b> deployed: ${[first, ...rest].map((u) => `${u.icon} ${esc(u.name)}`).join(", ")}.`, "info");
  }, 700);
}

function onBuyUpgrade(id, btn) {
  E.tick(S, Date.now());
  if (!E.buyUpgrade(S, id)) return audio.sfx("deny");
  audio.sfx("upgrade");
  sparkFrom(btn);
  deployedToast(E.UPGRADE_BY_ID[id]);
  afterPurchase();
}

function onBuyColumn(btn) {
  E.tick(S, Date.now());
  if (!E.buyColumn(S)) return audio.sfx("deny");
  audio.sfx("upgrade");
  sparkFrom(btn);
  freshColumn = S.cols - 1;
  afterPurchase();
}

function onBuyShop(shop, id, btn) {
  const ok = shop === "arch" ? E.buyArch(S, id) : E.buyLevel(S, shop, id);
  if (!ok) return audio.sfx("deny");
  audio.sfx("upgrade");
  sparkFrom(btn, 50);
  afterPurchase();
}

let freshColumn = -1;

function afterPurchase() {
  structureKey = "";
  saveLocal();
  render(true);
}

// ---- prestige layers -----------------------------------------------------------

/** Each source's share of production (plain numbers that sum to 1), for the scene. */
function sourceShares(gm) {
  const pm = E.producerMultipliers(S);
  const rates = E.PRODUCERS.map((p) => (S.prod[p.i] ? E.producerRate(S, p.i, gm, pm) : E.big(0)));
  const total = rates.reduce((a, b) => a.add(b), E.big(0));
  return rates.map((r) => (total.gt(0) ? r.div(total).toNumber() : 0));
}

function setHtml(id, html) {
  const el = $(id);
  if (el.dataset.html === html) return;
  el.dataset.html = html;
  el.innerHTML = html;
}

const ROMAN = ["", "I", "II", "III", "IV"];
// ---- inbox -----------------------------------------------------------------------

const INBOX_BY_ID = Object.fromEntries(INBOX.map((m) => [m.id, m]));
const KIND_ICON = { email: "📧", news: "📰", vendor: "🧾", alert: "🚨" };

function checkInbox() {
  for (const m of INBOX) {
    if (S.inbox.some((x) => x.id === m.id) || !m.when(S)) continue;
    S.inbox.push({ id: m.id, at: Date.now(), read: false });
    toast(`${KIND_ICON[m.kind]} <b>${esc(m.from)}</b>: ${esc(m.subject)}`, "info");
    audio.sfx("mail");
  }
  const unread = S.inbox.filter((x) => !x.read).length;
  $("inbox-badge").hidden = !unread;
  $("inbox-badge").textContent = unread;
}

function openInbox() {
  const rows = [...S.inbox]
    .reverse()
    .filter((x) => INBOX_BY_ID[x.id])
    .map((x) => {
      const m = INBOX_BY_ID[x.id];
      return `<button type="button" class="mail ${x.read ? "" : "unread"}" data-mail="${m.id}"><span>${KIND_ICON[m.kind]}</span><span><b>${esc(m.from)}</b><br>${esc(m.subject)}</span></button>`;
    })
    .join("");
  modal(`<h2>📬 Inbox</h2><div class="mail-list">${rows || '<p class="muted">Inbox zero. Enjoy it while it lasts.</p>'}</div>`, [["Close"]]);
}

function openMail(id) {
  const m = INBOX_BY_ID[id];
  const entry = S.inbox.find((x) => x.id === id);
  if (entry) entry.read = true;
  if (S.inbox.length >= 10 && S.inbox.every((x) => x.read)) grantSecret("inboxzero");
  modal(
    `<div class="mail-head">${KIND_ICON[m.kind]} <b>${esc(m.from)}</b><br><span class="muted">${mailTime(new Date(entry?.at ?? Date.now()))}</span></div><h2>${esc(m.subject)}</h2><p class="mail-body">${esc(m.body)}</p>`,
    [["Back to inbox", "", openInbox], ["Close", "primary"]],
  );
}

// Board / Xenotech / Big Bang automation, checked every tick.
function autoPrestige() {
  if (!E.automationAllowed(S) || S.chal) return;
  if (E.bangMilestone(S, "autobang") && S.settings.autoBang && E.canBigBang(S) && E.gateOpen(S, "bang") && E.pendingAxioms(S) >= 1) {
    prestige.doPrestige(prestige.LAYER_BY_ID.bang, true);
  }
  if (E.boardLevel(S, "autoreplat") && E.pendingInsights(S).gte(E.big(3).max(E.layerEarned(S, "replat").mul(S.settings.autoReplatAt - 1)))) {
    prestige.doPrestige(prestige.LAYER_BY_ID.replat, true);
  }
  if (E.xenoLevel(S, "hive") && E.gateOpen(S, "acq") && E.pendingEquity(S).gte(E.layerEarned(S, "acq").max(1))) {
    prestige.doPrestige(prestige.LAYER_BY_ID.acq);
  }
}

function checkFinale() {
  if (!S.finale || S.settings.finaleSeen) return;
  S.settings.finaleSeen = true;
  track("finale", S);
  confetti(120);
  modal(
    `<h2>🫠 Everything is data now.</h2>${FINALE.map((l) => `<p>${esc(l)}</p>`).join("")}<p class="muted">You can keep going in this universe, or start a new one with a 🌀 Big Bang under Prestige. Axioms make every future universe faster.</p>`,
    [["SELECT * FROM everything", "primary"]],
  );
}

// Greedy auto-buyer: unlocked upgrades first, then whichever source pays back fastest.
const autoBuyerOwned = () => E.archOn(S, "terraform") || E.boardLevel(S, "gitops") > 0;

// Upgrades that multiply production come before INSERT boosts in the "production" order.
const UPG_RANK = { global: 0, producer: 1, synergy: 1, click: 2 };

const gitopsOwned = () => E.boardLevel(S, "gitops") > 0;

// Each source strategy scores the affordable candidates; the auto-buyer buys the top one.
const SOURCE_STRATEGIES = {
  value: (i, gm, pm) => E.big(gm).mul(E.PRODUCERS[i].rate * pm[i]).div(E.producerCost(S, i, 1)).log10(),
  cheapest: (i) => -E.producerCost(S, i, 1).log10(),
  newest: (i) => i,
  // Fewest rows needed to reach the next ×2 threshold wins.
  milestone: (i) => {
    const target = E.nextTierAt(S, i);
    return target === null ? -Infinity : -E.producerCost(S, i, target - S.prod[i]).log10();
  },
};

function autoBuy() {
  if (!E.automationAllowed(S)) return;
  const set = S.settings;
  let bought = E.autoBuyShops(S) > 0;
  if (gitopsOwned() && set.autoColumns && E.columnCost(S.cols, S).lt(S.rows.mul(0.5))) bought = E.buyColumn(S) || bought;
  if (gitopsOwned() && set.autoUpgrades) {
    const list = availableUpgrades().filter((u) => S.rows.gte(u.cost));
    if (set.upgStrategy === "production") list.sort((a, b) => UPG_RANK[a.kind] - UPG_RANK[b.kind] || a.cost - b.cost);
    for (const u of list) {
      if (S.rows.lt(u.cost)) continue;
      bought = E.buyUpgrade(S, u.id) || bought;
    }
  }
  if (autoBuyerOwned() && set.autoSources) {
    const score = SOURCE_STRATEGIES[set.autoStrategy] ?? SOURCE_STRATEGIES.value;
    for (let n = 0; n < 20; n++) {
      const gm = E.globalMultiplier(S);
      const pm = E.producerMultipliers(S);
      let best = -1;
      let bestScore = -Infinity;
      for (const p of E.PRODUCERS) {
        if (!E.producerUnlocked(S, p.i) || set.autoSkip.includes(p.id) || E.producerCost(S, p.i, 1).gt(S.rows)) continue;
        const sc = score(p.i, gm, pm);
        if (sc > bestScore) [best, bestScore] = [p.i, sc];
      }
      if (best < 0) break;
      // Milestone buys exactly up to the threshold if it can; the others take half of what's
      // affordable, so a big bank doesn't need hundreds of single purchases.
      const afford = E.maxAffordable(S, best, S.rows);
      const target = E.nextTierAt(S, best);
      const n2 = set.autoStrategy === "milestone" && target !== null ? Math.min(afford, target - S.prod[best]) : Math.max(1, Math.floor(afford / 2));
      if (!E.buyProducer(S, best, n2)) break;
      bought = true;
    }
  }
  if (bought) afterPurchase();
}

// ---- incidents ---------------------------------------------------------------

function scheduleIncident(now) {
  nextIncidentAt = now + E.incidentEvery(S) * 1000 * (0.55 + Math.random() * 0.9);
}

// ---- rendering ---------------------------------------------------------------

function render(force = false) {
  const now = Date.now();
  const env = E.environmentFor(S);
  document.documentElement.style.setProperty("--hue", env.hue);
  const r = E.rate(S, now);
  const gm = E.globalMultiplier(S);
  const fp = footprint();
  scene.update({
    prod: S.prod,
    rates: sourceShares(gm),
    env,
    sink: fp.idx,
    progress: fp.progress,
  });
  checkEnvironment(env);
  audio.setMood(env.scene);
  $("rate").textContent = fmt(r);
  $("rate").parentElement.title = E.rawRate(S).gt(E.GRAVITY_AT) ? `Data gravity: past ${fmt(E.GRAVITY_AT)} rows/s, extra production has diminishing returns. Raw: ${fmt(E.rawRate(S))}/s.` : "";
  $("env").textContent = env.name;
  $("env").title = `Environment: ${env.name}. ${env.desc}`;
  $("env-path").textContent = env.name;
  $("company-slug").textContent = companySlug();
  $("sb-env").textContent = `env: ${env.name}`;
  $("click-value").textContent = E.clickAllowed(S) ? `+${fmt(E.clickValue(S, now) * comboMult())} per INSERT` : "disabled by the challenge";
  $("insert").classList.toggle("off", !E.clickAllowed(S));
  const tier = S.upg.filter((id) => id.startsWith("click_")).length;
  const insert = $("insert");
  if (insert.dataset.tier !== String(tier)) {
    insert.dataset.tier = tier;
    $("insert-label").textContent = INSERT_LABELS[Math.min(tier, INSERT_LABELS.length - 1)];
  }
  queryLog.setActive(prefs.querylog && (S.prod[3] > 0 || S.arch.length > 0), r);
  $("spark-wrap").hidden = !(S.prod[2] > 0 || S.arch.length > 0);
  document.title = `${fmt(S.rows)} rows — Rows to Riches`;
  renderBuffs(now);
  renderFootprint(fp, r);
  prestige.renderChallengeBanner();
  active.render();
  const m = S.momentum * E.momentumCap(S);
  $("momentum").hidden = m < 0.005;
  $("momentum").firstElementChild.style.width = `${(S.momentum * 100).toFixed(1)}%`;
  $("momentum").lastElementChild.textContent = `⌨️ hands on keyboard: +${Math.round(m * 100)}% production`;

  const key = visibleKey();
  if (force || key !== structureKey) {
    structureKey = key;
    buildSources();
    buildUpgrades();
    if (tab === "stats") stats?.buildAch();
  }
  updateSources();
  updateUpgrades();
  updateSchema();
  prestige.render();
  if (tab === "stats") stats?.update();
  if (tab === "settings") settings?.update();
}

// Smoothly rolls the big counter towards the real bank; drops snap instantly.
let counterAt = 0;
function animateCounter(t) {
  const target = S.rows;
  // 20% of the gap per 60 Hz frame, whatever the real frame rate is (1 fps while the page is hidden).
  const ease = 1 - 0.8 ** (Math.min(1000, t - counterAt) / 16.7);
  counterAt = t;
  shownRows = E.big(shownRows);
  shownRows = target.lt(shownRows) || target.sub(shownRows).lt(1) ? target : shownRows.add(target.sub(shownRows).mul(ease));
  const text = fmt(shownRows);
  const el = $("rows");
  if (el.textContent !== text) {
    const grew = text.length !== el.textContent.length;
    el.textContent = text;
    if (grew) fitCounter();
  }
}

// Fits the header on narrow screens. The row count shrinks first (the CSS size is the cap);
// once it hits the minimum the header gives way in order: env pill, title size, "rows" label, title.
let counterBase = 0;
let titleBase = 0;
const MIN_COUNTER_PX = 11;
const MIN_TITLE_PX = 12;
function fitCounter(reset) {
  const el = $("rows");
  const box = el.closest(".rows");
  const top = box.closest(".top");
  const title = top.querySelector(".title");
  if (reset || !counterBase) {
    box.style.fontSize = title.style.fontSize = "";
    top.classList.remove("no-env", "no-label", "no-title");
    counterBase = parseFloat(getComputedStyle(box).fontSize);
    titleBase = parseFloat(getComputedStyle(title).fontSize);
  }
  // Sets the count's size to what fits; returns the unclamped size.
  const fitRows = () => {
    const avail = box.parentElement.clientWidth;
    const num = el.offsetWidth;
    if (!num || !avail) return Infinity;
    const label = box.offsetWidth - num;
    const cur = parseFloat(box.style.fontSize) || counterBase;
    const fit = (cur * (avail - label)) / num;
    box.style.fontSize = `${Math.max(MIN_COUNTER_PX, Math.min(counterBase, fit)).toFixed(1)}px`;
    return fit;
  };
  const shrinkTitle = () => {
    const cur = parseFloat(title.style.fontSize) || titleBase;
    const avail = box.parentElement.clientWidth;
    const need = box.offsetWidth - avail;
    const next = Math.max(MIN_TITLE_PX, (cur * (title.offsetWidth - need)) / title.offsetWidth);
    title.style.fontSize = `${next.toFixed(1)}px`;
  };
  const shed = (cls) => () => top.classList.add(cls);
  if (fitRows() >= MIN_COUNTER_PX) return;
  for (const step of [shed("no-env"), shrinkTitle, shed("no-label"), shed("no-title")]) {
    step();
    if (fitRows() >= MIN_COUNTER_PX) return;
  }
}
window.addEventListener("resize", () => fitCounter(true));

function checkEnvironment(env) {
  if (S.settings.env === env.id) return;
  const first = S.settings.env === undefined;
  S.settings.env = env.id;
  // No fanfare for the starting environment or for saves loaded mid-game.
  if (first || env.at === 0) return;
  banner(env.name, env.desc);
  audio.sfx("promote");
  scene.shake();
}

// What lists show depends on unlocks; rebuild DOM only when that changes.
function visibleKey() {
  const src = E.PRODUCERS.filter((p) => sourceVisible(p)).length;
  const upg = E.UPGRADES.filter((u) => !S.upg.includes(u.id) && E.upgradeUnlocked(S, u)).length;
  return [src, upg, S.upg.length, S.arch.join(), S.ach.length, S.ins, S.settings.buy].join("|");
}

const sourceVisible = (p) => E.producerUnlocked(S, p.i) && (p.i === 0 || S.prod[p.i] > 0 || S.prod[p.i - 1] > 0 || S.runRows.gte(p.cost * 0.5));

function lockedHint(p) {
  if (E.producerUnlocked(S, p.i)) return `Unlocks at ${fmt(p.cost * 0.5)} rows this run.`;
  if (p.i < E.BASE_PRODUCERS + E.RND_PRODUCERS) return `Needs R&D Lab level ${p.i - E.BASE_PRODUCERS + 1} (Board, after an acquisition).`;
  const level = p.i - E.BASE_PRODUCERS - E.RND_PRODUCERS + 1;
  if (!E.rndComplete(S)) return `Needs the complete R&D Lab (${E.boardLevel(S, "rnd")}/${E.RND_PRODUCERS}) first, then Contact Protocol level ${level}.`;
  return `Needs Contact Protocol level ${level} (Xenotech, after First Contact).`;
}

function renderBuffs(now) {
  const html = S.buffs
    .filter((b) => b.until > now)
    .map((b) => `<span class="buff">${esc(b.name ?? b.kind)} ×${b.mult} · ${Math.ceil((b.until - now) / 1000)}s</span>`)
    .join("");
  if ($("buffs").innerHTML !== html) $("buffs").innerHTML = html;
}

function footprint() {
  const units = E.STORAGE_UNITS;
  let idx = 0;
  const rowsLog = E.envRows(S).max(1).log10();
  for (let i = 0; i < units.length; i++) if (rowsLog >= Math.log10(units[i][1])) idx = i;
  const next = units[idx + 1];
  // Log-scale progress so the ring keeps moving between units 1000× apart.
  const progress = next ? Math.min(1, Math.max(0, rowsLog - Math.log10(units[idx][1])) / Math.log10(next[1] / units[idx][1])) : 1;
  return { idx, progress };
}

// The bar tracks the next environment (its name stays a surprise); the storage footprint
// is flavour underneath. The ETA uses the current rate, so it shrinks as you grow.
function renderFootprint({ idx }, rate) {
  const [name, size] = E.STORAGE_UNITS[idx];
  const amount = E.envRows(S).div(size);
  const plural = amount.gte(2) ? (name.endsWith("y") ? name.slice(0, -1) + "ies" : name + "s") : name;
  const next = E.nextEnvironment(S);
  let head;
  let progress = 1;
  if (!next) head = `environment: <b>${esc(E.environmentFor(S).name)}</b> · nowhere left to go`;
  else if (next.rowsLeft === null) head = `next environment: <b>???</b> · rows alone won't get you there`;
  else {
    progress = next.progress;
    const eta = E.big(rate).gt(0) ? ` · ~${fmtDuration(next.rowsLeft.div(rate).min(1e12).toNumber())} at this rate` : "";
    // Rows left rather than a percentage: the bar is log-scale, so "68%" can still mean hours.
    head = `next environment: <b>???</b> · ${fmt(next.rowsLeft)} rows to go${eta}`;
  }
  const html = `${head}<div class="bar"><i style="width:${(progress * 100).toFixed(1)}%"></i></div><div class="fp-flavor">storage footprint: ${fmt(amount)} ${plural}</div>`;
  if ($("footprint").dataset.html !== html) {
    $("footprint").dataset.html = html;
    $("footprint").innerHTML = html;
  }
}

// Updates a list in place by key: unchanged items keep their DOM node (no re-animation,
// no flicker), removed ones go, new ones are inserted in order with an entrance animation.
function syncList(container, items, emptyHtml = "") {
  const existing = new Map([...container.children].filter((el) => el.dataset.key).map((el) => [el.dataset.key, el]));
  const keep = new Set(items.map((x) => x.key));
  for (const [key, el] of existing) if (!keep.has(key)) el.remove();
  for (const el of [...container.children]) if (!el.dataset.key) el.remove();
  let prev = null;
  const first = existing.size === 0;
  for (const { key, html } of items) {
    let el = existing.get(key);
    if (!el) {
      const tpl = document.createElement("template");
      tpl.innerHTML = html.trim();
      el = tpl.content.firstElementChild;
      el.dataset.key = key;
      // Nothing animates on the first fill; later additions slide in.
      if (first) el.style.animation = "none";
    }
    const want = prev ? prev.nextElementSibling : container.firstElementChild;
    if (want !== el) container.insertBefore(el, want);
    prev = el;
  }
  if (!items.length && emptyHtml) container.innerHTML = emptyHtml;
}

function buildSources() {
  const items = [];
  let teased = false;
  for (const p of E.PRODUCERS) {
    if (sourceVisible(p)) {
      items.push({
        key: `p${p.i}`,
        html: `<li class="node" data-i="${p.i}" style="--h:${producerHue(p.i)}">
        <div class="ico" aria-hidden="true">${p.icon}</div>
        <div><div class="name"><span id="pn${p.i}">${esc(p.name)}</span><span class="count"></span><button type="button" class="auto-chip" data-auto-src="${p.id}" title="Include in the auto-buyer" hidden>🤖</button></div><div class="sub"><span class="chip"></span><span class="txt"></span></div><div class="run-bar off" aria-hidden="true"><i></i></div></div>
        <button class="buy" type="button" data-buy-producer="${p.i}" aria-describedby="pn${p.i}"></button></li>`,
      });
    } else if (!teased) {
      teased = true;
      // Keyed by its hint too, so the teaser refreshes when the requirement changes.
      items.push({ key: `lock${p.i}:${lockedHint(p)}`, html: `<li class="node locked"><div class="ico" aria-hidden="true">🔒</div><div><div class="name">???</div><div class="sub"><span class="chip queued">locked</span><span class="txt">${esc(lockedHint(p))}</span></div><div class="run-bar off" aria-hidden="true"><i></i></div></div><span></span></li>` });
    }
  }
  syncList($("sources"), items);
  document.querySelectorAll(".buy-amount button[data-buy]").forEach((b) => {
    const on = String(S.settings.buy) === b.dataset.buy;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  $("sell-mode").classList.toggle("on", selling);
  $("sell-mode").setAttribute("aria-pressed", selling);
  $("sources").classList.toggle("selling", selling);
}

const sharePct = (f) => (f >= 0.995 ? "100%" : f >= 0.1 ? `${Math.round(f * 100)}%` : f >= 0.001 ? `${(f * 100).toFixed(1)}%` : "<0.1%");

function updateSources() {
  if (tab !== "sources") return;
  const gm = E.globalMultiplier(S);
  const pm = E.producerMultipliers(S);
  const raw = E.rawRate(S).max(1e-300);
  for (const li of $("sources").querySelectorAll("li[data-i]")) {
    const i = Number(li.dataset.i);
    const p = E.PRODUCERS[i];
    const n = buyAmount(i);
    const cost = E.producerCost(S, i, n);
    const each = E.big(gm).mul(p.rate * pm[i]);
    const owned = S.prod[i];
    li.querySelector(".count").textContent = owned ? `×${owned}` : "";
    li.classList.toggle("running", owned > 0);
    const robot = li.querySelector(".auto-chip");
    robot.hidden = !(autoBuyerOwned() && S.settings.autoSources);
    robot.classList.toggle("off", S.settings.autoSkip.includes(p.id));
    const chip = li.querySelector(".chip");
    const chipText = owned ? "running" : "queued";
    if (chip.textContent !== chipText) {
      chip.textContent = chipText;
      chip.className = `chip ${owned ? "run" : "queued"}`;
    }
    const total = E.producerRate(S, i, gm, pm);
    li.querySelector(".sub .txt").textContent = owned
      ? `${fmt(each)}/s each · ${fmt(total)}/s total · ${sharePct(total.div(raw).toNumber())} of output`
      : `${fmt(each)}/s each · ${p.flavor}`;
    // Run bar: more units → shorter batch cycle.
    const dur = owned ? `${Math.max(0.35, 4 / (1 + Math.log2(owned))).toFixed(2)}s` : "0s";
    const bar = li.querySelector(".run-bar");
    bar.classList.toggle("off", !owned);
    if (bar.firstChild.style.getPropertyValue("--dur") !== dur) bar.firstChild.style.setProperty("--dur", dur);
    const btn = li.querySelector(".buy");
    if (selling) {
      const html = n ? `Sell ${n}<small>+${fmt(E.sellValue(S, i, n))}</small>` : `Sell<small>${owned ? "starter units" : "none"}</small>`;
      if (btn.innerHTML !== html) btn.innerHTML = html;
      btn.disabled = !n;
      li.classList.remove("affordable");
      continue;
    }
    const html = `Buy ${n}<small>${fmt(cost)}</small>`;
    if (btn.innerHTML !== html) btn.innerHTML = html;
    btn.disabled = cost.gt(S.rows);
    li.classList.toggle("affordable", cost.lte(S.rows));
  }
}

function availableUpgrades() {
  return E.UPGRADES.filter((u) => !S.upg.includes(u.id) && E.upgradeUnlocked(S, u)).sort((a, b) => a.cost - b.cost);
}

function buildUpgrades() {
  syncList(
    $("upgrades"),
    availableUpgrades().map((u) => ({
      key: u.id,
      html: `<li class="item" data-u="${u.id}"><div class="ico" aria-hidden="true">${u.icon}</div>
          <div><div class="name">${esc(u.name)}</div><div class="sub">${esc(u.desc)}</div></div>
          <button class="buy" type="button" data-buy-upgrade="${u.id}">Buy<small>${fmt(u.cost)}</small></button></li>`,
    })),
    `<li class="muted">Nothing new yet. Grow your Data Sources to unlock upgrades.</li>`,
  );
  $("upg-owned").textContent = `${S.upg.length} owned`;
  $("upg-deployed").hidden = !S.upg.length;
  $("upg-deployed-n").textContent = `(${S.upg.length})`;
  if ($("upg-deployed").open) buildDeployed();
}

$("upg-deployed").addEventListener("toggle", (e) => e.target.open && buildDeployed());

// Up to a few hundred rows, so it's only built while the section is open. Grouped by what
// each upgrade boosts, in the game's own order. Owned counts only: totals would spoil how
// much is left to unlock.
function buildDeployed() {
  const groups = new Map();
  for (const u of E.UPGRADES) {
    if (!S.upg.includes(u.id)) continue;
    const p = u.target != null ? E.PRODUCERS[u.target] : null;
    const key = p ? `p${p.i}` : u.kind;
    if (!groups.has(key)) groups.set(key, { title: p ? `${p.icon} ${p.name}` : u.kind === "click" ? "⌨️ INSERT" : "🛠️ Everything", ups: [] });
    groups.get(key).ups.push(u);
  }
  // Sources first (tier order), then INSERT and global.
  const order = [...groups.keys()].sort((a, b) => (a[0] === "p" ? Number(a.slice(1)) : 1e3 + (a === "click" ? 0 : 1)) - (b[0] === "p" ? Number(b.slice(1)) : 1e3 + (b === "click" ? 0 : 1)));
  const items = [];
  for (const key of order) {
    const g = groups.get(key);
    items.push({ key: `h:${key}:${g.ups.length}`, html: `<li class="upg-group">${esc(g.title)} <span class="muted">${g.ups.length} deployed</span></li>` });
    for (const u of g.ups)
      items.push({ key: u.id, html: `<li class="item owned"><div class="ico" aria-hidden="true">${u.icon}</div><div><div class="name">${esc(u.name)}</div><div class="sub">${esc(u.desc)}</div></div>${S.kept.upg.includes(u.id) ? `<span class="chip run" title="Carried over by a retention reward">kept</span>` : "<span></span>"}</li>` });
  }
  syncList($("upgrades-owned"), items);
}

function updateUpgrades() {
  const list = availableUpgrades();
  $("upg-dot").hidden = !list.some((u) => S.rows.gte(u.cost));
  if (tab !== "upgrades") return;
  for (const li of $("upgrades").querySelectorAll("li[data-u]")) {
    const u = E.UPGRADE_BY_ID[li.dataset.u];
    const blocked = E.rule(S).noUpgrades;
    const btn = li.querySelector(".buy");
    btn.disabled = blocked || S.rows.lt(u.cost);
    btn.title = blocked ? "Upgrades are disabled by the current challenge." : "";
    li.classList.toggle("affordable", !blocked && S.rows.gte(u.cost));
  }
  if (E.rule(S).noUpgrades) $("upg-owned").textContent = "🔒 disabled by the current challenge";
}

function columnType(name) {
  // Generated names wrap a base field in prefixes and suffixes, so match inside the name.
  if (name === "embedding") return "VECTOR(1536)";
  if (/(^|_)id(_|$)|customer_id/.test(name)) return "BIGINT";
  if (/_at(_|$)|^valid_|created_at/.test(name)) return "TIMESTAMPTZ";
  if (/(^|_)is_|_flag/.test(name)) return "BOOLEAN";
  if (name.includes("json")) return "JSONB";
  if (name.includes("amount")) return "NUMERIC(38,9)";
  if (name.endsWith("_date")) return "DATE";
  if (name === "row_version") return "INTEGER";
  return "TEXT";
}

let erdSeen = null;
function updateSchema() {
  if (tab !== "schema") return;
  const key = erdKey(S);
  if ($("erd").dataset.key !== key) {
    $("erd").dataset.key = key;
    // Only tables added after the first draw fade in.
    const animate = !!erdSeen;
    erdSeen ??= new Set();
    $("erd").innerHTML = renderErd(S, erdSeen, animate);
  }
  const lines = [`<span class="k">CREATE TABLE</span> rows (`];
  const shown = Math.min(S.cols, 40);
  if (!S.cols) lines.push(`  <span class="t">-- no columns yet. technically a heap.</span>`);
  for (let n = 0; n < shown; n++) {
    const alien = E.alienTypeFor(S, n);
    const type = alien ? `<span class="alien">${alien}</span>` : `<span class="t">${columnType(E.columnName(n))}</span>`;
    lines.push(`  <span class="${n === freshColumn ? "new" : ""}">${esc(E.columnName(n))} ${type}</span>${n < S.cols - 1 ? "," : ""}`);
  }
  if (S.cols > shown) lines.push(`  <span class="t">-- …and ${S.cols - shown} more nobody queries</span>`);
  lines.push(");");
  const html = lines.join("\n");
  if ($("ddl").innerHTML !== html) $("ddl").innerHTML = html;
  const each = E.columnStep(S).toFixed(2);
  $("col-mult").textContent = `${S.cols} columns · ×${fmt(E.columnMult(S))}`;
  const cost = E.columnCost(S.cols, S);
  const btn = $("add-column");
  const frozen = E.rule(S).noColumns;
  btn.textContent = frozen
    ? `🔒 Schema frozen by the ${E.parseTier(S.chal).challenge.name} challenge`
    : `ALTER TABLE rows ADD COLUMN ${E.columnName(S.cols)} — ${fmt(cost)} rows (each column ×${each})`;
  btn.disabled = frozen || cost.gt(S.rows);
  btn.classList.toggle("affordable", !frozen && cost.lte(S.rows));
}

// ---- cloud -------------------------------------------------------------------

// Settings → Game → Clock: "auto" follows the device locale.
function clockTime(seconds = false, date = new Date()) {
  const hour12 = prefs.clock === "auto" ? undefined : prefs.clock === "12";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(seconds && { second: "2-digit" }), hour12 });
}

const mailTime = (d) => `${d.toLocaleDateString()}, ${clockTime(false, d)}`;

function setSyncStatus(text) {
  const el = $("sync-status");
  if (el) el.textContent = text;
  $("sb-sync").textContent = `☁ ${text.replace(/\.$/, "").toLowerCase()}`;
}

async function pushCloud({ force = false, keepalive = false } = {}) {
  if (!sync.session.token) return;
  E.tick(S, Date.now());
  lastCloudPush = Date.now();
  cloudDirty = false;
  let r;
  try {
    r = await sync.pushSave(S, { force, keepalive });
  } catch {
    cloudDirty = true;
    setSyncStatus("Offline — will retry.");
    return;
  }
  if (r.ok) setSyncStatus(`Synced ${clockTime(true)}.`);
  else if (r.status === 409) offerCloud(r.data.save);
  else if (r.status === 429) cloudDirty = true;
  else setSyncStatus(`Sync failed (${r.status}).`);
}

function offerCloud(cloud) {
  modal(
    `<h2>Cloud save is ahead</h2><p>The cloud save has <b>${fmt(cloud.everRows ?? cloud.allRows)}</b> lifetime rows; this device has <b>${fmt(S.everRows)}</b>.</p>`,
    [
      ["Keep this device", "", () => pushCloud({ force: true })],
      ["Load cloud save", "primary", () => {
        // From our own server, which validated it on upload: no seal to check.
        replaceState(E.normalize(cloud));
        pushCloud();
      }],
    ],
  );
}

async function reconcileCloud() {
  if (!sync.session.token) return;
  try {
    const r = await sync.fetchCloud();
    if (!r.ok) return;
    if (r.data.save && E.big(r.data.save.everRows ?? r.data.save.allRows ?? 0).gt(S.everRows.add(1))) offerCloud(r.data.save);
    else pushCloud({ force: true });
  } catch {
    /* offline; the autosync loop retries */
  }
}

// Sign-in links from showCode() carry the code in the fragment, so it never reaches a server log.
function handleCodeLink() {
  const m = location.hash.match(/^#code=([\w-]{20,40})$/);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  if (sync.session.token) return toast("☁️ Already signed in. Sign out first to switch accounts.");
  modal(`<h2>Sign in with this account code?</h2><p class="account-code">${esc(m[1])}</p><p>This device will sync with that account. If the cloud save is further along, you'll be asked which one to keep.</p>`, [
    ["Cancel"],
    ["Sign in", "primary", () => codeSignIn(m[1])],
  ]);
}

async function codeSignIn(code, status) {
  if (status) status.textContent = "Signing in…";
  try {
    const r = await sync.codeLogin(code);
    if (r.ok) {
      toast("☁️ <b>Signed in</b> with your account code.");
      render(true);
      return reconcileCloud();
    }
    if (status) status.textContent = r.data.error ?? `Failed (${r.status}).`;
    else modal(`<h2>That code didn't work</h2><p>${esc(r.data.error ?? `Failed (${r.status}).`)}</p>`, [["OK", "primary"]]);
  } catch {
    if (status) status.textContent = "Couldn't reach the server.";
  }
}


// ---- what's new ----------------------------------------------------------------

// Once per new version, and never on a first visit (that's the walkthrough's moment).
function checkWhatsNew() {
  const seen = prefs.seenVersion;
  setPref("seenVersion", VERSION);
  if (seen && seen !== VERSION) setTimeout(() => whatsNew().then((w) => w.show(VERSION, { quiet: true })), 1500);
}

// ---- small UI helpers --------------------------------------------------------

function floatText(text, x, y) {
  if (!prefs.particles) return;
  if (x == null) {
    const rect = $("insert").getBoundingClientRect();
    x = rect.left + rect.width / 2;
    y = rect.top;
  }
  const el = document.createElement("div");
  el.className = "float";
  el.setAttribute("aria-hidden", "true");
  el.textContent = text;
  el.style.left = `${x - 20 + (Math.random() - 0.5) * 30}px`;
  el.style.top = `${y - 20}px`;
  document.body.append(el);
  setTimeout(() => el.remove(), 900);
}

// kind "info": ambient news (achievements, mail, incidents). "key": prestige, challenges and
// replies to your own actions. Settings → Display decides which ones show.
function toast(html, kind = "key") {
  if (prefs.toasts === "off" || (prefs.toasts === "important" && kind === "info")) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.title = "Click to dismiss";
  el.innerHTML = html;
  el.addEventListener("click", () => el.remove());
  $("toasts").append(el);
  const all = $("toasts").querySelectorAll(".toast");
  for (let i = 0; i < all.length - 4; i++) all[i].remove();
  setTimeout(() => el.remove(), 4500);
}
// Shown by CSS only while two or more toasts are up.
$("toasts-clear").addEventListener("click", () => $("toasts").querySelectorAll(".toast").forEach((t) => t.remove()));

// buttons: [label, className, onClick]
function modal(html, buttons) {
  const dlg = $("modal");
  const body = $("modal-body");
  body.innerHTML = `${html}<div class="actions"></div>`;
  const actions = body.querySelector(".actions");
  for (const [label, cls = "", fn] of buttons) {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = cls;
    b.value = label;
    b.addEventListener("click", () => fn && setTimeout(fn));
    actions.append(b);
  }
  if (!dlg.open) dlg.showModal();
}

// Features that load the first time they're used (each module exports a factory that gets what it needs from here).
const lazy = (load, make) => {
  let ready;
  return () => (ready ??= load().then(make).catch((e) => ((ready = undefined), Promise.reject(e))));
};
// What the lazily loaded features share: each factory takes this one object and uses what it needs.
const ctx = {
  E, prefs, setPref, scene, audio, lb, $, esc, fmt, fmtDuration, toast, modal, confetti, grantSecret, saveLocal, render, selectTab, afterPurchase,
  pushCloud, codeSignIn, replaceState, fromSave, autoBuyerOwned, gitopsOwned,
  state: () => S,
  version: VERSION,
  track: (event, extra) => track(event, S, extra),
};
const prestige = createPrestige({ ...ctx, setHtml, ROMAN, getTab: () => tab });
const feedback = lazy(() => import("./feedback.js"), (m) => m.createFeedback(ctx));
const whatsNew = lazy(() => import("./whatsnew.js"), (m) => m.createWhatsNew(ctx));
const completion = lazy(() => import("./completion.js"), (m) => m.createCompletion(ctx));
let stats; // set once the Stats tab has been opened
const statsFeature = lazy(() => import("./stats.js"), (m) => m.createStats(ctx));
let settings; // set once the Settings tab has been opened
const settingsFeature = lazy(() => import("./settings.js"), (m) => m.createSettings(ctx));
const incidents = lazy(() => import("./incidents.js"), (m) => m.createIncidents(ctx));

// Shuffle bag: every line shows once before any repeats. The current environment's lines
// go in three times, older ones once, plus a few that mention your own numbers.
let tickerBag = [];
let tickerEnv = "";
function rotateTicker() {
  const envs = E.ENVIRONMENTS.filter((e) => E.reachedEnv(S, e)).map((e) => e.id);
  const current = envs.at(-1);
  if (!tickerBag.length || tickerEnv !== current) {
    tickerEnv = current;
    const lines = [...envs.flatMap((id) => TICKER[id] ?? []), ...(TICKER[current] ?? []), ...(TICKER[current] ?? []), ...TICKER.tools, ...(S.replat > 0 ? TICKER.corporate : []), ...(S.bangs > 0 ? TICKER.bang : []), ...(S.completions > 0 ? TICKER.catalog : []), ...dynamicTicker()];
    tickerBag = [...new Set(lines)].concat(TICKER[current] ?? []).sort(() => Math.random() - 0.5);
  }
  // Newest on top; on desktop the older lines stay below as a feed (CSS hides them on phones).
  const line = document.createElement("span");
  line.className = "tick";
  const time = document.createElement("time");
  time.textContent = clockTime();
  line.append(time, tickerBag.pop());
  $("ticker").prepend(line);
  while ($("ticker").children.length > 40) $("ticker").lastElementChild.remove();
}

function dynamicTicker() {
  const name = S.company || "Your startup";
  return [
    `${name} announces a ${fmt(E.rate(S))} rows/s pipeline. Nobody asked how many are duplicates.`,
    `Analysts estimate ${name} holds ${fmt(S.everRows)} rows. ${name} estimates "a lot".`,
    `${name} stock rises after the CEO says "AI" ${S.replat + 3} times on the earnings call.`,
    `${name}'s data catalog lists ${S.ach.length} entries. 12 of them have descriptions.`,
  ];
}

// ---- wiring ------------------------------------------------------------------

function selectTab(name) {
  tab = name;
  for (const b of document.querySelectorAll(".tabs button")) {
    const on = b.dataset.tab === name;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  }
  for (const p of document.querySelectorAll(".pane")) p.hidden = p.id !== `pane-${name}`;
  if (name === "settings") settingsFeature().then((m) => ((settings = m), render(true)));
  if (name === "stats") {
    lb.render(true);
    statsFeature().then((m) => ((stats = m), render(true)));
  }
  render(true);
}

document.querySelector(".tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b) selectTab(b.dataset.tab);
});
// Tabs wire themselves to their panels, and the arrow keys move between them (roving tabindex).
for (const b of document.querySelectorAll(".tabs button")) {
  b.id = `tab-${b.dataset.tab}`;
  b.setAttribute("aria-controls", `pane-${b.dataset.tab}`);
  $(`pane-${b.dataset.tab}`).setAttribute("aria-labelledby", b.id);
}
document.querySelector(".tabs").addEventListener("keydown", (e) => {
  const tabs = [...document.querySelectorAll(".tabs button")];
  const at = tabs.indexOf(document.activeElement);
  const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
  if (at < 0 || to === undefined) return;
  e.preventDefault();
  const next = tabs[(to + tabs.length) % tabs.length];
  next.focus();
  selectTab(next.dataset.tab);
});

const insertBtn = $("insert");
insertBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  insertBtn.classList.add("pressed");
  doInsert(e.clientX, e.clientY);
});
for (const ev of ["pointerup", "pointerleave", "pointercancel"]) insertBtn.addEventListener(ev, () => insertBtn.classList.remove("pressed"));
insertBtn.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    if (!e.repeat) doInsert();
  }
});

document.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.buyProducer) onBuyProducer(Number(t.dataset.buyProducer), t);
  else if (t.dataset.buyUpgrade) onBuyUpgrade(t.dataset.buyUpgrade, t);
  else if (t.dataset.shop) onBuyShop(t.dataset.shop, t.dataset.item, t);
  else if (t.dataset.layer) {
    prestige.selectLayer(t.dataset.layer);
    render(true);
  } else if (t.dataset.prestige) prestige.onPrestige(prestige.LAYER_BY_ID[t.dataset.prestige]);
  else if (t.dataset.challenge) prestige.onStartChallenge(t.dataset.challenge, Number(t.dataset.tier ?? 1));
  else if (t.closest("[data-request]")) active.answer(t.closest("[data-request]").dataset.request);
  else if (t.dataset.okrToggle) $("okr-strip").classList.toggle("open");
  else if (t.dataset.feedback) feedback().then((f) => f.open());
  else if (t.dataset.autoSrc) {
    const skip = S.settings.autoSkip;
    const id = t.dataset.autoSrc;
    S.settings.autoSkip = skip.includes(id) ? skip.filter((x) => x !== id) : [...skip, id];
    saveLocal();
    render();
  }
  else if (t.dataset.abandon) {
    modal(`<h2>🏳️ Abandon challenge?</h2><p>The restriction lifts right away and you keep this run's progress, but you don't get the reward. You can try again later.</p>`, [
      ["Keep trying"],
      ["Abandon", "danger", () => {
        E.abandonChallenge(S);
        toast("🏳️ Challenge abandoned. The restriction is lifted; no reward.");
        afterPurchase();
      }],
    ]);
  } else if (t.dataset.mail) openMail(t.dataset.mail);
  else if (t.id === "inbox-btn") openInbox();
  else if (t.id === "sell-mode") {
    selling = !selling;
    render(true);
  } else if (t.dataset.buy) {
    S.settings.buy = t.dataset.buy === "max" ? "max" : Number(t.dataset.buy);
    saveLocal();
    render(true);
  } else if (t.dataset.ach) {
    const a = E.ACH_BY_ID[t.dataset.ach];
    if (a.id === "clickme" && !S.ach.includes(a.id)) grantSecret("clickme");
    else if (S.ach.includes(a.id)) toast(`🏅 <b>${esc(a.name)}</b> — ${esc(a.desc)}`);
    else toast(`🔒 ${esc(a.desc)}`);
  } else if (t.id === "add-column") onBuyColumn(t);
  else if (t.id === "sync-now") pushCloud();
  else if (t.id === "catalog-btn") completion().then((c) => c.confirmCatalog());
  else if (t.id === "whats-new") whatsNew().then((w) => w.show(VERSION));
  else if (t.id === "create-code") {
    t.disabled = true;
    sync
      .createCode()
      .then((r) => {
        if (!r.ok) return toast(`☁️ ${esc(r.data.error ?? `Couldn't create a code (${r.status}).`)}`);
        render(true);
        settings.showCode(r.data.code, true);
        reconcileCloud();
      })
      .catch(() => toast("☁️ Couldn't reach the server."))
      .finally(() => (t.disabled = false));
  } else if (t.id === "new-code") {
    modal(`<h2>Get a new account code?</h2><p>Your current code stops working. Use this if you lost it, or if someone else has it.</p>`, [
      ["Cancel"],
      ["New code", "primary", async () => {
        const r = await sync.rotateCode().catch(() => null);
        if (r?.ok) settings.showCode(r.data.code, false);
        else toast("☁️ Couldn't create a new code right now.");
      }],
    ]);
  } else if (t.id === "sign-out") {
    modal(`<h2>Sign out?</h2><p>To sign in again you'll need your account code. Lost it? Stay signed in and use <b>Get a new account code</b> first.</p>`, [
        ["Cancel"],
        ["Sign out", "danger", () => sync.signOut().finally(() => render(true))],
      ]);
  } else if (t.id === "delete-account") {
    modal(`<h2>Delete account?</h2><p>Removes your account, its code and the cloud save from the server. Progress on this device stays.</p>`, [
      ["Cancel"],
      ["Delete", "danger", async () => {
        await sync.deleteAccount();
        toast("Account deleted.");
        render(true);
      }],
    ]);
  } else if (t.id === "export") settings.exportSave();
  else if (t.id === "import") settings.importSave();
  else if (t.id === "reset") {
    modal(`<h2>DROP DATABASE?</h2><p>Erases <b>all</b> progress on this device, including Insights and Architecture. A cloud save, if any, is kept until this device syncs again.</p>`, [
      ["Cancel"],
      ["DROP", "danger", () => {
        replaceState(E.newState());
        toast("💥 Database dropped. Backups? What backups?");
      }],
    ]);
  }
});

// ---- settings ---------------------------------------------------------------

$("opt-mood").innerHTML = `<option value="auto">Auto: follows the environment</option>` + Object.entries(audio.MOODS).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join("");
$("opt-stats").addEventListener("change", (e) => {
  setPref("stats", e.target.checked);
  if (browserOptOut()) setPref("statsGpcOptIn", e.target.checked);
  showPrefs();
});
$("opt-mood").addEventListener("change", (e) => {
  setPref("mood", e.target.value);
  audio.unlock();
  audio.refreshMood();
});
$("opt-notation").innerHTML = Object.entries(NOTATIONS).map(([k, label]) => `<option value="${k}">${label}</option>`).join("");
$("about-version").textContent = `v${VERSION}`;
// Installable app: offline shell via the service worker.
if ("serviceWorker" in navigator) {
  // The service worker swaps itself in as soon as a new version installs, but this page keeps
  // running the code it already loaded, so offer a reload. Installed apps rarely look for
  // updates on their own, so check whenever the app comes back to the foreground.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) $("update-bar").hidden = false;
  });
  navigator.serviceWorker
    .register("/sw.js")
    .then((reg) => document.addEventListener("visibilitychange", () => !document.hidden && reg.update().catch(() => {})))
    .catch(() => {});
  $("update-reload").addEventListener("click", () => {
    saveLocal();
    location.reload();
  });
}
let installPrompt = null;
addEventListener("beforeinstallprompt", (e) => {
  // Keep the browser's prompt for our own button instead of a surprise banner.
  e.preventDefault();
  installPrompt = e;
  $("install-wrap").hidden = false;
});
addEventListener("appinstalled", () => {
  installPrompt = null;
  $("install-wrap").hidden = true;
  toast("📲 Installed. See you on your home screen.");
});
$("install").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("install-wrap").hidden = true;
});

// Settings → Display/Game controls that map straight onto a preference: [element id, pref key].
const SELECT_PREFS = [["opt-motion", "motion"], ["opt-scene", "sceneMode"], ["opt-toasts", "toasts"], ["opt-clock", "clock"], ["opt-fps", "fps"], ["opt-contrast", "contrast"]];
const TOGGLE_PREFS = [["opt-particles", "particles"], ["opt-shake", "shake"], ["opt-querylog", "querylog"]];
function showPrefs() {
  $("opt-notation").value = prefs.notation;
  $("opt-quality").value = prefs.quality;
  $("opt-mood").value = prefs.mood;
  $("opt-stats").checked = statsAllowed();
  $("gpc-note").hidden = !browserOptOut();
  $("opt-muted").checked = prefs.muted;
  for (const k of ["master", "sfx", "music"]) {
    const el = $(`opt-${k}`);
    el.value = prefs[k];
    el.nextElementSibling.textContent = `${Math.round(prefs[k] * 100)}%`;
  }
  document.body.classList.toggle("low", prefs.quality === "low");
  document.body.classList.toggle("no-motion", prefs.motion === "reduced");
  document.documentElement.classList.toggle("hc", prefs.contrast === "high");
  document.body.classList.toggle("no-particles", !prefs.particles);
  scene.setQuality(prefs.quality);
  setFrameCap(Number(prefs.fps));
  scene.setMotion({ reduced: prefs.motion === "reduced", shake: prefs.shake, mode: prefs.sceneMode });
  document.querySelector(".stage").hidden = prefs.sceneMode === "hidden";
  for (const [id, key] of SELECT_PREFS) $(id).value = prefs[key];
  for (const [id, key] of TOGGLE_PREFS) $(id).checked = prefs[key];
  $("fullscreen").textContent = document.fullscreenElement ? "⛶ Exit full screen" : "⛶ Full screen";
}

$("opt-notation").addEventListener("change", (e) => {
  setPref("notation", e.target.value);
  setNotation(prefs.notation);
  render(true);
});
for (const [id, key] of SELECT_PREFS) {
  $(id).addEventListener("change", (e) => {
    setPref(key, e.target.value);
    showPrefs();
  });
}
for (const [id, key] of TOGGLE_PREFS) {
  $(id).addEventListener("change", (e) => {
    setPref(key, e.target.checked);
    showPrefs();
    render(true);
  });
}
$("opt-chal-confirm").addEventListener("change", (e) => setPref("skipChalConfirm", !e.target.checked));
$("opt-quality").addEventListener("change", (e) => {
  setPref("quality", e.target.value);
  showPrefs();
});
$("opt-muted").addEventListener("change", (e) => {
  setPref("muted", e.target.checked);
  audio.applyVolumes();
});
for (const k of ["master", "sfx", "music"]) {
  $(`opt-${k}`).addEventListener("input", (e) => {
    setPref(k, Number(e.target.value));
    e.target.nextElementSibling.textContent = `${Math.round(prefs[k] * 100)}%`;
    audio.applyVolumes();
  });
  // A short blip so the effects slider is audible while you drag it.
  if (k === "sfx") $("opt-sfx").addEventListener("change", () => audio.sfx("buy"));
}

// Full screen only where it works well: a desktop pointer and the Fullscreen API.
$("fullscreen-wrap").hidden = !(document.fullscreenEnabled && matchMedia("(pointer: fine)").matches);
function toggleFullscreen() {
  if (!document.fullscreenEnabled) return;
  (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
}
$("fullscreen").addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", showPrefs);

$("schema-seg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-view]");
  if (!b) return;
  for (const x of $("schema-seg").children) x.classList.toggle("on", x === b);
  $("erd").hidden = b.dataset.view !== "erd";
  $("ddl").hidden = b.dataset.view !== "ddl";
});

$("settings-seg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-section]");
  if (!b) return;
  for (const x of $("settings-seg").children) {
    x.classList.toggle("on", x === b);
    x.setAttribute("aria-pressed", String(x === b));
  }
  for (const sec of document.querySelectorAll("#pane-settings .section")) sec.hidden = sec.dataset.section !== b.dataset.section;
});

function companySlug() {
  return (S.company || "your-startup").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "startup";
}

const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
let konamiAt = 0;
document.addEventListener("keydown", (e) => {
  konamiAt = e.key.toLowerCase() === KONAMI[konamiAt] ? konamiAt + 1 : e.key.toLowerCase() === KONAMI[0] ? 1 : 0;
  if (konamiAt === KONAMI.length) {
    konamiAt = 0;
    grantSecret("konami");
    toast("🎮 +30 lives. Just kidding, this is a data pipeline.");
  }
});

$("save-now").addEventListener("click", () => {
  E.tick(S, Date.now());
  saveLocal();
  pushCloud({ force: false });
  toast("💾 Saved.");
});

// Keyboard shortcuts; ignored while typing or with a dialog open.
const TAB_KEYS = ["sources", "upgrades", "schema", "prestige", "stats", "settings"];
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || $("modal").open || e.target.closest?.("input, textarea, select")) return;
  const k = e.key.toLowerCase();
  // Space presses whatever button has focus; it only means INSERT when nothing does.
  if (k === " " && e.target === document.body) {
    e.preventDefault();
    if (!e.repeat) doInsert();
  } else if (/^[1-6]$/.test(k)) selectTab(TAB_KEYS[Number(k) - 1]);
  else if (k === "b") {
    const order = [1, 10, 100, "max"];
    S.settings.buy = order[(order.indexOf(S.settings.buy) + 1) % order.length];
    render(true);
  } else if (k === "m") {
    setPref("muted", !prefs.muted);
    audio.applyVolumes();
    showPrefs();
    toast(prefs.muted ? "🔇 Muted." : "🔊 Sound on.");
  } else if (k === "f") toggleFullscreen();
});

// Browsers only start audio after a gesture.
for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, () => audio.unlock(), { capture: true });
// ---- feedback -------------------------------------------------------------------

// ---- loop --------------------------------------------------------------------

function loop() {
  const now = Date.now();
  E.tick(S, now);
  lb.tick(S);
  const fresh = E.checkAchievements(S);
  if (fresh.length) {
    audio.sfx("achievement");
    structureKey = "";
    toast(
      fresh.length === 1
        ? `🏅 <b>${esc(fresh[0].name)}</b> added to the Data Catalog.`
        : `🏅 <b>${fresh.length} entries</b> added to the Data Catalog (+${fresh.length}%).`,
      "info",
    );
  }
  const before = S.stats.onlineMs;
  S.stats.onlineMs += document.hidden ? 0 : Math.min(1000, now - lastLoopAt);
  // A snapshot of where players are, every 10 minutes of actual play.
  if (Math.floor(S.stats.onlineMs / 600_000) > Math.floor(before / 600_000)) track("snapshot", S);
  lastLoopAt = now;
  S.stats.bestRate = E.big(S.stats.bestRate).max(E.baseRate(S));
  const result = E.checkChallenge(S, now);
  if (result?.failed) {
    audio.sfx("deny");
    toast(`⏱️ <b>${esc(result.challenge.name)} ${ROMAN[result.tier]}</b> ran out of time. Try again whenever you're ready.`);
    structureKey = "";
  } else if (result) {
    const c = result.challenge;
    track("challenge", S, { detail: result.key.replace("#", "_t") });
    confetti(60);
    const time = fmtDuration(result.ms / 1000);
    const reward = result.tier === 1 ? esc(c.reward) : `Production ×${E.TIER_REWARD}.`;
    toast(`🏁 <b>${esc(c.name)} ${ROMAN[result.tier]} complete</b> in ${time}${result.record ? " (new best)" : ""}. ${reward} Speed bonus ×${E.speedBonus(S, result.key).toFixed(2)}.`);
    structureKey = "";
  }
  E.sampleHistory(S, now);
  autoPrestige();
  checkFinale();
  const completed = E.markCompletion(S, now);
  if (completed) completion().then((c) => c.show(completed));
  checkInbox();
  active.tick();
  if (new Date().getHours() === 3) grantSecret("nightowl");
  if (now >= nextIncidentAt && !document.hidden && E.incidentsAllowed(S)) {
    incidents().then((m) => m.spawn());
    scheduleIncident(now);
  }
  // Nobody is looking when the tab is hidden: redraw once a second instead of five times.
  if (!document.hidden || now - lastRenderAt >= 1000) {
    lastRenderAt = now;
    render();
  }
}
let lastRenderAt = 0;

// ---- walkthrough -------------------------------------------------------------

const walkthrough = lazy(() => import("./walkthrough.js"), (m) => m.createWalkthrough(ctx));
$("replay-tour").addEventListener("click", () => {
  selectTab("sources");
  walkthrough().then((t) => t.start());
});

// Older saves kept the notation in the save itself.
if (S.settings.sci && prefs.notation === "suffix") setPref("notation", "scientific");
setNotation(prefs.notation);
showPrefs();
applyOffline();
render(true);
// Fresh saves only: someone syncing an old save onto a new device doesn't need the tour.
if (!prefs.tourDone && S.everRows.lt(50)) setTimeout(() => walkthrough().then((t) => t.start()), 600);
checkWhatsNew();
lb.init();
document.addEventListener("change", (e) => {
  if (e.target.id === "tour-lb") lb.setOptIn(e.target.checked);
});
rotateTicker();
shownRows = S.rows;
onFrame(animateCounter);
setInterval(loop, 200);
setInterval(() => spark.sample(E.rate(S, Date.now())), 1000);
setInterval(autoBuy, 1000);
setInterval(rotateTicker, 9000);
// Screen readers get a short summary now and then instead of the counter ticking every frame.
setInterval(() => {
  if (!document.hidden) $("sr-status").textContent = `${fmt(S.rows)} rows, ${fmt(E.rate(S, Date.now()))} per second.`;
}, 30_000);
setInterval(saveLocal, 5000);
setInterval(() => {
  if (cloudDirty && Date.now() - lastCloudPush > 60_000) pushCloud();
}, 5000);
// What to notify about while the game is closed (if notifications are on). The challenge
// alert comes 10 min before the limit, and only with over 15 min left: the cron runs every
// 5 min, so it lands with 5–10 min to spare.
function pushPlan() {
  const now = Date.now();
  const plan = [{ kind: "cap", at: now + E.offlineCapSecs(S) * 1000, body: "Offline storage is full. The pipelines are idling and the intern has started asking questions." }];
  const t = S.chal && E.parseTier(S.chal);
  const left = E.CHALLENGE_LIMIT_MS - E.challengeElapsed(S, now);
  if (t && left > 15 * 60e3) plan.push({ kind: "chal", at: now + left - 10 * 60e3, body: `${t.challenge.name} ${ROMAN[t.tier]}: 10 minutes left on the clock. Finish it, or abandon it with dignity.` });
  return plan;
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    schedulePush([]);
    applyOffline();
    render(true);
    return;
  }
  schedulePush(pushPlan());
  E.tick(S, Date.now());
  saveLocal();
  if (Date.now() - lastCloudPush > 20_000) pushCloud({ keepalive: true });
});
// Two open tabs would overwrite each other's saves; the tab that's behind adopts the other.
addEventListener("storage", (e) => {
  if (e.key !== SAVE_KEY || !e.newValue) return;
  try {
    const other = fromSave(decodeSave(e.newValue));
    if (E.big(other.everRows ?? 0).gt(S.everRows.add(1))) {
      S = other;
      structureKey = "";
      render(true);
    }
  } catch {
    /* ignore a half-written value */
  }
});
track("session_start", S);
addEventListener("pagehide", () => track("session_end", S));
handleCodeLink();
reconcileCloud();
