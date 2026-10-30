import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("main.js VERSION matches package.json", () => {
  const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.match(fs.readFileSync("public/js/main.js", "utf8"), new RegExp(`^const VERSION = "${version}";$`, "m"));
});
