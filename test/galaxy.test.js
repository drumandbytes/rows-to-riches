import { test } from "node:test";
import assert from "node:assert/strict";
import { createGalaxySaves } from "../public/js/galaxy.js";
import { encodeSave, decodeSave } from "../public/js/seal.js";
import { newState } from "../public/js/economy.js";

// A fake galaxy.click parent: records what the game posts, and can answer.
function setup({ ahead = false } = {}) {
  const posted = [];
  const target = { postMessage: (msg, origin) => posted.push({ msg, origin }) };
  let listener;
  const source = { addEventListener: (_type, fn) => (listener = fn) };
  const asked = [];
  const g = createGalaxySaves({
    state: () => newState(0), encodeSave, decodeSave, toast: () => {},
    summary: () => "0 rows · localhost",
    onCloudAhead: (d) => (asked.push(d), ahead),
    target, source,
  });
  const reply = (data, origin = "https://galaxy.click", from = target) => listener({ origin, source: from, data });
  const saves = () => posted.filter((p) => p.msg.action === "save");
  return { g, posted, reply, saves, asked };
}

test("announces saving support and asks for the autosave, to galaxy's origin only", () => {
  const { g, posted } = setup();
  g.start();
  assert.deepEqual(posted.map((p) => p.msg.action), ["supports", "load"]);
  assert.ok(posted.every((p) => p.origin === "https://galaxy.click"));
  assert.deepEqual(posted[0].msg, { action: "supports", saving: true, eval: false });
});

test("never autosaves before galaxy's copy was compared", () => {
  const { g, saves, reply } = setup();
  g.start();
  g.save(true);
  assert.equal(saves().length, 0);
  reply({ type: "save_content", error: true, message: "empty_slot", slot: 0, label: null, content: null });
  g.save();
  assert.equal(saves().length, 1);
  assert.equal(decodeSave(saves()[0].msg.data).sealed, true);
  assert.equal(saves()[0].msg.slot, 0);
  g.save(); // throttled
  assert.equal(saves().length, 1);
});

test("a galaxy save that's ahead pauses autosave until the player answers", () => {
  const { g, saves, reply, asked } = setup({ ahead: true });
  g.start();
  reply({ type: "save_content", error: false, slot: 0, label: "Autosave", content: encodeSave(newState(0)) });
  assert.equal(asked.length, 1);
  assert.equal(asked[0].sealed, true);
  g.save(true);
  assert.equal(saves().length, 0);
  g.resume();
  assert.equal(saves().length, 1);
});

test("ignores other origins and other windows; goes quiet without a galaxy account", () => {
  const { g, saves, reply, asked } = setup();
  g.start();
  reply({ type: "save_content", error: false, slot: 0, content: encodeSave(newState(0)) }, "https://evil.example");
  reply({ type: "save_content", error: false, slot: 0, content: encodeSave(newState(0)) }, "https://galaxy.click", {});
  assert.equal(asked.length, 0);
  reply({ type: "save_content", error: true, message: "no_account", slot: 0, content: null });
  g.save(true);
  assert.equal(saves().length, 0);
});
