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

test("re-platforming works and its Insights buy something in the shop", { skip: !process.env.BROWSER_SMOKE }, () => withBrowser(8794, async (browser) => {
  // A save that has earned enough for a re-platform, written by the game's own code.
  const first = await browser.newPage();
  await first.goto("http://localhost:8794/");
  const save = await first.evaluate(async () => {
    const E = await import("/js/economy.js");
    const { encodeSave } = await import("/js/seal.js");
    const s = E.newState();
    E.earn(s, 1e12);
    return encodeSave(s);
  });
  await first.close();

  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((text) => {
    localStorage.setItem("r2r.save", text);
    localStorage.setItem("r2r.sealed", "1");
    localStorage.setItem("r2r.prefs", JSON.stringify({ tourDone: true }));
  }, save);
  await page.goto("http://localhost:8794/");
  await page.click('.tabs button[data-tab="prestige"]');
  await page.click('button[data-prestige="replat"]:not([disabled])');
  await page.click("#modal button.primary");
  await page.waitForFunction(() => /Insights: [1-9]/.test(document.querySelector("#prestige-card")?.textContent ?? ""));
  await page.click('#prestige-shops button.buy[data-shop="arch"]:not([disabled])');
  await page.waitForSelector("#prestige-shops li.owned");
  assert.deepEqual(errors, []);
}));
