// Plays the first minute in a real browser: catches UI breakage the economy tests can't.
//   npm run test:browser   (CI uses the runner's Chrome; locally set CHROMIUM=1 after
//   `npx playwright-core install chromium`)
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { serve } from "../../tools/serve.js";

test("the game loads, plays, saves and reloads without errors", { skip: !process.env.BROWSER_SMOKE }, async () => {
  const server = await serve(8790);
  const browser = await chromium.launch(process.env.CHROMIUM ? {} : { channel: "chrome" });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://localhost:8790/");
    await page.click(".tour-skip");
    for (let k = 0; k < 20; k++) await page.click("#insert");
    await page.click('#sources li[data-i="0"] .buy');
    for (const tab of ["upgrades", "schema", "prestige", "stats", "settings", "sources"]) await page.click(`.tabs button[data-tab="${tab}"]`);
    const owned = await page.textContent('#sources li[data-i="0"] .count');
    assert.equal(owned.trim(), "×1");
    await page.waitForTimeout(1500);
    await page.reload();
    assert.equal((await page.textContent('#sources li[data-i="0"] .count')).trim(), "×1", "the save survives a reload");
    assert.match(await page.textContent("#rows"), /^\d/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
