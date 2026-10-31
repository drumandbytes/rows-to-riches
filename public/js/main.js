import * as E from "./economy.js";
import { fmt, fmtDuration, setNotation, NOTATIONS } from "./format.js";
import { prefs, setPref } from "./prefs.js";
import * as audio from "./audio.js";
import { TICKER, OFFLINE_JOKES, FINALE, INBOX } from "./flavor.js";
import { createScene, producerHue } from "./scene.js";
import { createQueryLog, createSparkline, sparks, banner, confetti } from "./widgets.js";
import * as sync from "./sync.js";
import { renderErd, erdKey } from "./erd.js";
import { createActive } from "./active.js";
import { track, allowed as statsAllowed } from "./analytics.js";
import { createTour } from "./tour.js";

const SAVE_KEY = "r2r.save";
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

const VERSION = "0.1.5";
const scene = createScene($("scene"));
// OKRs, all-hands and stakeholder requests (active.js).
const active = createActive({
  E, fmt, esc, toast, modal, confetti, $, setHtml,
  sfx: audio.sfx,
  state: () => S,
  changed: () => afterPurchase(),
  track: (event, extra) => track(event, S, extra),
});

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
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return E.normalize(JSON.parse(raw));
  } catch {
    /* corrupt or blocked storage: start fresh */
  }
  return E.newState();
}

function saveLocal() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(S));
  } catch {
    /* private mode */
  }
  cloudDirty = true;
}

function replaceState(next) {
  S = E.normalize(next);
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
  S.lastTick = now - counted * 1000;
  const gained = E.tick(S, now);
  if (away > 60 && gained > 0) {
    const joke = OFFLINE_JOKES[Math.floor(Math.random() * OFFLINE_JOKES.length)](Math.max(1, Math.round(counted / 60)));
    const capped = away > counted ? `<p class="muted">Counted ${fmtDuration(counted)} of ${fmtDuration(away)} (offline cap). Architecture upgrades raise the cap.</p>` : "";
    modal(`<h2>Welcome back</h2><p>While you were away for ${fmtDuration(away)}, your pipelines ingested <b>${fmt(gained)}</b> rows.</p><p class="muted">${esc(joke)}</p>${capped}`, [["Nice", "primary"]]);
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
  const v = E.clickValue(S, now) * comboMult();
  E.earn(S, v);
  S.clicks++;
  S.stats.runClicks++;
  S.stats.bestClick = Math.max(S.stats.bestClick, v);
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

function onBuyUpgrade(id, btn) {
  E.tick(S, Date.now());
  if (!E.buyUpgrade(S, id)) return audio.sfx("deny");
  audio.sfx("upgrade");
  sparkFrom(btn);
  toast(`🛠️ <b>${esc(E.UPGRADE_BY_ID[id].name)}</b> deployed.`, "info");
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

const LAYERS = [
  {
    id: "replat", icon: "💡", name: "Re-platform", cur: "Insights",
    have: (s) => s.ins, spendable: (s) => s.ins - s.insSpent,
    pending: E.pendingInsights, run: E.replatform, verb: "Re-platform",
    progress: (s) => `Next Insight at ${fmt(E.nextInsightAt(s))} company rows (${fmt(s.coRows)} so far).`,
    effect: (s) => `Each Insight gives +${E.insightPct(s) * 100}% production (now +${fmt(s.ins * E.insightPct(s) * 100)}%).`,
    confirm: "Rewrite everything in this year's hot new stack. You lose rows, Data Sources, upgrades and columns.",
    keeps: "Insights, Architecture, Tech Radar and everything above are kept.",
    done: (g) => `💡 <b>Re-platformed.</b> +${fmt(g)} Insights. The new stack is mostly YAML.`,
    visible: () => true,
    shops: ["arch", "radar"],
  },
  {
    id: "acq", icon: "📈", name: "Acquisition", cur: "Equity",
    have: (s) => s.eq, spendable: (s) => s.eq - s.eqSpent,
    pending: E.pendingEquity, run: E.acquire, verb: "Get acquired",
    progress: (s) => `Next Equity at ${fmt(E.nextEquityAt(s))} civilization rows (${fmt(s.civRows)} so far).`,
    effect: (s) => `Equity boosts production (now ×${fmt((1 + s.eq) ** 0.25)}) and buys Board seats.`,
    confirm: "A bigger fish buys your company. You also lose Insights, Architecture and the Tech Radar.",
    keeps: "Equity, the Board and everything above are kept.",
    done: (g) => `📈 <b>Acquired!</b> +${fmt(g)} Equity. Your new title is 'Head of Data Synergies'.`,
    visible: (s) => s.acq > 0 || s.contact > 0 || s.bangs > 0 || s.ins >= 50,
    teaser: "Unlocks once you have 50 Insights.",
    shops: ["board"],
  },
  {
    id: "contact", icon: "👽", name: "First Contact", cur: "Xenobytes",
    have: (s) => s.xeno, spendable: (s) => s.xeno - s.xenoSpent,
    pending: E.pendingXeno, run: E.firstContact, verb: "Make contact",
    progress: (s) =>
      E.rndComplete(s)
        ? `Next Xenobyte at ${fmt(E.nextXenoAt(s))} universe rows (${fmt(s.allRows)} so far).`
        : `The aliens only talk to civilizations with a complete R&D Lab (${E.boardLevel(s, "rnd")}/${E.RND_PRODUCERS}, on the Board).`,
    effect: (s) => `Xenobytes boost production (now ×${fmt((1 + s.xeno) ** 0.25)}) and buy alien tech.`,
    confirm: "Aliens arrive. They are very interested in your schema. You also lose Equity and the Board.",
    keeps: "Xenobytes, Xenotech and Axioms are kept.",
    done: (g) => `👽 <b>Contact made.</b> +${fmt(g)} Xenobytes. They brought their own data types.`,
    visible: (s) => s.contact > 0 || s.bangs > 0 || s.acq >= 3,
    teaser: "Unlocks after 3 acquisitions.",
    shops: ["xeno"],
  },
  {
    id: "bang", icon: "🌀", name: "Big Bang", cur: "Axioms",
    have: (s) => s.axioms, spendable: () => 0,
    pending: E.pendingAxioms, run: E.bigBang, verb: "Big Bang",
    progress: (s) => (E.canBigBang(s) ? `Axioms grow with universe rows: one per 30 orders of magnitude (${fmt(s.allRows)} so far).` : "Own Everything Is Data to end this universe."),
    effect: (s) => `Each Axiom: production ×3 and every prestige gain ×1.5 (you have ${s.axioms}).`,
    confirm: "End this universe and start a new one. Everything resets except Axioms, the Data Catalog and lifetime stats.",
    keeps: "Axioms are permanent.",
    done: (g) => `🌀 <b>Let there be rows.</b> +${g} Axioms. A new universe boots up on localhost.`,
    visible: (s) => s.contact > 0 || s.bangs > 0,
    teaser: "Unlocks after First Contact.",
    shops: [],
  },
];
const LAYER_BY_ID = Object.fromEntries(LAYERS.map((l) => [l.id, l]));
let prestigeTab = "replat";

const SHOP_META = {
  arch: { title: "Architecture", icon: "🏗️", cur: "💡", note: "One-time. Spending Insights doesn't lower their bonus." },
  radar: { title: "Tech Radar", icon: "📡", cur: "💡", note: "Levels. Reset by acquisitions (Golden Parachute keeps some)." },
  board: { title: "Board", icon: "🏛️", cur: "📈", note: "Levels. Reset by First Contact (unless you own Probe Swarm)." },
  xeno: { title: "Xenotech", icon: "🛸", cur: "👽", note: "Levels. Reset by a Big Bang." },
};

// Which retention rewards apply when prestiging at each layer.
const RETENTION = { replat: ["keepupg", "keepcols", "keepsrc"], acq: ["keepradar", "keepins"], contact: ["keepeq", "keepcontact"], bang: ["keepxeno", "keepboard"] };

function onPrestige(layer) {
  const gain = layer.pending(S);
  if (gain < 1) return;
  const kept = (RETENTION[layer.id] ?? []).filter((id) => E.won(S, id)).map((id) => `<li>${esc(E.CHALLENGE_BY_ID[id].reward)}</li>`);
  modal(
    `<h2>${layer.icon} ${layer.verb}?</h2><p>${esc(layer.confirm)}</p><p>You gain <b>${fmt(gain)} ${layer.cur}</b>.</p><p class="muted">${esc(layer.keeps)}</p>${kept.length ? `<p>🏆 Challenge rewards in effect:</p><ul class="kept">${kept.join("")}</ul>` : ""}`,
    [["Cancel"], [layer.verb, "primary", () => doPrestige(layer)]],
  );
}

function doPrestige(layer, quiet = false) {
  E.tick(S, Date.now());
  const gain = layer.run(S);
  if (gain < 1) return;
  track(layer.id, S);
  if (!quiet) {
    toast(layer.done(gain));
    scene.shake();
    audio.sfx("prestige");
  }
  afterPurchase();
}

function shopItems(shop) {
  // Architecture is paid in Insights like the Radar, so it borrows the Radar's currency keys.
  const [defs, key, cur, spent] = E.SHOPS[shop === "arch" ? "radar" : shop];
  const free = S[cur] - S[spent];
  if (shop === "arch") {
    return E.ARCH.map((a) => {
      const owned = S.arch.includes(a.id);
      return { id: a.id, name: a.name, desc: a.desc, owned, cost: a.cost, afford: !owned && free >= a.cost, label: owned ? "Owned" : `${fmt(a.cost)} ${SHOP_META.arch.cur}` };
    });
  }
  return Object.values(defs).map((d) => {
    const l = S[key][d.id] ?? 0;
    const maxed = l >= d.max;
    const cost = E.levelCost(d, l);
    const lv = d.max === 1 ? "" : d.max >= 100 ? `Lv ${l}` : `Lv ${l}/${d.max}`;
    return { id: d.id, name: d.name, lv, desc: d.desc(l), owned: maxed, cost, afford: !maxed && free >= cost, label: maxed ? (d.max === 1 ? "Owned" : "MAX") : `${fmt(cost)} ${SHOP_META[shop].cur}` };
  });
}

function renderShop(shop) {
  const meta = SHOP_META[shop];
  const items = shopItems(shop)
    .map(
      (it) => `<li class="item ${it.owned ? "owned" : ""} ${it.afford ? "affordable" : ""}"><div class="ico" aria-hidden="true">${meta.icon}</div>
      <div><div class="name">${esc(it.name)}${it.lv ? ` <span class="lv">${it.lv}</span>` : ""}</div><div class="sub">${esc(it.desc)}</div></div>
      <button class="buy" type="button" data-shop="${shop}" data-item="${it.id}" ${it.afford ? "" : "disabled"}>${it.label}</button></li>`,
    )
    .join("");
  return `<h3>${meta.title}</h3><p class="muted">${meta.note}</p><ul class="list">${items}</ul>`;
}

function renderPrestige() {
  // Tab dot: some layer would at least double its currency.
  const ready = LAYERS.some((l) => l.visible(S) && l.pending(S) >= Math.max(1, l.have(S)));
  $("ins-dot").hidden = !ready;
  if (tab !== "prestige") return;
  const visible = LAYERS.filter((l) => l.visible(S));
  const chalOpen = E.CHALLENGE_LAYERS.some((l) => l.unlocked(S));
  const next = LAYERS.find((l) => !l.visible(S));
  if (prestigeTab === "chal" ? !E.CHALLENGE_LAYERS.some((l) => l.unlocked(S)) : !LAYER_BY_ID[prestigeTab]?.visible(S)) prestigeTab = "replat";
  const seg =
    visible.map((l) => `<button type="button" data-layer="${l.id}" class="${l.id === prestigeTab ? "on" : ""}">${l.icon} ${l.name}${l.pending(S) >= Math.max(1, l.have(S)) ? ' <i class="mini-dot"></i>' : ""}</button>`).join("") +
    (chalOpen ? `<button type="button" data-layer="chal" class="${prestigeTab === "chal" ? "on" : ""}">🏁 Challenges</button>` : "") +
    (next ? `<button type="button" disabled title="${esc(next.teaser)}">🔒 ???</button>` : "");
  if ($("prestige-seg").dataset.html !== seg) {
    $("prestige-seg").dataset.html = seg;
    $("prestige-seg").innerHTML = seg;
  }
  if (prestigeTab === "chal") {
    setHtml("prestige-card", `<div class="replat-card"><div class="muted">Challenges are runs under a restriction. Reach the goal and the restriction lifts and the reward switches on. Rewards last until the next reset of the layer above. Starting one banks your pending Insights and begins a fresh run.</div><div class="muted">Completed: <b>${S.chalDone.length}</b> active · ${fmt(S.chalWins)} all-time</div></div>`);
    setHtml("prestige-shops", renderChallenges());
    return;
  }
  const l = LAYER_BY_ID[prestigeTab];
  const gain = l.pending(S);
  const card = `<div class="replat-card">
    <div class="muted">${l.cur}: <b>${fmt(l.have(S))}</b>${l.shops.length ? ` · spendable ${fmt(l.spendable(S))}` : ""}</div>
    <div class="num">+${fmt(gain)} ${l.icon}</div>
    <div class="muted">${esc(l.progress(S))}</div>
    <div class="muted">${esc(l.effect(S))}</div>
    <button class="big ${gain >= 1 ? "affordable" : ""}" type="button" data-prestige="${l.id}" ${gain >= 1 ? "" : "disabled"}>${l.verb}</button></div>`;
  if ($("prestige-card").dataset.html !== card) {
    $("prestige-card").dataset.html = card;
    $("prestige-card").innerHTML = card;
  }
  const shops = l.shops.map(renderShop).join("") || `<p class="muted">Axioms are never spent. They just make every future universe faster.</p>`;
  if ($("prestige-shops").dataset.html !== shops) {
    $("prestige-shops").dataset.html = shops;
    $("prestige-shops").innerHTML = shops;
  }
}

function setHtml(id, html) {
  const el = $(id);
  if (el.dataset.html === html) return;
  el.dataset.html = html;
  el.innerHTML = html;
}

function renderChallenges() {
  return E.CHALLENGE_LAYERS.map((layer) => {
    if (!layer.unlocked(S)) return `<h3>${esc(layer.name)}</h3><p class="muted">🔒 ${esc(layer.hint)}</p>`;
    const items = E.CHALLENGES.filter((c) => c.layer === layer.id)
      .map((c) => {
        const won = E.won(S, c.id);
        const active = S.chal === c.id;
        const open = E.challengeUnlocked(S, c);
        const btn = won
          ? `<button class="buy" type="button" disabled>✓ Done</button>`
          : active
            ? `<button class="buy" type="button" data-abandon="1">Abandon</button>`
            : open
              ? `<button class="buy" type="button" data-challenge="${c.id}" ${S.chal ? "disabled" : ""}>Start</button>`
              : `<button class="buy" type="button" disabled>🔒 Locked</button>`;
        const lock = !open && !won ? `<div class="sub">🔒 ${esc(c.reqText)}</div>` : "";
        return `<li class="item chal ${won ? "owned" : ""} ${active ? "active" : ""} ${!open && !won ? "locked" : ""}"><div class="ico" aria-hidden="true">${won ? "🏆" : open ? "🏁" : "🔒"}</div>
          <div><div class="name">${esc(c.name)} <span class="lv">goal ${fmt(c.goal)} rows</span></div>
          ${lock}<div class="sub">⛓ ${esc(c.restriction)}</div><div class="sub reward">🎁 ${esc(c.reward)}</div></div>${btn}</li>`;
      })
      .join("");
    return `<h3>${esc(layer.name)}</h3><p class="muted">Rewards last until the ${esc(layer.until)}.</p><ul class="list">${items}</ul>`;
  }).join("");
}

function onStartChallenge(id) {
  const c = E.CHALLENGE_BY_ID[id];
  modal(
    `<h2>🏁 ${esc(c.name)}</h2><p>⛓ ${esc(c.restriction)}</p><p>Goal: <b>${fmt(c.goal)}</b> rows in the challenge run.</p><p>🎁 ${esc(c.reward)}</p><p class="muted">Starting banks your pending Insights and begins a fresh run. Stuck? Abandon any time from the banner: the restriction lifts and you keep playing that run, just without the reward.</p>`,
    [["Cancel"], ["Start challenge", "primary", () => {
      E.tick(S, Date.now());
      if (E.startChallenge(S, id)) {
        toast(`🏁 <b>${esc(c.name)}</b> started. Good luck.`);
        afterPurchase();
      }
    }]],
  );
}

function renderChallengeBanner() {
  const c = E.CHALLENGE_BY_ID[S.chal];
  const el = $("chal-banner");
  el.hidden = !c;
  if (!c) return;
  const pct = Math.min(100, (Math.log10(Math.max(1, S.runRows)) / Math.log10(c.goal)) * 100);
  setHtml("chal-banner", `<div class="chal-row"><b>🏁 ${esc(c.name)}</b><span>${fmt(S.runRows)} / ${fmt(c.goal)}</span><button type="button" data-abandon="1">Abandon</button></div><div class="muted">⛓ ${esc(c.restriction)}</div><div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>`);
}

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

// Board / Xenotech automation, checked every tick.
function autoPrestige() {
  if (!E.automationAllowed(S) || S.chal) return;
  if (E.boardLevel(S, "autoreplat") && E.pendingInsights(S) >= Math.max(3, S.ins * (S.settings.autoReplatAt - 1))) {
    doPrestige(LAYER_BY_ID.replat, true);
  }
  if (E.xenoLevel(S, "hive") && E.pendingEquity(S) >= Math.max(1, S.eq)) {
    doPrestige(LAYER_BY_ID.acq);
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
const autoBuyerOwned = () => S.arch.includes("terraform") || E.boardLevel(S, "gitops") > 0;

// Upgrades that multiply production come before INSERT boosts in the "production" order.
const UPG_RANK = { global: 0, producer: 1, synergy: 1, click: 2 };

const gitopsOwned = () => E.boardLevel(S, "gitops") > 0;

// Each source strategy scores the affordable candidates; the auto-buyer buys the top one.
const SOURCE_STRATEGIES = {
  value: (i, gm) => (E.PRODUCERS[i].rate * E.producerMultiplier(S, i) * gm) / E.producerCost(S, i, 1),
  cheapest: (i) => -E.producerCost(S, i, 1),
  newest: (i) => i,
  // Fewest rows needed to reach the next ×2 threshold wins.
  milestone: (i) => {
    const target = E.nextTierAt(S, i);
    return target === null ? -Infinity : -E.producerCost(S, i, target - S.prod[i]);
  },
};

function autoBuy() {
  if (!E.automationAllowed(S)) return;
  const set = S.settings;
  let bought = false;
  if (gitopsOwned() && set.autoColumns && E.columnCost(S.cols, S) < S.rows * 0.5) bought = E.buyColumn(S) || bought;
  if (gitopsOwned() && set.autoUpgrades) {
    const list = availableUpgrades().filter((u) => u.cost <= S.rows);
    if (set.upgStrategy === "production") list.sort((a, b) => UPG_RANK[a.kind] - UPG_RANK[b.kind] || a.cost - b.cost);
    for (const u of list) {
      if (u.cost > S.rows) continue;
      bought = E.buyUpgrade(S, u.id) || bought;
    }
  }
  if (autoBuyerOwned() && set.autoSources) {
    const score = SOURCE_STRATEGIES[set.autoStrategy] ?? SOURCE_STRATEGIES.value;
    for (let n = 0; n < 20; n++) {
      const gm = E.globalMultiplier(S);
      let best = -1;
      let bestScore = -Infinity;
      for (const p of E.PRODUCERS) {
        if (!E.producerUnlocked(S, p.i) || set.autoSkip.includes(p.id) || E.producerCost(S, p.i, 1) > S.rows) continue;
        const sc = score(p.i, gm);
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

function spawnIncident() {
  const pool = E.incidentsFor(S);
  const total = pool.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  const inc = pool.find((x) => (r -= x.weight) < 0) ?? pool[0];
  const btn = document.createElement("button");
  btn.className = "incident";
  btn.type = "button";
  btn.textContent = inc.labels ? inc.labels[Math.floor(Math.random() * inc.labels.length)] : inc.label;
  btn.style.left = `${8 + Math.random() * (innerWidth - 220)}px`;
  btn.style.top = `${90 + Math.random() * Math.max(80, innerHeight - 260)}px`;
  const gone = setTimeout(() => {
    btn.remove();
    if (inc.trap) passedPhish();
    if (inc.rescue) lostTable();
  }, 13_000);
  const resolve = () => {
    clearTimeout(gone);
    btn.remove();
    resolveIncident(inc);
  };
  btn.addEventListener("click", resolve);
  // Self-healing pipelines fix incidents; they don't click suspicious links.
  if (S.arch.includes("selfheal") && !inc.trap) setTimeout(() => btn.isConnected && resolve(), 3000);
  $("incident-layer").append(btn);
  audio.sfx("incident");
}

function lostTable() {
  E.tick(S, Date.now());
  const lost = S.rows * 0.1;
  S.rows -= lost;
  toast(`💀 <b>Table lost.</b> Nobody restored it in time: −${fmt(lost)} rows. The intern has been promoted to manager.`);
  audio.sfx("deny");
}

function passedPhish() {
  S.stats.phishPassed++;
  E.tick(S, Date.now());
  const amount = E.baseRate(S) * 120 + 13;
  E.earn(S, amount);
  toast(`✅ <b>Phishing test passed.</b> IT is proud of you: +${fmt(amount)} rows.`, "info");
  audio.sfx("achievement");
}

function resolveIncident(inc) {
  const now = Date.now();
  E.tick(S, now);
  scene.shake();
  // A clicked phishing test isn't a resolved incident.
  if (!inc.trap) {
    S.incidents++;
    audio.sfx("resolve");
  }
  if (inc.rescue) {
    S.stats.rescues++;
    const amount = E.baseRate(S) * 60 + 13;
    E.earn(S, amount);
    toast(`🧯 <b>${inc.title}</b>: ${esc(inc.desc)} +${fmt(amount)} rows.`);
  } else if (inc.trap) {
    S.buffs.push({ kind: "prod", mult: inc.buff.mult, until: now + inc.buff.secs * 1000, name: "Security training" });
    grantSecret("phished");
    toast(`🎣 <b>${inc.title}</b>: you clicked it. Production ×${inc.buff.mult} for ${inc.buff.secs}s while you do the training.`);
    audio.sfx("deny");
  } else if (inc.buff) {
    const secs = inc.buff.secs * (S.arch.includes("slo") ? 2 : 1);
    const mult = Math.round(inc.buff.mult * E.incidentMult(S) * 100) / 100;
    S.buffs.push({ kind: inc.buff.kind, mult, until: now + secs * 1000, name: inc.title });
    toast(`${inc.label.split(" ")[0]} <b>${inc.title}</b>: ×${mult} for ${secs}s.`, "info");
  } else if (inc.lump) {
    const amount = Math.min(E.baseRate(S) * 900, S.rows * E.backfillCap(S)) + 13;
    E.earn(S, amount);
    scene.floatText(`+${fmt(amount)}`, "#ffb547");
    scene.burst(12);
    toast(`📦 <b>Backfill complete</b>: +${fmt(amount)} rows.`, "info");
  }
  saveLocal();
  render(true);
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
    rates: E.PRODUCERS.map((p) => (S.prod[p.i] ? E.producerRate(S, p.i, gm) : 0)),
    env,
    sink: fp.idx,
    progress: fp.progress,
  });
  checkEnvironment(env);
  audio.setMood(env.scene);
  $("rate").textContent = fmt(r);
  $("rate").parentElement.title = E.rawRate(S) > E.GRAVITY_AT ? `Data gravity: past ${fmt(E.GRAVITY_AT)} rows/s, extra production has diminishing returns. Raw: ${fmt(E.rawRate(S))}/s.` : "";
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
  renderFootprint(fp);
  renderChallengeBanner();
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
    buildAch();
  }
  updateSources();
  updateUpgrades();
  updateSchema();
  renderPrestige();
  if (tab === "stats") updateStats();
  if (tab === "settings") updateSettings();
}

// Smoothly rolls the big counter towards the real bank; drops snap instantly.
function animateCounter() {
  const target = S.rows;
  shownRows = target < shownRows || Math.abs(target - shownRows) < 1 ? target : shownRows + (target - shownRows) * 0.2;
  $("rows").textContent = fmt(shownRows);
  requestAnimationFrame(animateCounter);
}

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

const sourceVisible = (p) => E.producerUnlocked(S, p.i) && (p.i === 0 || S.prod[p.i] > 0 || S.prod[p.i - 1] > 0 || S.runRows >= p.cost * 0.5);

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
  for (let i = 0; i < units.length; i++) if (S.allRows >= units[i][1]) idx = i;
  const next = units[idx + 1];
  // Log-scale progress so the ring keeps moving between units 1000× apart.
  const progress = next ? Math.min(1, Math.log10(Math.max(1, S.allRows / units[idx][1])) / Math.log10(next[1] / units[idx][1])) : 1;
  return { idx, progress };
}

function renderFootprint({ idx, progress }) {
  const [name, size] = E.STORAGE_UNITS[idx];
  const next = E.STORAGE_UNITS[idx + 1];
  const amount = S.allRows / size;
  const plural = amount >= 2 ? (name.endsWith("y") ? name.slice(0, -1) + "ies" : name + "s") : name;
  const html = `storage footprint: <b>${fmt(amount)} ${plural}</b>${next ? ` → next: ${next[0]}` : ""}<div class="bar"><i style="width:${(progress * 100).toFixed(1)}%"></i></div>`;
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
        <div><div class="name">${esc(p.name)}<span class="count"></span><span class="chip"></span><button type="button" class="auto-chip" data-auto-src="${p.id}" title="Include in the auto-buyer" hidden>🤖</button></div><div class="sub"></div><div class="run-bar"><i></i></div></div>
        <button class="buy" type="button" data-buy-producer="${p.i}"></button></li>`,
      });
    } else if (!teased) {
      teased = true;
      // Keyed by its hint too, so the teaser refreshes when the requirement changes.
      items.push({ key: `lock${p.i}:${lockedHint(p)}`, html: `<li class="node locked"><div class="ico" aria-hidden="true">🔒</div><div><div class="name">???<span class="chip queued">locked</span></div><div class="sub">${esc(lockedHint(p))}</div></div><span></span></li>` });
    }
  }
  syncList($("sources"), items);
  document.querySelectorAll(".buy-amount button[data-buy]").forEach((b) => b.classList.toggle("on", String(S.settings.buy) === b.dataset.buy));
  $("sell-mode").classList.toggle("on", selling);
  $("sell-mode").setAttribute("aria-pressed", selling);
  $("sources").classList.toggle("selling", selling);
}

const sharePct = (f) => (f >= 0.995 ? "100%" : f >= 0.1 ? `${Math.round(f * 100)}%` : f >= 0.001 ? `${(f * 100).toFixed(1)}%` : "<0.1%");

function updateSources() {
  if (tab !== "sources") return;
  const gm = E.globalMultiplier(S);
  const raw = E.rawRate(S) || 1;
  for (const li of $("sources").querySelectorAll("li[data-i]")) {
    const i = Number(li.dataset.i);
    const p = E.PRODUCERS[i];
    const n = buyAmount(i);
    const cost = E.producerCost(S, i, n);
    const each = p.rate * E.producerMultiplier(S, i) * gm;
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
    const total = E.producerRate(S, i, gm);
    li.querySelector(".sub").textContent = owned
      ? `${fmt(each)}/s each · ${fmt(total)}/s total · ${sharePct(total / raw)} of output`
      : `${fmt(each)}/s each · ${p.flavor}`;
    // Run bar: more units → shorter batch cycle.
    const dur = owned ? `${Math.max(0.35, 4 / (1 + Math.log2(owned))).toFixed(2)}s` : "0s";
    const bar = li.querySelector(".run-bar");
    bar.hidden = !owned;
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
    btn.disabled = cost > S.rows;
    li.classList.toggle("affordable", cost <= S.rows);
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
  $("upg-dot").hidden = !list.some((u) => u.cost <= S.rows);
  if (tab !== "upgrades") return;
  for (const li of $("upgrades").querySelectorAll("li[data-u]")) {
    const u = E.UPGRADE_BY_ID[li.dataset.u];
    const blocked = E.rule(S).noUpgrades;
    const btn = li.querySelector(".buy");
    btn.disabled = blocked || u.cost > S.rows;
    btn.title = blocked ? "Upgrades are disabled by the current challenge." : "";
    li.classList.toggle("affordable", !blocked && u.cost <= S.rows);
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
    ? `🔒 Schema frozen by the ${E.CHALLENGE_BY_ID[S.chal].name} challenge`
    : `ALTER TABLE rows ADD COLUMN ${E.columnName(S.cols)} — ${fmt(cost)} rows (each column ×${each})`;
  btn.disabled = frozen || cost > S.rows;
  btn.classList.toggle("affordable", !frozen && cost <= S.rows);
}

function buildAch() {
  const icon = (a) => (a.id.startsWith("own_") ? E.PRODUCERS.find((p) => a.id.startsWith(`own_${p.id}_`))?.icon : { rows: "🗄️", clicks: "👆", cols: "🧱", incidents: "🚨", replat: "💡", acq: "📈", contact: "👽", bangs: "🌀", chal: "🏁", env: "🗺️", combo: "🔥", speed: "⏱️", night: "🌙", full: "🧩", no: "🙌", online: "🌱", rate: "🚿" }[a.id.split("_")[0]]);
  $("ach").innerHTML = E.ACHIEVEMENTS.map((a) => {
    const got = S.ach.includes(a.id);
    const hidden = a.secret && !got;
    const title = got ? `${a.name}: ${a.desc}` : hidden ? "Secret achievement" : `??? — ${a.desc}`;
    const glyph = hidden ? "🤫" : a.id === "clickme" ? "👉" : a.id === "named" ? "🏷️" : a.secret ? "🕵️" : (icon(a) ?? "⭐");
    return `<button type="button" class="${got ? "got" : ""} ${a.id === "clickme" && !got ? "clickme" : ""}" data-ach="${a.id}" title="${esc(title)}" aria-label="${esc(got ? a.name : hidden ? "Secret" : "Locked")}">${glyph}</button>`;
  }).join("");
  $("ach-count").textContent = `${S.ach.length}/${E.ACHIEVEMENTS.length}`;
}

function updateStats() {
  const now = Date.now();
  const rows = [
    ["Company", esc(S.company || "unnamed")],
    ["Rows (bank)", fmt(S.rows)],
    ["Rows this run", fmt(S.runRows)],
    ["Rows/s", fmt(E.rate(S, now))],
    ["Per INSERT", fmt(E.clickValue(S, now))],
    ["Global multiplier", `×${fmt(E.globalMultiplier(S))}`],
    ["INSERTs by hand", fmt(S.clicks)],
    ["Incidents resolved", fmt(S.incidents)],
    ["Re-platforms", fmt(S.replat)],
    ["Insights", fmt(S.ins)],
    ["Acquisitions", fmt(S.acq)],
    ["Equity", fmt(S.eq)],
    ["First Contacts", fmt(S.contact)],
    ["Xenobytes", fmt(S.xeno)],
    ["Universes", fmt(S.bangs + 1)],
    ["Axioms", fmt(S.axioms)],
    ["Rows this company", fmt(S.coRows)],
    ["Rows this universe", fmt(S.allRows)],
    ["Rows ever", fmt(S.everRows)],
    ["Best rows/s", fmt(S.stats.bestRate)],
    ["Data gravity", E.rawRate(S) > E.GRAVITY_AT ? `−${(100 * (1 - E.baseRate(S) / E.rawRate(S))).toFixed(1)}% (raw ${fmt(E.rawRate(S))}/s)` : `none below ${fmt(E.GRAVITY_AT)}/s`],
    ["Best single INSERT", fmt(S.stats.bestClick)],
    ["Longest combo", `×${S.stats.bestCombo}`],
    ["Fastest re-platform", S.stats.fastestReplat ? fmtDuration(S.stats.fastestReplat / 1000) : "—"],
    ["Fastest acquisition", S.stats.fastestAcq ? fmtDuration(S.stats.fastestAcq / 1000) : "—"],
    ["Longest time away", fmtDuration(S.stats.longestAway / 1000)],
    ["Time played", fmtDuration(S.stats.onlineMs / 1000)],
    ["Challenges completed", fmt(S.chalWins)],
    ["Emails received", fmt(S.inbox.length)],
    ["This run", fmtDuration((now - S.runStartedAt) / 1000)],
    ["Playing since", new Date(S.startedAt).toLocaleDateString()],
    ["Offline cap", fmtDuration(E.offlineCapSecs(S))],
  ];
  const html = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  if ($("stats").innerHTML !== html) $("stats").innerHTML = html;
}

function updateSettings() {
  if (document.activeElement !== $("opt-company")) $("opt-company").value = S.company;
  const automation = autoBuyerOwned() || E.boardLevel(S, "autoreplat");
  $("auto-none").hidden = !!automation;
  $("auto-wrap").hidden = !autoBuyerOwned();
  $("auto-gitops").hidden = !gitopsOwned();
  $("auto-gitops-hint").hidden = gitopsOwned() || !autoBuyerOwned();
  const set = S.settings;
  $("opt-auto-sources").checked = set.autoSources;
  $("opt-auto-strategy").value = set.autoStrategy;
  $("opt-auto-upgrades").checked = set.autoUpgrades;
  $("opt-upg-strategy").value = set.upgStrategy;
  $("opt-auto-columns").checked = set.autoColumns;
  $("autoreplat-wrap").hidden = !E.boardLevel(S, "autoreplat");
  if (document.activeElement !== $("opt-autoreplat")) $("opt-autoreplat").value = S.settings.autoReplatAt;
  const box = $("cloud");
  const state = sync.session.token ? "in" : "out";
  if (box.dataset.state === state) return;
  box.dataset.state = state;
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
  else if (r.status === 422) setSyncStatus(`Cloud rejected this save: ${r.data.error}.`);
  else if (r.status === 429) cloudDirty = true;
  else setSyncStatus(`Sync failed (${r.status}).`);
}

function offerCloud(cloud) {
  modal(
    `<h2>Cloud save is ahead</h2><p>The cloud save has <b>${fmt(cloud.everRows ?? cloud.allRows)}</b> lifetime rows; this device has <b>${fmt(S.everRows)}</b>.</p>`,
    [
      ["Keep this device", "", () => pushCloud({ force: true })],
      ["Load cloud save", "primary", () => {
        replaceState(cloud);
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
    if (r.data.save && (r.data.save.everRows ?? r.data.save.allRows) > S.everRows + 1) offerCloud(r.data.save);
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

// Shuffle bag: every line shows once before any repeats. The current environment's lines
// go in three times, older ones once, plus a few that mention your own numbers.
let tickerBag = [];
let tickerEnv = "";
function rotateTicker() {
  const envs = E.ENVIRONMENTS.filter((e) => S.allRows >= e.at && (!e.needs || e.needs(S))).map((e) => e.id);
  const current = envs.at(-1);
  if (!tickerBag.length || tickerEnv !== current) {
    tickerEnv = current;
    const lines = [...envs.flatMap((id) => TICKER[id] ?? []), ...(TICKER[current] ?? []), ...(TICKER[current] ?? []), ...TICKER.tools, ...(S.replat > 0 ? TICKER.corporate : []), ...dynamicTicker()];
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
  for (const b of document.querySelectorAll(".tabs button")) b.setAttribute("aria-selected", String(b.dataset.tab === name));
  for (const p of document.querySelectorAll(".pane")) p.hidden = p.id !== `pane-${name}`;
  if (name === "stats") buildAch();
  render(true);
}

document.querySelector(".tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b) selectTab(b.dataset.tab);
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
    prestigeTab = t.dataset.layer;
    render(true);
  } else if (t.dataset.prestige) onPrestige(LAYER_BY_ID[t.dataset.prestige]);
  else if (t.dataset.challenge) onStartChallenge(t.dataset.challenge);
  else if (t.closest("[data-request]")) active.answer(t.closest("[data-request]").dataset.request);
  else if (t.dataset.okrToggle) $("okr-strip").classList.toggle("open");
  else if (t.dataset.feedback) openFeedback();
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
    else toast(a.secret ? "🤫 A secret. Keep playing… or keep poking around." : `🔒 ${esc(a.desc)}`);
  } else if (t.id === "add-column") onBuyColumn(t);
  else if (t.id === "sync-now") pushCloud();
  else if (t.id === "create-code") {
    t.disabled = true;
    sync
      .createCode()
      .then((r) => {
        if (!r.ok) return toast(`☁️ ${esc(r.data.error ?? `Couldn't create a code (${r.status}).`)}`);
        render(true);
        showCode(r.data.code, true);
        reconcileCloud();
      })
      .catch(() => toast("☁️ Couldn't reach the server."))
      .finally(() => (t.disabled = false));
  } else if (t.id === "new-code") {
    modal(`<h2>Get a new account code?</h2><p>Your current code stops working. Use this if you lost it, or if someone else has it.</p>`, [
      ["Cancel"],
      ["New code", "primary", async () => {
        const r = await sync.rotateCode().catch(() => null);
        if (r?.ok) showCode(r.data.code, false);
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
  } else if (t.id === "export") exportSave();
  else if (t.id === "import") importSave();
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
  showPrefs();
});
$("opt-mood").addEventListener("change", (e) => {
  setPref("mood", e.target.value);
  audio.unlock();
  audio.refreshMood();
});
$("opt-notation").innerHTML = Object.entries(NOTATIONS).map(([k, label]) => `<option value="${k}">${label}</option>`).join("");
$("about-version").textContent = `v${VERSION}`;
// Embedded (e.g. on galaxy.click): the iframe has its own storage, so cloud sign-in
// from here can't work; say so instead of offering it.
const embedded = window.top !== window.self;
$("embed-note").hidden = !embedded;
$("cloud").hidden = embedded;

// Installable app: offline shell via the service worker (not inside someone else's iframe).
if ("serviceWorker" in navigator && !embedded) navigator.serviceWorker.register("/sw.js").catch(() => {});
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

function showPrefs() {
  $("opt-notation").value = prefs.notation;
  $("opt-quality").value = prefs.quality;
  $("opt-mood").value = prefs.mood;
  $("opt-stats").checked = prefs.stats && statsAllowed();
  $("opt-stats").disabled = !!navigator.globalPrivacyControl || navigator.doNotTrack === "1";
  $("opt-muted").checked = prefs.muted;
  for (const k of ["master", "sfx", "music"]) {
    const el = $(`opt-${k}`);
    el.value = prefs[k];
    el.nextElementSibling.textContent = `${Math.round(prefs[k] * 100)}%`;
  }
  document.body.classList.toggle("low", prefs.quality === "low");
  document.body.classList.toggle("no-motion", prefs.motion === "reduced");
  document.body.classList.toggle("no-particles", !prefs.particles);
  scene.setQuality(prefs.quality);
  scene.setMotion({ reduced: prefs.motion === "reduced", shake: prefs.shake, mode: prefs.sceneMode });
  document.querySelector(".stage").hidden = prefs.sceneMode === "hidden";
  for (const [id, key] of [["opt-motion", "motion"], ["opt-scene", "sceneMode"], ["opt-toasts", "toasts"], ["opt-clock", "clock"]]) $(id).value = prefs[key];
  for (const [id, key] of [["opt-particles", "particles"], ["opt-shake", "shake"], ["opt-querylog", "querylog"]]) $(id).checked = prefs[key];
  $("fullscreen").textContent = document.fullscreenElement ? "⛶ Exit full screen" : "⛶ Full screen";
}

$("opt-notation").addEventListener("change", (e) => {
  setPref("notation", e.target.value);
  setNotation(prefs.notation);
  render(true);
});
for (const [id, key] of [["opt-motion", "motion"], ["opt-scene", "sceneMode"], ["opt-toasts", "toasts"], ["opt-clock", "clock"]]) {
  $(id).addEventListener("change", (e) => {
    setPref(key, e.target.value);
    showPrefs();
  });
}
for (const [id, key] of [["opt-particles", "particles"], ["opt-shake", "shake"], ["opt-querylog", "querylog"]]) {
  $(id).addEventListener("change", (e) => {
    setPref(key, e.target.checked);
    showPrefs();
    render(true);
  });
}
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
  for (const x of $("settings-seg").children) x.classList.toggle("on", x === b);
  for (const sec of document.querySelectorAll("#pane-settings .section")) sec.hidden = sec.dataset.section !== b.dataset.section;
});

function companySlug() {
  return (S.company || "your-startup").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "startup";
}

$("opt-company").addEventListener("change", (e) => {
  S.company = E.cleanCompany(e.target.value);
  e.target.value = S.company;
  saveLocal();
  if (S.company) toast(`🏷️ Welcome to <b>${esc(S.company)}</b>.`);
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
$("opt-autoreplat").addEventListener("change", (e) => {
  S.settings.autoReplatAt = Math.max(1.1, Number(e.target.value) || 2);
  saveLocal();
});
// Auto-buyer settings live in the save (they're about this game, not this device).
for (const [id, key, kind] of [
  ["opt-auto-sources", "autoSources", "check"], ["opt-auto-upgrades", "autoUpgrades", "check"], ["opt-auto-columns", "autoColumns", "check"],
  ["opt-auto-strategy", "autoStrategy", "value"], ["opt-upg-strategy", "upgStrategy", "value"],
]) {
  $(id).addEventListener("change", (e) => {
    S.settings[key] = kind === "check" ? e.target.checked : e.target.value;
    saveLocal();
    updateSettings();
  });
}

$("cloud").addEventListener("submit", (e) => {
  e.preventDefault();
  codeSignIn($("code-input").value, $("code-status"));
});

// ---- feedback -------------------------------------------------------------------

function feedbackContext() {
  return {
    v: VERSION,
    env: E.environmentFor(S).id,
    device: matchMedia("(pointer: coarse)").matches ? "mobile" : "desktop",
    notation: prefs.notation,
    replat: S.replat,
    acq: S.acq,
    contact: S.contact,
    bangs: S.bangs,
    log10Rows: Math.round(Math.log10(S.everRows + 1) * 10) / 10,
    playHours: Math.round((S.stats.onlineMs / 3.6e6) * 10) / 10,
  };
}

function openFeedback() {
  const ctx = feedbackContext();
  modal(
    `<h2>💬 Send feedback</h2>
     <div class="feedback">
       <label class="field">Type <select id="fb-category"><option value="bug">🐛 Bug</option><option value="idea">💡 Idea</option><option value="balance">⚖️ Balance</option><option value="other">💬 Other</option></select></label>
       <textarea id="fb-message" maxlength="2000" placeholder="What happened, what would make it better, or what made you laugh…"></textarea>
       <input type="email" id="fb-contact" placeholder="Email, if you'd like a reply (optional)" />
       <input type="text" id="fb-website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
       <p class="muted">Sent along: version ${esc(ctx.v)}, ${esc(ctx.env)}, ${esc(ctx.device)}, ${ctx.replat} re-platforms, ${ctx.acq} acquisitions, ~${ctx.playHours}h played. Nothing that identifies you unless you add an email.</p>
       <p class="muted" id="fb-status"></p>
     </div>`,
    [["Cancel"], ["Send", "primary"]],
  );
  // Dialog buttons submit (and close) by default; Send stays open until the server accepts.
  const send = [...document.querySelectorAll("#modal button")].find((b) => b.textContent === "Send");
  send.type = "button";
  send.addEventListener("click", () => sendFeedback(send));
  setTimeout(() => $("fb-message").focus());
}

async function sendFeedback(btn) {
  const message = $("fb-message").value.trim();
  if (message.length < 5) {
    $("fb-status").textContent = "Please write a little more.";
    return;
  }
  btn.disabled = true;
  $("fb-status").textContent = "Sending…";
  try {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: $("fb-category").value, message, contact: $("fb-contact").value, website: $("fb-website").value, context: feedbackContext() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
    $("modal").close();
    toast("💬 Thanks! Your feedback was sent. A ticket has been created and assigned to nobody.");
  } catch (err) {
    $("fb-status").textContent = err instanceof Error ? err.message : "Couldn't send. Are you offline?";
    btn.disabled = false;
  }
}

function exportSave() {
  E.tick(S, Date.now());
  const text = btoa(unescape(encodeURIComponent(JSON.stringify(S))));
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
        const raw = JSON.parse(decodeURIComponent(escape(atob($("import-text").value.trim()))));
        replaceState(raw);
        toast("Save imported.");
        pushCloud({ force: true });
      } catch {
        toast("That doesn't look like a save.");
      }
    }],
  ]);
}

// ---- loop --------------------------------------------------------------------

function loop() {
  const now = Date.now();
  E.tick(S, now);
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
  S.stats.bestRate = Math.max(S.stats.bestRate, E.baseRate(S));
  const done = E.checkChallenge(S);
  if (done) {
    track("challenge", S, { detail: done.id });
    confetti(60);
    toast(`🏁 <b>${esc(done.name)} complete!</b> ${esc(done.reward)}`);
    structureKey = "";
  }
  autoPrestige();
  checkFinale();
  checkInbox();
  active.tick();
  if (new Date().getHours() === 3) grantSecret("nightowl");
  if (now >= nextIncidentAt && !document.hidden && E.incidentsAllowed(S)) {
    spawnIncident();
    scheduleIncident(now);
  }
  render();
}

// ---- walkthrough -------------------------------------------------------------

const tabButton = (name) => document.querySelector(`.tabs button[data-tab="${name}"]`);
const tour = createTour(
  [
    { title: "Welcome to the data team", text: "You <i>are</i> the data team. Your job: rows. Lots of rows. This short tour shows the basics; you can replay it any time from Settings → Help.", next: "Show me around" },
    { title: "Press INSERT", text: "Every press adds rows. Press quickly to build a combo (Space works too). Try it a few times.", target: () => $("insert"), until: () => S.clicks >= 5 },
    {
      title: "Hire your first Data Source",
      text: "A Spreadsheet Intern types rows for you every second, even while the game is closed. Keep pressing INSERT until you can afford one, then buy it.",
      target: () => $("sources").querySelector("li[data-i]"),
      enter: () => selectTab("sources"),
      until: () => S.prod[0] >= 1,
    },
    { title: "Rows and rows per second", text: "Your bank, and how much your sources make per second. Buy more sources, and better ones, to grow it. ×10 and max buy in bulk; <b>sell</b> sells sources back for half.", target: () => document.querySelector(".counter") },
    { title: "Upgrades", text: "Owning more of a source unlocks upgrades: ×2 production, synergies between neighbouring sources, a stronger INSERT. A dot on the tab means you can afford one.", target: () => tabButton("upgrades") },
    { title: "Schema", text: "Columns multiply <i>everything</i>. They're expensive, and worth it.", target: () => tabButton("schema") },
    { title: "Prestige", text: "Growth eventually slows. Then you re-platform: start over with Insights that make everything faster. There are four layers of this, and it gets weird.", target: () => tabButton("prestige") },
    { title: "Inbox and incidents", text: "Vendors email you here. Alerts also pop up on screen: click them for bonuses. Except phishing tests. Never click those.", target: () => $("inbox-btn") },
    { title: "That's it", text: "Name your company, change number formats, music and motion under Settings. Help explains every system in detail. Good luck out there.", target: () => tabButton("settings") },
  ],
  { onEnd: () => setPref("tourDone", true) },
);
$("replay-tour").addEventListener("click", () => {
  selectTab("sources");
  tour.start();
});

// Older saves kept the notation in the save itself.
if (S.settings.sci && prefs.notation === "suffix") setPref("notation", "scientific");
setNotation(prefs.notation);
showPrefs();
applyOffline();
render(true);
// Fresh saves only: someone syncing an old save onto a new device doesn't need the tour.
if (!prefs.tourDone && S.everRows < 50) setTimeout(() => tour.start(), 600);
rotateTicker();
shownRows = S.rows;
animateCounter();
setInterval(loop, 200);
setInterval(() => spark.sample(E.rate(S, Date.now())), 1000);
setInterval(autoBuy, 1000);
setInterval(rotateTicker, 9000);
setInterval(saveLocal, 5000);
setInterval(() => {
  if (cloudDirty && Date.now() - lastCloudPush > 60_000) pushCloud();
}, 5000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    applyOffline();
    render(true);
    return;
  }
  E.tick(S, Date.now());
  saveLocal();
  if (Date.now() - lastCloudPush > 20_000) pushCloud({ keepalive: true });
});
// Two open tabs would overwrite each other's saves; the tab that's behind adopts the other.
addEventListener("storage", (e) => {
  if (e.key !== SAVE_KEY || !e.newValue) return;
  try {
    const other = E.normalize(JSON.parse(e.newValue));
    if (other.everRows > S.everRows + 1) {
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
