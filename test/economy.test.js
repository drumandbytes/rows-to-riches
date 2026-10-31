import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../public/js/economy.js";

const T0 = Date.UTC(2026, 9, 30);

test("every producer has a full set of upgrade names", () => {
  for (const p of E.PRODUCERS) {
    const tiers = E.UPGRADES.filter((u) => u.kind === "producer" && u.target === p.i);
    assert.equal(tiers.length, 11, p.id);
    assert.ok(tiers.every((u) => typeof u.name === "string" && u.name), p.id);
  }
  assert.equal(new Set(E.UPGRADES.map((u) => u.id)).size, E.UPGRADES.length);
});

test("bulk producer cost equals the sum of single purchases", () => {
  const s = E.newState(T0);
  let sum = 0;
  for (let k = 0; k < 10; k++) {
    sum += E.producerCost(s, 2, 1);
    s.prod[2]++;
  }
  s.prod[2] = 0;
  assert.ok(Math.abs(E.producerCost(s, 2, 10) - sum) / sum < 1e-9);
});

test("maxAffordable never overspends", () => {
  const s = E.newState(T0);
  s.rows = 123456;
  const n = E.maxAffordable(s, 0);
  assert.ok(E.producerCost(s, 0, n) <= s.rows);
  assert.ok(E.producerCost(s, 0, n + 1) > s.rows);
});

test("tick integrates buffs piecewise", () => {
  const s = E.newState(T0);
  s.prod[1] = 10; // 10 rows/s
  s.buffs = [{ kind: "prod", mult: 7, until: T0 + 10_000 }];
  E.tick(s, T0 + 20_000);
  assert.ok(Math.abs(s.allRows - (10 * 7 * 10 + 10 * 10)) < 1e-6);
  assert.equal(s.buffs.length, 0);
});

test("replatform grants insights and keeps architecture", () => {
  const s = E.newState(T0);
  E.earn(s, 1e11); // cbrt(1e11 / 1e5) = 100
  s.arch = ["medallion"];
  s.radar = { golden: 2 };
  const gain = E.replatform(s, T0);
  assert.equal(gain, 100);
  assert.equal(s.rows, 0);
  assert.deepEqual(s.prod.slice(0, 3), [20, 10, 0]);
  assert.deepEqual(s.arch, ["medallion"]);
});

test("each layer resets the ones below it and keeps its own currency", () => {
  const s = E.newState(T0);
  E.earn(s, 1e40); // past the Xenobyte threshold (1e36)
  s.ins = 5;
  s.arch = ["medallion"];
  assert.equal(E.acquire(s, T0), 0); // gated: needs 3 completed re-platform challenges
  s.chalDone = ["legacy", "budget", "hiring"];
  assert.ok(E.acquire(s, T0) >= 1);
  assert.equal(s.ins, 0);
  assert.deepEqual(s.arch, []);
  assert.equal(s.coRows, 0);
  assert.ok(s.civRows > 0);
  const eq = s.eq;
  assert.equal(E.firstContact(s, T0), 0); // needs the complete R&D Lab
  s.board.rnd = E.RND_PRODUCERS;
  assert.equal(E.firstContact(s, T0), 0); // and 3 completed acquisition challenges
  s.chalDone = ["takeover", "lockin", "zerotrust"];
  assert.ok(E.firstContact(s, T0) >= 1);
  assert.equal(s.eq, 0);
  assert.ok(eq > 0 && s.xeno >= 1 && s.contact === 1);
  s.finale = true;
  s.chalDone = ["translation", "darkforest", "heatdeath"];
  assert.ok(E.bigBang(s, T0) >= 1);
  assert.equal(s.allRows, 0);
  assert.equal(s.xeno, 0);
  assert.ok(s.everRows >= 1e34);
});

test("levelled shops charge growing prices", () => {
  const s = E.newState(T0);
  s.ins = 9;
  assert.ok(E.buyLevel(s, "radar", "defaults")); // 2
  assert.ok(E.buyLevel(s, "radar", "defaults")); // 6
  assert.ok(!E.buyLevel(s, "radar", "defaults")); // 18 > 1 left
  assert.equal(s.insSpent, 8);
  assert.equal(E.spentOnInsights(s), 8);
});

test("R&D and contact gate the late sources", () => {
  const s = E.newState(T0);
  assert.ok(E.producerUnlocked(s, E.BASE_PRODUCERS - 1));
  assert.ok(!E.producerUnlocked(s, E.BASE_PRODUCERS));
  s.board.rnd = 1;
  assert.ok(E.producerUnlocked(s, E.BASE_PRODUCERS));
  assert.ok(!E.producerUnlocked(s, E.FINAL_PRODUCER));
  s.xeno_tech.contact = 5;
  // Alien sources wait for the whole R&D tier.
  assert.ok(!E.producerUnlocked(s, E.FINAL_PRODUCER));
  s.board.rnd = E.RND_PRODUCERS;
  assert.ok(E.producerUnlocked(s, E.FINAL_PRODUCER));
});

function playHonestly(seconds) {
  const s = E.newState(T0);
  let now = T0;
  for (let t = 0; t < seconds; t++) {
    now += 1000;
    E.tick(s, now);
    for (let c = 0; c < 5; c++) {
      E.earn(s, E.clickValue(s, now));
      s.clicks++;
    }
    for (const u of E.UPGRADES) E.buyUpgrade(s, u.id);
    for (let i = E.PRODUCERS.length - 1; i >= 0; i--) E.buyProducer(s, i, E.maxAffordable(s, i));
    E.buyColumn(s);
  }
  E.checkAchievements(s);
  return { s, now };
}

test("an honest save passes the plausibility check", () => {
  const { s } = playHonestly(1800);
  assert.ok(s.allRows > 1e5, `only ${s.allRows}`);
  assert.equal(E.implausible(null, E.normalize(JSON.parse(JSON.stringify(s))), 1800), null);
});

test("an incremental honest upload passes", () => {
  const { s: a } = playHonestly(600);
  const { s: b } = playHonestly(1200);
  assert.equal(E.implausible(a, b, 600), null);
});

test("edited saves are rejected", () => {
  const { s } = playHonestly(600);
  const rich = { ...s, rows: 1e30, runRows: 2e30, coRows: 2e30, civRows: 2e30, allRows: 2e30, everRows: 2e30 };
  assert.match(E.implausible(s, rich, 60), /faster than possible/);

  const overspent = { ...s, prod: s.prod.map((c) => c + 100) };
  assert.match(E.implausible(s, overspent, 60), /spent more/);

  const insightful = { ...s, ins: 1e6 };
  assert.match(E.implausible(s, insightful, 60), /insights/);

  const equity = { ...s, eq: 5 };
  assert.match(E.implausible(s, equity, 60), /equity/);

  const unlocked = { ...s, prod: s.prod.map((c, i) => (i === E.FINAL_PRODUCER ? 1 : c)) };
  assert.match(E.implausible(s, unlocked, 60), /not unlocked|spent more/);
});

test("normalize repairs junk", () => {
  const s = E.normalize({ rows: -5, prod: [3, "x"], upg: ["nope", "intern_0"], arch: ["agi", "agi"], board: { rnd: 99 }, freeIns: { arch: ["agi"] } }, T0);
  assert.equal(s.rows, 0);
  assert.equal(s.prod[0], 3);
  assert.equal(s.prod[1], 0);
  assert.deepEqual(s.upg, ["intern_0"]);
  assert.deepEqual(s.arch, ["agi"]);
  assert.equal(s.board.rnd, E.RND_PRODUCERS);
  // Free architecture only exists with Golden Handcuffs.
  assert.deepEqual(s.freeIns.arch, []);
});

test("challenges restrict the run, then reward until the layer above resets", () => {
  const s = E.newState(T0);
  E.earn(s, 2e9); // enough company rows for 25 Insights (Hiring Freeze's requirement)
  s.ins = 25;
  s.radar = { golden: 1 };
  s.insSpent = 3;
  assert.ok(E.startChallenge(s, "hiring", T0));
  assert.equal(s.prod[0], 0); // Interns are off-limits in Hiring Freeze
  assert.ok(!E.producerUnlocked(s, 2) && E.producerUnlocked(s, 3));
  assert.ok(s.prod.every((c, i) => !c || E.producerUnlocked(s, i))); // nothing the server would call "not unlocked"
  // Re-platform challenges are played without the Insight bonus.
  const before = E.globalMultiplier(s);
  E.earn(s, 1e10);
  assert.equal(E.checkChallenge(s, T0 + 60e3).challenge.id, "hiring");
  assert.equal(s.chal, null);
  assert.ok(E.producerUnlocked(s, 0));
  const insightBonus = 1 + E.insightBonus(s);
  assert.ok(Math.abs(E.globalMultiplier(s) / before - 5 * insightBonus * E.speedBonus(s, "hiring")) < 1e-9);
  // A re-platform keeps the reward; an acquisition drops it.
  E.earn(s, 1e30);
  E.replatform(s, T0);
  assert.ok(E.won(s, "hiring"));
  s.chalDone.push("legacy", "budget");
  E.acquire(s, T0);
  assert.ok(!E.won(s, "hiring"));
});

test("challenge rules block the restricted actions", () => {
  const s = E.newState(T0);
  s.ins = 10;
  assert.ok(!E.startChallenge(s, "friday", T0)); // needs 10 resolved incidents first
  s.incidents = 10;
  s.replat = 2;
  assert.ok(E.startChallenge(s, "friday", T0));
  E.earn(s, 1e6);
  assert.equal(E.clickValue(s), 0);
  assert.ok(!E.buyUpgrade(s, "click_0"));
  E.startChallenge(s, "legacy", T0);
  E.earn(s, 1e6);
  assert.ok(!E.buyColumn(s));
});

test("retention rewards keep things through prestige, and the server accepts them", () => {
  const { s } = playHonestly(1800);
  s.chalDone = ["keepupg", "keepcols", "keepsrc"];
  const upg = [...s.upg];
  const cols = s.cols;
  const prod = [...s.prod];
  s.ins = 0;
  assert.ok(E.replatform(s, T0 + 1800e3) >= 1);
  assert.deepEqual(s.upg, upg);
  assert.equal(s.cols, cols);
  prod.forEach((c, i) => assert.ok(s.prod[i] >= Math.floor(c * 0.1)));
  assert.equal(s.runRows, 0);
  // Owning all that with zero rows this run is fine: it was carried over, not bought.
  assert.equal(E.implausible(null, E.normalize(JSON.parse(JSON.stringify(s))), 1800), null);
  // Without the reward the same save would be "spent more than earned".
  const forged = E.normalize({ ...JSON.parse(JSON.stringify(s)), chalDone: [] });
  assert.match(E.implausible(null, forged, 1800), /spent more/);
});

test("Knowledge Transfer carries Insights into the next company", () => {
  const s = E.newState(T0);
  E.earn(s, 1e30);
  s.ins = 1000;
  s.chalDone = ["keepins", "legacy", "budget", "hiring"];
  E.acquire(s, T0);
  assert.equal(s.ins, 100);
  assert.equal(E.pendingInsights(s), 0);
  E.earn(s, 1e11); // cbrt(1e11 / 1e5) = 100 more
  assert.equal(E.pendingInsights(s), 100);
});

test("Big Bang tier rewards survive the Big Bang", () => {
  const s = E.newState(T0);
  E.earn(s, 1e40);
  s.finale = true;
  s.xeno = 100;
  s.xeno_tech = { warp: 2 };
  s.xenoSpent = 9;
  s.chalDone = ["keepxeno", "hiring", "translation", "darkforest", "heatdeath"];
  E.bigBang(s, T0);
  assert.deepEqual(s.xeno_tech, { warp: 2 });
  assert.deepEqual(s.chalDone, ["keepxeno"]);
  assert.equal(s.xenoFree, 9);
  // The kept Xenotech is free; only the time check (rows conjured instantly here) may complain.
  const reason = E.implausible(null, E.normalize(JSON.parse(JSON.stringify(s))), 3600);
  assert.ok(reason === null || /faster than possible/.test(reason), reason);
});

test("company names are cleaned and secrets only accept known ids", () => {
  const s = E.normalize({ company: "  Acme\u0007 Data Co. with a very long name indeed  ", secrets: ["konami", "made-up"] }, T0);
  assert.equal(s.company, "Acme Data Co. with a very long n");
  assert.deepEqual(s.secrets, ["konami"]);
  const ids = E.checkAchievements(s).map((a) => a.id);
  assert.ok(ids.includes("named") && ids.includes("secret_konami") && !ids.includes("secret_bobby"));
  assert.ok(E.ACH_BY_ID.secret_bobby.test({ ...s, company: "Robert'); DROP TABLE Students;--" }));
});

test("momentum boosts production and decays exactly as integrated", () => {
  const s = E.newState(T0);
  s.prod[1] = 10; // 10 rows/s
  s.momentum = 1;
  E.tick(s, T0 + 3000); // one half-life
  const cap = E.momentumCap(s);
  const expected = 10 * (3 + (cap * (1 - 0.5)) / (Math.LN2 / 3));
  assert.ok(Math.abs(s.allRows - expected) < 1e-6, `${s.allRows} vs ${expected}`);
  assert.ok(Math.abs(s.momentum - 0.5) < 1e-9);
});

test("selling refunds half, never free units, and keeps the save plausible", () => {
  const s = E.newState(T0);
  s.kept.prod = [10]; // 10 free Spreadsheet Interns from a retention reward
  s.prod[0] = 10;
  for (const k of ["rows", "runRows", "coRows", "civRows", "allRows", "everRows"]) s[k] = 1e6;
  assert.ok(E.buyProducer(s, 0, 20));
  const paidForLast5 = E.producerCost({ ...s, prod: s.prod.map((c, k) => (k ? c : 25)) }, 0, 5);
  assert.equal(E.sellValue(s, 0, 5), paidForLast5 / 2);
  assert.equal(E.sellable(s, 0), 20);
  assert.ok(E.sellProducer(s, 0, 1000)); // clamps to the 20 bought
  assert.equal(s.prod[0], 10);
  assert.equal(E.sellProducer(s, 0, 1), false);
  assert.equal(s.stats.sold, 20);
  assert.equal(E.implausible(null, s, 3600), null);
});

test("a challenge switches off prestige upgrades from its tier upwards, not rewards", () => {
  const s = E.newState(T0);
  E.earn(s, 1e9);
  s.ins = 200;
  s.radar = { defaults: 3 };
  s.arch = ["medallion"];
  s.board = { synergy: 2 };
  s.eq = 10;
  s.eqSpent = 10;
  s.chalDone = ["hiring"];
  s.chalEver = ["hiring"];
  s.replat = 3;
  const outside = E.globalMultiplier(s);
  assert.ok(E.startChallenge(s, "budget", T0));
  // Re-platform tier: Insights, Radar, Board and Equity are all off; the Hiring Freeze reward isn't.
  assert.equal(E.radarLevel(s, "defaults"), 0);
  assert.equal(E.boardLevel(s, "synergy"), 0);
  assert.ok(E.won(s, "hiring"));
  assert.ok(E.globalMultiplier(s) < outside / 5);
  // Spending is still accounted against what's owned, so the server check is unaffected.
  assert.equal(s.radar.defaults, 3);
  // A tier unlocked at Acquisition keeps the re-platform layer's power.
  E.abandonChallenge(s);
  s.acq = 1;
  s.chalEver.push("budget");
  assert.ok(E.startChallenge(s, "budget", T0, 2));
  assert.equal(E.radarLevel(s, "defaults"), 3);
  assert.equal(E.boardLevel(s, "synergy"), 0);
});

test("Institutional Memory keeps re-platform completions through acquisitions", () => {
  const s = E.newState(T0);
  E.earn(s, 1e30);
  s.chalDone = ["legacy", "budget", "hiring"];
  s.board = { memory: 1 };
  s.eq = 3;
  s.eqSpent = 3;
  assert.ok(E.acquire(s, T0) >= 1);
  assert.deepEqual(s.chalDone, ["legacy", "budget", "hiring"]);
  assert.ok(E.gateOpen(s, "acq"));
});

test("environments follow the current company, with a Colocation floor", () => {
  const s = E.newState(T0);
  E.earn(s, 1e30);
  assert.equal(E.environmentFor(s).id, "orbital");
  s.chalDone = ["legacy", "budget", "hiring"];
  assert.ok(E.acquire(s, T0) >= 1);
  assert.equal(E.environmentFor(s).id, "localhost");
  s.board.colo = 2;
  assert.equal(E.environmentFor(s).id, "staging");
});

test("challenges fail past the time limit and record best times for a speed bonus", () => {
  const s = E.newState(T0);
  E.earn(s, 2e9);
  s.ins = 25;
  assert.ok(E.startChallenge(s, "hiring", T0));
  assert.equal(E.checkChallenge(s, T0 + E.CHALLENGE_LIMIT_MS - 1), null);
  assert.ok(E.checkChallenge(s, T0 + E.CHALLENGE_LIMIT_MS + 1).failed);
  assert.equal(s.chal, null);
  assert.ok(!s.chalDone.includes("hiring"));
  // Half the limit: ×1.5 on top of the reward.
  assert.ok(E.startChallenge(s, "hiring", T0));
  E.earn(s, 1e10);
  const r = E.checkChallenge(s, T0 + E.CHALLENGE_LIMIT_MS / 2);
  assert.ok(r.record);
  assert.equal(E.speedBonus(s, "hiring"), 1.5);
  // Replaying is allowed; a slower run doesn't replace the record.
  assert.ok(E.startChallenge(s, "hiring", T0));
  E.earn(s, 1e10);
  assert.equal(E.checkChallenge(s, T0 + E.CHALLENGE_LIMIT_MS * 0.9).record, false);
  assert.equal(E.speedBonus(s, "hiring"), 1.5);
  assert.equal(s.chalWins, 1);
});

test("no-INSERT challenges start with a free starter kit the server accepts", () => {
  const s = E.newState(T0);
  E.earn(s, 1e8); // 10 Insights' worth of company rows
  s.ins = 10;
  s.incidents = 10;
  s.replat = 2;
  assert.ok(E.startChallenge(s, "friday", T0));
  assert.ok(s.prod[0] >= 10 && s.prod[1] >= 5);
  // The kit is free: owning it with zero rows this run isn't "spent more than earned".
  const reason = E.implausible(null, E.normalize(JSON.parse(JSON.stringify(s))), 3600);
  assert.ok(reason === null || /faster than possible/.test(reason), reason);
});

test("Big Bang milestones keep a layer's purchases and completions, and the server accepts it", () => {
  const s = E.newState(T0);
  E.earn(s, 1e30);
  s.bangs = 20;
  s.ins = 50;
  s.insCarry = 0;
  s.radar = { defaults: 1 };
  s.insSpent = 2;
  s.eq = 7;
  s.board = { synergy: 1 };
  s.eqSpent = 1;
  s.chalDone = ["legacy", "budget", "hiring", "takeover"];
  assert.ok(E.acquire(s, T0) >= 1);
  // 10 Big Bangs: Architecture and radar kept (free in the new company), completions kept;
  // Insights themselves reset like always.
  assert.equal(s.ins, 0);
  assert.deepEqual(s.radar, { defaults: 1 });
  assert.deepEqual(s.freeIns.radar, { defaults: 1 });
  assert.ok(s.chalDone.includes("legacy"));
  const reason = E.implausible(null, E.normalize(JSON.parse(JSON.stringify(s))), 3600);
  assert.ok(reason === null || /faster than possible/.test(reason), reason);
});

test("Catalog Everything wipes the playthrough for a stronger New Game+", () => {
  const s = E.newState(T0);
  E.earn(s, 1e40);
  s.bangs = 49;
  assert.ok(!E.canCatalog(s));
  s.bangs = 50;
  s.axioms = 120;
  s.ach = ["rows_3"];
  s.company = "Acme";
  assert.equal(E.markCompletion(s, T0 + 3600e3), 3600e3);
  assert.equal(s.stats.firstCompletionMs, 3600e3);
  assert.equal(E.markCompletion(s, T0 + 7200e3), 0); // once per playthrough
  const before = E.globalMultiplier({ ...E.newState(T0), ach: ["rows_3"] });
  assert.ok(E.catalogEverything(s, T0 + 7200e3));
  assert.equal(s.completions, 1);
  assert.equal(s.bangs, 0);
  assert.equal(s.axioms, 0);
  assert.equal(s.rows, 0);
  assert.deepEqual(s.ach, ["rows_3"]);
  assert.equal(s.company, "Acme");
  assert.equal(s.stats.firstCompletionMs, 3600e3);
  assert.equal(E.globalMultiplier(s) / before, E.NG_PROD);
  assert.ok(E.ACH_BY_ID.catalog_1.test(s));
});
