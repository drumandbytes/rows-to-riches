// Balance simulator: plays greedily and prints prestige milestones.
//   node tools/sim.js [hours=72] [clicksPerSec=2]
// PROBE=1 calibrates challenge goals: the first time each prestige gate blocks, every tier
// that unlocks in the era just ending is played from that state for an hour and its
// progress printed (log10 run rows at 15/30/45/60 min, and minutes to the current goal).
import * as E from "../public/js/economy.js";

const hours = Number(process.argv[2] ?? 72);
const cps = Number(process.argv[3] ?? 2);
const DT = Number(process.env.DT ?? 5); // seconds per step
// Variant knobs for experiments, e.g. TWEAK='E.BOARD_BY_ID.rnd.max = 0'
if (process.env.TWEAK) new Function("E", process.env.TWEAK)(E);

let s = E.newState(0);
let now = 0;
const log = (msg) => console.log(`${(now / 3.6e6).toFixed(2).padStart(7)}h  ${msg}`);
const fmt = (x) => (x < 1e6 ? Math.round(x).toString() : x.toExponential(2));
let lastEnv = "localhost";

function buyStuff() {
  for (const u of E.UPGRADES.filter((u) => !s.upg.includes(u.id) && E.upgradeUnlocked(s, u)).sort((a, b) => a.cost - b.cost)) {
    if (!E.buyUpgrade(s, u.id)) break;
  }
  if (E.columnCost(s.cols, s) < s.rows * 0.5) E.buyColumn(s);
  // Top tier down, as many as affordable, keeping a little for cheaper tiers.
  for (let i = E.PRODUCERS.length - 1; i >= 0; i--) E.buyProducer(s, i, E.maxAffordable(s, i));
}

function spendInsights() {
  for (;;) {
    const opts = [
      ...E.ARCH.filter((a) => !s.arch.includes(a.id)).map((a) => ({ c: a.cost, buy: () => E.buyArch(s, a.id) })),
      ...E.RADAR.filter((r) => (s.radar[r.id] ?? 0) < r.max).map((r) => ({ c: E.levelCost(r, s.radar[r.id] ?? 0), buy: () => E.buyLevel(s, "radar", r.id) })),
    ].sort((a, b) => a.c - b.c);
    if (!opts.length || !opts[0].buy()) return;
  }
}

function spendXeno() {
  for (;;) {
    const opts = E.XENOTECH.filter((x) => (s.xeno_tech[x.id] ?? 0) < x.max)
      .map((x) => ({ c: E.levelCost(x, s.xeno_tech[x.id] ?? 0), buy: () => E.buyLevel(s, "xeno", x.id) }))
      .sort((a, b) => a.c - b.c);
    if (!opts.length || !opts[0].buy()) return;
  }
}

function spendEquity() {
  for (;;) {
    const opts = E.BOARD.filter((b) => (s.board[b.id] ?? 0) < b.max)
      .map((b) => ({ c: E.levelCost(b, s.board[b.id] ?? 0), buy: () => E.buyLevel(s, "board", b.id) }))
      .sort((a, b) => a.c - b.c);
    if (!opts.length || !opts[0].buy()) return;
  }
}

// Challenges: played only when a gate blocks a prestige that's otherwise ready, easiest
// (lowest goal) first. One that runs out of time is skipped until the next prestige.
let chalStart = 0;
const gaveUp = new Set();
const probedEras = new Set();
function probeEra(layer) {
  const saved = s;
  const out = [];
  for (const c of E.CHALLENGES) {
    for (let t = 1; t <= E.tierCount(c); t++) {
      const key = E.tierKey(c, t);
      if (E.parseTier(key).layer !== layer) continue;
      s = structuredClone(saved);
      // Open the tier for the probe (requirements and lower tiers are not what's measured).
      s.chalEver.push(...Array.from({ length: t - 1 }, (_, k) => E.tierKey(c, k + 1)));
      // Tier I requirements (counts, currencies) only; a tier's own layer and above are off
      // in the probe anyway, so inflating them doesn't change what's measured.
      if (t === 1) Object.assign(s, { replat: Math.max(s.replat, 10), incidents: Math.max(s.incidents, 99), chalWins: Math.max(s.chalWins, 99), ins: Math.max(s.ins, 500), eq: Math.max(s.eq, 100), xeno: Math.max(s.xeno, 500), bangs: Math.max(s.bangs, 2) });
      const start = now;
      if (!E.startChallenge(s, c.id, start, t)) {
        out.push(`${key}:?`);
        continue;
      }
      spendInsights();
      let at = start;
      let hit = null;
      const marks = [];
      for (const m of [15, 30, 45, 60]) {
        while (at - start < m * 6e4) {
          at += DT * 1000;
          E.tick(s, at);
          if (E.clickAllowed(s)) E.earn(s, E.clickValue(s, at) * cps * DT);
          buyStuff();
          if (hit === null && s.runRows >= E.tierGoal(c, t)) hit = (at - start) / 6e4;
        }
        marks.push(Math.log10(Math.max(1, s.runRows)).toFixed(1));
      }
      out.push(`${key}: ${marks.join("/")} goal=${Math.log10(E.tierGoal(c, t)).toFixed(1)} ${hit === null ? "✗" : `✓${hit.toFixed(0)}m`}`);
    }
  }
  s = saved;
  log(`PROBE ${layer}-tiers\n    ${out.join("\n    ")}`);
}

function maybeStartChallenge() {
  const blocked = [
    ["acq", E.pendingEquity(s) >= Math.max(1, s.eq)],
    ["contact", E.pendingXeno(s) >= Math.max(1, s.xeno)],
    ["bang", E.canBigBang(s)],
  ].find(([layer, ready]) => ready && !E.gateOpen(s, layer));
  if (process.env.PROBE && blocked && !probedEras.has(blocked[0])) {
    probedEras.add(blocked[0]);
    probeEra(E.GATE_LAYER[blocked[0]] === "replat" ? "replat" : E.LAYER_ORDER[E.LAYER_ORDER.indexOf(blocked[0]) - 1]);
  }
  // Big Bang tiers: at the second universe's finale, the peak of the era they unlock in.
  if (process.env.PROBE && s.bangs >= 1 && !probedEras.has("bang-era") && E.canBigBang(s)) {
    probedEras.add("bang-era");
    probeEra("bang");
  }
  if (!blocked) return;
  const want = E.GATE_LAYER[blocked[0]];
  const c = E.CHALLENGES.filter((c) => c.layer === want && !s.chalDone.includes(c.id) && !gaveUp.has(c.id) && E.challengeUnlocked(s, c)).sort((a, b) => a.goals[0] - b.goals[0])[0];
  if (!c) return;
  E.startChallenge(s, c.id, now); // banks pending Insights first
  spendInsights();
  chalStart = now;
}
function stepChallenge() {
  const id = s.chal;
  const r = E.checkChallenge(s, now);
  if (!r) return;
  const mins = (now - chalStart) / 6e4;
  if (r.failed) {
    log(`challenge ✗ ${id} out of time after ${mins.toFixed(0)} min`);
    gaveUp.add(id);
  } else log(`challenge ✓ ${id} (${r.challenge.layer}) in ${mins.toFixed(1)} min`);
}

// SUMMARY=1: one line at the end with the milestones that matter for pacing.
const milestones = { acq: [], contact: [], finale: [], bang: [] };
let nextPrint = 0;
while (now < hours * 3.6e6) {
  now += DT * 1000;
  E.tick(s, now);
  E.earn(s, E.clickValue(s, now) * cps * DT);
  buyStuff();
  const env = E.environmentFor(s);
  if (env.id !== lastEnv) {
    lastEnv = env.id;
    log(`env → ${env.name} (company rows 1e${Math.log10(Math.max(1, s.coRows)).toFixed(1)})`);
  }
  if (s.chal) {
    stepChallenge();
    if (s.chal) continue;
  } else maybeStartChallenge();
  if (s.chal) continue;
  const pend = E.pendingInsights(s);
  if (pend >= Math.max(3, s.ins * s.settings.autoReplatAt - s.ins)) {
    E.replatform(s, now);
    spendInsights();
    if (s.replat <= 2 || (process.env.VERBOSE && s.replat % 10 === 0)) log(`re-platform #${s.replat}: +${fmt(pend)} → ${fmt(s.ins)} 💡  radar=${JSON.stringify(s.radar)}`);
  }
  const peq = E.pendingEquity(s);
  if (peq >= Math.max(1, s.eq) && E.gateOpen(s, "acq")) {
    E.acquire(s, now);
    gaveUp.clear();
    spendEquity();
    spendInsights();
    milestones.acq.push(now / 3.6e6);
    log(`ACQUISITION #${s.acq}: +${fmt(peq)} → ${fmt(s.eq)} 📈  board=${JSON.stringify(s.board)}`);
  }
  const px = E.pendingXeno(s);
  if (px >= Math.max(1, s.xeno) && E.gateOpen(s, "contact")) {
    E.firstContact(s, now);
    gaveUp.clear();
    spendXeno();
    spendEquity();
    spendInsights();
    milestones.contact.push(now / 3.6e6);
    log(`FIRST CONTACT #${s.contact}: +${fmt(px)} → ${fmt(s.xeno)} 👽  xeno=${JSON.stringify(s.xeno_tech)}`);
  }
  if (E.canBigBang(s) && E.gateOpen(s, "bang") && !s.loggedFinale) {
    s.loggedFinale = now;
    milestones.finale.push(now / 3.6e6);
    log(`FINALE: Everything Is Data owned (axioms pending ${E.pendingAxioms(s)})`);
  }
  // Bang an hour after the finale, to let the axiom count grow a little.
  if (s.loggedFinale && now - s.loggedFinale > 3.6e6) {
    const ax = E.bigBang(s, now);
    gaveUp.clear();
    s.loggedFinale = 0;
    spendInsights();
    milestones.bang.push(now / 3.6e6);
    log(`BIG BANG #${s.bangs}: +${ax} → ${s.axioms} 🌀`);
  }
  if (now >= nextPrint) {
    nextPrint += Number(process.env.EVERY ?? 6) * 3.6e6;
    const top = s.prod.findLastIndex((c) => c > 0);
    log(`status: all=${fmt(s.allRows)} rate=${fmt(E.baseRate(s))} top=${E.PRODUCERS[top]?.id} ins=${fmt(s.ins)} eq=${fmt(s.eq)} xeno=${fmt(s.xeno)} replat=${s.replat} acq=${s.acq}`);
  }
}

if (process.env.SUMMARY) {
  const h = (x) => (x === undefined ? "—" : `${x.toFixed(1)}h`);
  const c1 = milestones.contact[0] ?? Infinity;
  const before = milestones.acq.filter((t) => t < c1);
  const gaps = before.slice(1).map((t, i) => t - before[i]);
  const quick = gaps.filter((g) => g < 0.5).length;
  console.log(`SUMMARY acq1=${h(milestones.acq[0])} acq3=${h(milestones.acq[2])} contact1=${h(milestones.contact[0])} finale1=${h(milestones.finale[0])} bang1=${h(milestones.bang[0])} bang2=${h(milestones.bang[1])} | acqs before contact=${before.length}, gaps<30min=${quick}, shortest=${gaps.length ? (Math.min(...gaps) * 60).toFixed(0) : "—"}min`);
}
