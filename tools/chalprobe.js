// Time to each tier-I challenge's goal from a bare state, with auto-buying and no clicking.
//   node tools/chalprobe.js [clicksPerSec=0] [layer=replat]
// Shows how much a challenge leans on manual INSERTs (minutes, or ✗ past the time limit).
import * as E from "../public/js/economy.js";

const cps = Number(process.argv[2] ?? 0);
const layer = process.argv[3] ?? "replat";
const DT = 1;
const KIT = JSON.parse(process.env.KIT ?? "{}"); // try kits: KIT='{"legacy":[20,5]}'

function buyStuff(s) {
  for (const u of E.UPGRADES.filter((u) => !s.upg.includes(u.id) && E.upgradeUnlocked(s, u)).sort((a, b) => a.cost - b.cost)) {
    if (!E.buyUpgrade(s, u.id)) break;
  }
  if (E.columnCost(s.cols, s).lt(s.rows.mul(0.5))) E.buyColumn(s);
  for (let i = E.PRODUCERS.length - 1; i >= 0; i--) E.buyProducer(s, i, E.maxAffordable(s, i));
}

for (const c of E.CHALLENGES.filter((c) => c.layer === layer)) {
  const s = E.newState(0);
  Object.assign(s, { replat: 10, incidents: 99, chalWins: 99, ins: E.big(500), eq: E.big(100), xeno: E.big(500), acq: 3 });
  let now = 0;
  if (KIT[c.id]) c.rule.starter = KIT[c.id];
  if (!E.startChallenge(s, c.id, now, 1)) {
    console.log(c.id.padEnd(12), "locked");
    continue;
  }
  let hit = null;
  while (now < E.CHALLENGE_LIMIT_MS && hit === null) {
    now += DT * 1000;
    E.tick(s, now);
    if (E.clickAllowed(s)) E.earn(s, E.clickValue(s, now).mul(cps * DT));
    buyStuff(s);
    if (s.runRows.gte(E.tierGoal(c, 1))) hit = now / 6e4;
  }
  console.log(c.id.padEnd(12), `goal ${E.tierGoal(c, 1).toExponential(1)}`, hit === null ? "✗" : `${hit.toFixed(1)} min`);
}
