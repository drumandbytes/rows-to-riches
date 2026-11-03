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

test("re-platforming works, the shop sells, and a challenge can be started", { skip: !process.env.BROWSER_SMOKE }, () => withBrowser(8794, async (browser) => {
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
  // The Challenges list renders, and a challenge can be started.
  await page.click('#prestige-seg button[data-layer="chal"]');
  await page.click("#prestige-shops [data-challenge]:not([disabled])");
  await page.click("#modal button.primary");
  await page.waitForSelector("#chal-banner:not([hidden])");
  assert.deepEqual(errors, []);
}));

test("the Settings tab's auto-buyer and company options work", { skip: !process.env.BROWSER_SMOKE }, () => withBrowser(8797, async (browser) => {
  const first = await browser.newPage();
  await first.goto("http://localhost:8797/");
  const save = await first.evaluate(async () => {
    const E = await import("/js/economy.js");
    const { encodeSave } = await import("/js/seal.js");
    const s = E.newState();
    s.arch = ["terraform"]; // owns the auto-buyer
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
  await page.goto("http://localhost:8797/");
  await page.click('.tabs button[data-tab="settings"]');
  await page.fill("#opt-company", "Acme");
  await page.press("#opt-company", "Enter");
  await page.locator("#opt-auto-sources").check();
  await page.selectOption("#opt-auto-strategy", { index: 1 });
  assert.equal(await page.locator("#opt-auto-sources").isChecked(), true);
  assert.deepEqual(errors, []);
}));

test("buttons that update every tick stay the same element, so a tap can't be lost mid-press", { skip: !process.env.BROWSER_SMOKE }, () => withBrowser(8798, async (browser) => {
  // iOS drops a tap when the touched element is replaced between touch-down and touch-up.
  const first = await browser.newPage();
  await first.goto("http://localhost:8798/");
  const save = await first.evaluate(async () => {
    const E = await import("/js/economy.js");
    const { encodeSave } = await import("/js/seal.js");
    const s = E.newState();
    E.earn(s, 2e8); // just enough company rows for a first re-platform, so the next ticks move the pending Insights
    for (let i = 0; i < 10; i++) s.prod[i] = 300; // production big enough that the pending Insights move every tick
    s.settings.buy = "max"; // the label ("Buy 12") changes as rows grow
    return encodeSave(s);
  });
  await first.close();
  const page = await browser.newPage();
  await page.addInitScript((text) => {
    localStorage.setItem("r2r.save", text);
    localStorage.setItem("r2r.sealed", "1");
    localStorage.setItem("r2r.prefs", JSON.stringify({ tourDone: true }));
  }, save);
  await page.goto("http://localhost:8798/");
  const tag = (sel) => page.evaluate((q) => { const el = document.querySelector(q); el.__kept = true; return el.textContent; }, sel);
  const kept = (sel) => page.evaluate((q) => document.querySelector(q)?.__kept === true, sel);
  const buy = '#sources li[data-i="0"] .buy';
  await tag(buy);
  await page.click('.tabs button[data-tab="prestige"]');
  const card = 'button[data-prestige="replat"]';
  const cardBefore = await page.evaluate(() => document.querySelector("#prestige-card").textContent);
  await page.evaluate((q) => (document.querySelector(q).__kept = true), card);
  await page.waitForTimeout(1500); // several game ticks while rows grow
  assert.ok(await kept(card), "the Re-platform button is the same element after re-rendering");
  assert.notEqual(await page.evaluate(() => document.querySelector("#prestige-card").textContent), cardBefore, "the card did re-render");
  await page.click('.tabs button[data-tab="sources"]');
  assert.ok(await kept(buy), "the Buy button is the same element after re-rendering");
}));
