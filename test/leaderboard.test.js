import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { signToken, verifyToken, paceFlag, handleTicket, handleCheckpoint, handleBoard, handleRemove, checkNameSpace, NAME_ALERT, NAME_SPACE } from "../worker/leaderboard.js";
import { encodeSave } from "../public/js/seal.js";
import { newState, big } from "../public/js/economy.js";
import { validName, randomName } from "../public/js/names.js";

// D1's prepare/bind/first/run/all on top of node:sqlite, with the real migrations.
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  for (const f of fs.readdirSync("migrations").sort()) db.exec(fs.readFileSync(`migrations/${f}`, "utf8"));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => db.prepare(sql).run(...args),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: (sql) => stmt(sql) };
}

const env = () => ({ LEADERBOARD_KEY: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"), DB: fakeD1() });

test("tokens verify, and a tampered or foreign one doesn't", async () => {
  const e = env();
  const t = await signToken(e, { k: "t", t: 1, n: "abc" });
  assert.deepEqual(await verifyToken(e, t), { k: "t", t: 1, n: "abc" });
  const [body, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ k: "t", t: 0, n: "abc" })).toString("base64url");
  assert.equal(await verifyToken(e, `${forged}.${sig}`), null);
  assert.equal(await verifyToken(env(), t), null);
  assert.equal(await verifyToken(e, `${body}`), null);
});

test("names: generated ones validate, typed ones don't", () => {
  for (let i = 0; i < 50; i++) assert.ok(validName(randomName()));
  assert.ok(validName("Eventually Consistent Sleepy Otter"));
  assert.ok(!validName("Admin"));
  assert.ok(!validName("Idempotent Walrus"));
  assert.ok(!validName("Idempotent Grumpy <b>Walrus</b>"));
});

test("pace: a run far ahead of the simulator is flagged, a normal one isn't", () => {
  const s = { ...newState(0), everRows: big("1e20"), acq: 3, contact: 0, bangs: 0 };
  assert.equal(paceFlag(s, 100), null);
  assert.match(paceFlag(s, 1), /after 1\.0 h/);
});

async function savedGame(e, { fresh = true, edit } = {}) {
  const { ticket } = await handleTicket(null, { fresh }, e);
  const s = newState(Date.now());
  s.lb = { ticket, optIn: true, name: "Idempotent Grumpy Walrus", locked: false };
  edit?.(s);
  return { ticket, save: encodeSave(s) };
}

test("checkpoint: an honest new save is listed, by name, on the rows board", async () => {
  const e = env();
  const pings = [];
  const { ticket, save } = await savedGame(e);
  const r = await handleCheckpoint({ ticket, save, name: "Idempotent Grumpy Walrus" }, e, (m) => pings.push(m));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(pings.length, 0);
  const me = JSON.parse(Buffer.from(ticket.split(".")[0], "base64url")).n;
  const board = await handleBoard(new URL(`https://x/api/lb/board?b=rows&me=${me}`), e);
  assert.equal(board.status, 200);
  // A fresh save has no rows yet, so it isn't on the rows board.
  assert.deepEqual(board.data.top, []);
});

test("checkpoint: modified, foreign-ticket and rule-breaking saves are refused", async () => {
  const e = env();
  const { ticket } = await handleTicket(null, { fresh: true }, e);
  const a = await savedGame(e, { edit: (s) => (s.modified = true) });
  assert.equal((await handleCheckpoint({ ticket: a.ticket, save: a.save, name: "Idempotent Grumpy Walrus" }, e, () => {})).status, 422);
  const b = await savedGame(e);
  assert.equal((await handleCheckpoint({ ticket, save: b.save, name: "Idempotent Grumpy Walrus" }, e, () => {})).status, 400);
  const c = await savedGame(e, { edit: (s) => (s.rows = big("1e9")) });
  const r = await handleCheckpoint({ ticket: c.ticket, save: c.save, name: "Idempotent Grumpy Walrus" }, e, () => {});
  assert.equal(r.status, 422);
  assert.match(r.data.error, /rules/);
});

test("checkpoint: a run ahead of real time is listed but flagged and pinged once", async () => {
  const e = env();
  const pings = [];
  const { ticket, save } = await savedGame(e, {
    edit: (s) => {
      // A consistent save with rows nobody earns in the seconds since the ticket.
      s.everRows = s.allRows = s.civRows = s.coRows = s.runRows = big("1e12");
    },
  });
  const r1 = await handleCheckpoint({ ticket, save, name: "Idempotent Grumpy Walrus" }, e, (m) => pings.push(m));
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  await handleCheckpoint({ ticket, save, name: "Idempotent Grumpy Walrus" }, e, (m) => pings.push(m));
  assert.equal(pings.length, 1);
  const board = await handleBoard(new URL("https://x/api/lb/board?b=rows"), e);
  assert.equal(board.data.top[0].name, "Idempotent Grumpy Walrus");
  assert.equal(board.data.top[0].rank, 1);
});

test("remove deletes the entry", async () => {
  const e = env();
  const { ticket, save } = await savedGame(e, { edit: (s) => (s.everRows = s.allRows = s.civRows = s.coRows = s.runRows = big(5000)) });
  await handleCheckpoint({ ticket, save, name: "Idempotent Grumpy Walrus" }, e, () => {});
  assert.equal((await handleBoard(new URL("https://x/api/lb/board?b=rows"), e)).data.top.length, 1);
  await handleRemove({ ticket }, e);
  assert.equal((await handleBoard(new URL("https://x/api/lb/board?b=rows"), e)).data.top.length, 0);
});

test("names are unique: a taken one gets 409, the owner keeps theirs", async () => {
  const e = env();
  const a = await savedGame(e);
  assert.equal((await handleCheckpoint({ ticket: a.ticket, save: a.save, name: "Idempotent Grumpy Walrus" }, e, () => {})).status, 200);
  const b = await savedGame(e);
  assert.equal((await handleCheckpoint({ ticket: b.ticket, save: b.save, name: "Idempotent Grumpy Walrus" }, e, () => {})).status, 409);
  assert.equal((await handleCheckpoint({ ticket: b.ticket, save: b.save, name: "Idempotent Sleepy Walrus" }, e, () => {})).status, 200);
  assert.equal((await handleCheckpoint({ ticket: a.ticket, save: a.save, name: "Idempotent Grumpy Walrus" }, e, () => {})).status, 200);
});

test("name space: the daily check pings past NAME_ALERT entries, only in the 09:00 UTC run", async () => {
  assert.ok(NAME_SPACE > NAME_ALERT);
  const pings = [];
  const count = (n) => ({ LEADERBOARD_KEY: "x", DB: { prepare: () => ({ first: async () => ({ n }) }) } });
  await checkNameSpace(count(NAME_ALERT - 1), Date.UTC(2026, 0, 1, 9, 0), (m) => pings.push(m));
  await checkNameSpace(count(NAME_ALERT), Date.UTC(2026, 0, 1, 10, 0), (m) => pings.push(m));
  assert.equal(pings.length, 0);
  await checkNameSpace(count(NAME_ALERT), Date.UTC(2026, 0, 1, 9, 0), (m) => pings.push(m));
  assert.equal(pings.length, 1);
  assert.match(pings[0], /1,000,000 of 1,232,000/);
});
