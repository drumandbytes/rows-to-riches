// axe-core over every tab, settings section and the inbox, in standard and high contrast.
//   npm run test:a11y   (locally set CHROMIUM=1 after `npx playwright-core install chromium`)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { withBrowser } from "./helpers.js";

const axe = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
// WCAG 2.2 AA plus axe's best-practice rules (landmarks, heading order, ...).
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const SECTIONS = ["game", "audio", "display", "save", "help", "about"];

// The .float/.spark/.confetti effects are decorative, aria-hidden and gone within a second, so axe skips them.
// One entry per rule + element, however many screens it shows up on.
const seen = new Map();
async function scan(page, name) {
  await page.waitForTimeout(400); // let entrance animations settle: axe reads mid-fade colours
  await page.evaluate(axe);
  const { violations } = await page.evaluate((tags) => axe.run({ exclude: [[".float"], [".spark"], [".confetti"]], runOnly: { type: "tag", values: tags } }), TAGS);
  for (const v of violations) {
    for (const n of v.nodes) {
      const key = `${v.id} ${n.target.join(" ")}`;
      const entry = seen.get(key) ?? { text: `${v.id} (${v.impact}) ${n.target.join(" ")}\n    ${n.failureSummary.split("\n").slice(1, 3).join(" | ")}\n    ${n.html.slice(0, 140)}`, on: [] };
      entry.on.push(name);
      seen.set(key, entry);
    }
  }
}

test("the game has no axe violations", { skip: !process.env.BROWSER_SMOKE }, () => withBrowser(8791, async (browser) => {
  for (const contrast of ["standard", "high"]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    await page.addInitScript((c) => localStorage.setItem("r2r.prefs", JSON.stringify({ tourDone: true, contrast: c })), contrast);
    await page.goto("http://localhost:8791/");
    for (let k = 0; k < 20; k++) await page.click("#insert");
    await page.click('#sources li[data-i="0"] .buy');
    for (const tab of ["sources", "upgrades", "schema", "prestige", "stats", "settings"]) {
      await page.click(`.tabs button[data-tab="${tab}"]`);
      if (tab !== "settings") await scan(page, `${contrast} ${tab}`);
    }
    for (const section of SECTIONS) {
      await page.click(`#settings-seg button[data-section="${section}"]`);
      await scan(page, `${contrast} settings/${section}`);
    }
    await page.click("#inbox-btn");
    await scan(page, `${contrast} inbox`);
    await page.close();
  }
  assert.deepEqual([...seen.values()].map((e) => `${e.text}\n    on: ${e.on.slice(0, 3).join(", ")}${e.on.length > 3 ? ` +${e.on.length - 3}` : ""}`), []);
}));

test("the tabs work from the keyboard", { skip: !process.env.BROWSER_SMOKE }, () => withBrowser(8792, async (browser) => {
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem("r2r.prefs", JSON.stringify({ tourDone: true })));
  await page.goto("http://localhost:8792/");
  await page.focus('.tabs button[data-tab="sources"]');
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getAttribute('.tabs button[data-tab="upgrades"]', "aria-selected"), "true");
  assert.equal(await page.getAttribute('.tabs button[data-tab="upgrades"]', "tabindex"), "0");
  assert.equal(await page.getAttribute('.tabs button[data-tab="sources"]', "tabindex"), "-1");
  assert.equal(await page.getAttribute("#pane-upgrades", "aria-labelledby"), "tab-upgrades");
  await page.keyboard.press("End");
  assert.equal(await page.getAttribute('.tabs button[data-tab="settings"]', "aria-selected"), "true");
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getAttribute('.tabs button[data-tab="sources"]', "aria-selected"), "true", "the arrows wrap around");
}));
