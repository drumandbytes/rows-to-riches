import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("main.js VERSION matches package.json", () => {
  const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
  // release-please bumps both (main.js through the x-release-please-version marker).
  assert.match(fs.readFileSync("public/js/main.js", "utf8"), new RegExp(`^const VERSION = "${version}"; // x-release-please-version$`, "m"));
});

test("sw.js carries the same version, so each release changes the service worker and the shell updates", () => {
  const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.match(fs.readFileSync("public/sw.js", "utf8"), new RegExp(`^const VERSION = "${version}"; // x-release-please-version$`, "m"));
});
