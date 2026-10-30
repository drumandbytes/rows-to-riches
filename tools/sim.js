// Balance simulator: plays greedily and prints prestige milestones.
//   node tools/sim.js [hours=72] [clicksPerSec=2]
import * as E from "../public/js/economy.js";

const hours = Number(process.argv[2] ?? 72);
const cps = Number(process.argv[3] ?? 2);
const DT = Number(process.env.DT ?? 5); // seconds per step
// Variant knobs for experiments, e.g. TWEAK='E.BOARD_BY_ID.rnd.max = 0'
if (process.env.TWEAK) new Function("E", process.env.TWEAK)(E);

const s = E.newState(0);
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
      ...E.RADAR.filter((r) => E.radarLevel(s, r.id) < r.max).map((r) => ({ c: E.levelCost(r, E.radarLevel(s, r.id)), buy: () => E.buyLevel(s, "radar", r.id) })),
    ].sort((a, b) => a.c - b.c);
    if (!opts.length || !opts[0].buy()) return;
  }
}

function spendXeno() {
  for (;;) {
    const opts = E.XENOTECH.filter((x) => E.xenoLevel(s, x.id) < x.max)
      .map((x) => ({ c: E.levelCost(x, E.xenoLevel(s, x.id)), buy: () => E.buyLevel(s, "xeno", x.id) }))
      .sort((a, b) => a.c - b.c);
    if (!opts.length || !opts[0].buy()) return;
  }
}

function spendEquity() {
  for (;;) {
    const opts = E.BOARD.filter((b) => E.boardLevel(s, b.id) < b.max)
      .map((b) => ({ c: E.levelCost(b, E.boardLevel(s, b.id)), buy: () => E.buyLevel(s, "board", b.id) }))
      .sort((a, b) => a.c - b.c);
    if (!opts.length || !opts[0].buy()) return;
  }
}

let nextPrint = 0;
while (now < hours * 3.6e6) {
  now += DT * 1000;
  E.tick(s, now);
  E.earn(s, E.clickValue(s, now) * cps * DT);
  buyStuff();
  const env = E.environmentFor(s);
  if (env.id !== lastEnv) {
    lastEnv = env.id;
    log(`env → ${env.name}`);
  }
  const pend = E.pendingInsights(s);
  if (pend >= Math.max(3, s.ins * s.settings.autoReplatAt - s.ins)) {
    E.replatform(s, now);
    spendInsights();
    if (s.replat <= 2 || (process.env.VERBOSE && s.replat % 10 === 0)) log(`re-platform #${s.replat}: +${fmt(pend)} → ${fmt(s.ins)} 💡  radar=${JSON.stringify(s.radar)}`);
  }
  const peq = E.pendingEquity(s);
  if (peq >= Math.max(1, s.eq)) {
    E.acquire(s, now);
    spendEquity();
    spendInsights();
    log(`ACQUISITION #${s.acq}: +${fmt(peq)} → ${fmt(s.eq)} 📈  board=${JSON.stringify(s.board)}`);
  }
  const px = E.pendingXeno(s);
  if (px >= Math.max(1, s.xeno)) {
    E.firstContact(s, now);
    spendXeno();
    spendEquity();
    spendInsights();
    log(`FIRST CONTACT #${s.contact}: +${fmt(px)} → ${fmt(s.xeno)} 👽  xeno=${JSON.stringify(s.xeno_tech)}`);
  }
  if (E.canBigBang(s) && !s.loggedFinale) {
    s.loggedFinale = now;
    log(`FINALE: Everything Is Data owned (axioms pending ${E.pendingAxioms(s)})`);
  }
  // Bang an hour after the finale, to let the axiom count grow a little.
  if (s.loggedFinale && now - s.loggedFinale > 3.6e6) {
    const ax = E.bigBang(s, now);
    s.loggedFinale = 0;
    spendInsights();
    log(`BIG BANG #${s.bangs}: +${ax} → ${s.axioms} 🌀`);
  }
  if (now >= nextPrint) {
    nextPrint += Number(process.env.EVERY ?? 6) * 3.6e6;
    const top = s.prod.findLastIndex((c) => c > 0);
    log(`status: all=${fmt(s.allRows)} rate=${fmt(E.baseRate(s))} top=${E.PRODUCERS[top]?.id} ins=${fmt(s.ins)} eq=${fmt(s.eq)} xeno=${fmt(s.xeno)} replat=${s.replat} acq=${s.acq}`);
  }
}
