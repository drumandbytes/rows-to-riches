// Plays the first minute in a real browser: catches UI breakage the economy tests can't.
//   npm run test:browser   (CI uses the runner's Chrome; locally set CHROMIUM=1 after
//   `npx playwright-core install chromium`)
import { test } from "node:test";
import assert from "node:assert/strict";
import { withBrowser } from "./helpers.js";

test("the game loads, plays, saves and reloads without errors", { skip: !process.env.BROWSER_SMOKE }, () => withBrowser(8790, async (browser) => {
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
}));

test("incident pop-ups load on demand and can be clicked", { skip: !process.env.BROWSER_SMOKE }, () => withBrowser(8793, async (browser) => {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("r2r.prefs", JSON.stringify({ tourDone: true })));
  await page.clock.install();
  await page.goto("http://localhost:8793/");
  await page.clock.fastForward(5 * 60_000);
  await page.clock.runFor(1000);
  await page.locator(".incident").first().waitFor({ timeout: 5000 });
  await page.locator(".incident").first().dispatchEvent("click"); // the faked clock freezes the animations Playwright waits on
  assert.equal(await page.locator(".incident").count(), 0);
  assert.deepEqual(errors, []);
}));
