import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// The service worker precaches the app shell for offline play. Every JS module the game
// ships must be in that list, or an offline first launch fails on a missing import.
test("the service worker precaches every JS module", () => {
  const sw = fs.readFileSync("public/sw.js", "utf8");
  const listed = new Set([...sw.match(/\[([^\]]*)\]\.map\(\(m\) => `\/js\/\$\{m\}\.js`\)/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  const modules = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".js")) modules.push(path.relative("public/js", p).replace(/\.js$/, ""));
    }
  };
  walk("public/js");
  assert.deepEqual(modules.filter((m) => !listed.has(m)), []);
  assert.deepEqual([...listed].filter((m) => !modules.includes(m)), []);
});
