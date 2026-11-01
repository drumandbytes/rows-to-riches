import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeSave, decodeSave } from "../public/js/seal.js";
import { newState, normalize } from "../public/js/economy.js";

test("a sealed save round-trips and isn't readable as JSON", () => {
  const s = newState(0);
  s.company = "Ünïcode Analytics";
  const text = encodeSave(s);
  assert.match(text, /^r2r1\.[\w-]+\.[0-9a-z]+$/);
  assert.ok(!text.includes("company"));
  const { raw, sealed } = decodeSave(text);
  assert.ok(sealed);
  assert.equal(normalize(raw).company, "Ünïcode Analytics");
});

test("an edited body breaks the seal", () => {
  const text = encodeSave(newState(0));
  const [, body, sig] = text.split(".");
  const edited = JSON.parse(Buffer.from(body, "base64url").toString());
  edited.rows = "1e100";
  const forged = `r2r1.${Buffer.from(JSON.stringify(edited)).toString("base64url")}.${sig}`;
  assert.equal(decodeSave(forged).sealed, false);
});

test("older formats load but count as unsealed", () => {
  const json = JSON.stringify(newState(0));
  assert.equal(decodeSave(json).sealed, false);
  assert.equal(decodeSave(Buffer.from(json).toString("base64")).sealed, false);
  assert.throws(() => decodeSave("not a save"));
});

test("modified survives normalize, and only a literal true counts", () => {
  assert.equal(normalize({ ...newState(0), modified: true }).modified, true);
  assert.equal(normalize({ ...newState(0), modified: "yes" }).modified, false);
});
