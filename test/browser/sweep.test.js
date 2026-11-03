// Drives every tab, setting, dialog and prestige flow on saves from different stages and fails on any page
// error. Refactors have left stray names behind that no unit test touches (a missing helper in the Challenges
// list, a renamed function in Settings), and only clicking everything finds them.
//   npm run test:sweep   (locally set CHROMIUM=1 after `npx playwright-core install chromium`)
import { test } from "node:test";
import assert from "node:assert/strict";
import { withBrowser } from "./helpers.js";

const SEEDS = {
  fresh: () => {},
  replatted: (E, s) => { E.earn(s, 1e12); E.replatform(s); E.earn(s, 1e12); },
  mid: (E, s) => {
    Object.assign(s, { replat: 12, acq: 2, chalWins: 6, cols: 25, company: "Acme & Co", arch: ["terraform"], board: { gitops: 1 } });
    s.ins = E.big(5000);
    s.eq = E.big(500);
    s.prod = s.prod.map((_, i) => (i < 12 ? 40 : 0));
    s.stats.meetings = 12;
    s.stats.requests = 11;
    E.earn(s, 1e30);
  },
  late: (E, s) => {
    Object.assign(s, { replat: 30, acq: 10, contact: 3, bangs: 12, axioms: 40, completions: 1, finale: true, chalWins: 20, arch: ["terraform"], board: { gitops: 1 }, xeno_tech: { contact: 1 } });
    s.ins = E.big(1e9);
    s.eq = E.big(1e7);
    s.xeno = E.big(1e6);
    s.prod = s.prod.map((_, i) => 12345 + i);
    E.earn(s, 1e90);
  },
};

test("every control on every screen works without a page error, at each stage of the game", { skip: !process.env.BROWSER_SMOKE, timeout: 240_000 }, () => withBrowser(8799, async (browser) => {
  const boot = await browser.newPage();
  await boot.goto("http://localhost:8799/");
  const saves = await boot.evaluate(async (seeds) => {
    const E = await import("/js/economy.js");
    const { encodeSave } = await import("/js/seal.js");
    const out = {};
    for (const [name, fn] of Object.entries(seeds)) {
      const s = E.newState();
      // eslint-disable-next-line no-new-func
      new Function("E", "s", `(${fn})(E, s)`)(E, s);
      out[name] = encodeSave(s);
    }
    return out;
  }, Object.fromEntries(Object.entries(SEEDS).map(([k, f]) => [k, f.toString()])));
  await boot.close();

  const problems = [];
  for (const [name, save] of Object.entries(saves)) {
    const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
    page.setDefaultTimeout(2000);
    page.on("pageerror", (e) => problems.push(`${name}: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource|404/.test(m.text())) problems.push(`${name} console: ${m.text()}`);
    });
    await page.addInitScript(([text, tour]) => {
      localStorage.setItem("r2r.save", text);
      localStorage.setItem("r2r.sealed", "1");
      localStorage.setItem("r2r.prefs", JSON.stringify({ tourDone: tour }));
    }, [save, name !== "fresh"]);
    await page.goto("http://localhost:8799/");
    await page.waitForTimeout(500);

    // Clicks run in the page, so a hidden or missing control is skipped instead of waited for.
    const click = (sel) => page.evaluate((q) => { const el = document.querySelector(q); if (!el || el.disabled) return false; el.click(); return true; }, sel);
    const clickAll = (sel) => page.evaluate((q) => { for (const el of document.querySelectorAll(q)) if (!el.disabled) el.click(); }, sel);
    const closeModal = () => page.evaluate(() => document.querySelector("#modal")?.close?.());
    const settle = (ms = 120) => page.waitForTimeout(ms);
    await closeModal();

    for (const tab of ["sources", "upgrades", "schema", "prestige", "stats", "settings"]) {
      await click(`.tabs button[data-tab="${tab}"]`);
      await settle(200);
      if (tab === "schema") for (const v of ["ddl", "erd"]) await click(`#schema-seg button[data-view="${v}"]`);
      if (tab === "sources") {
        await page.evaluate(() => { for (let i = 0; i < 15; i++) document.querySelector("#insert")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); });
        for (const amount of ["max", "10"]) { await click(`.buy-amount button[data-buy="${amount}"]`); await clickAll("#sources .buy"); await settle(); }
        await click("#sell-mode");
        await clickAll("#sources .buy");
        await click("#sell-mode");
      }
      if (tab === "upgrades") await clickAll("#upgrades .buy");
      if (tab === "prestige") {
        const layers = await page.$$eval("#prestige-seg button[data-layer]", (b) => b.map((x) => x.dataset.layer));
        for (const layer of layers) {
          await click(`#prestige-seg button[data-layer="${layer}"]`);
          await settle();
          await clickAll("#prestige-shops button.buy");
          await settle();
          if (layer === "chal") {
            for (const id of await page.$$eval("#prestige-shops [data-challenge]", (b) => [...new Set(b.map((x) => `${x.dataset.challenge}|${x.dataset.tier ?? 1}`))].slice(0, 3))) {
              const [c, t] = id.split("|");
              await click(`[data-challenge="${c}"][data-tier="${t}"], [data-challenge="${c}"]:not([data-tier])`);
              await settle();
              await click("#modal button.primary");
              await settle();
              await click("[data-abandon]");
              await closeModal();
            }
          } else if (await click(`#prestige-card button[data-prestige="${layer}"]`)) {
            await settle();
            await click("#modal button.primary");
            await settle(250);
          }
        }
        await click("#catalog-btn");
        await closeModal();
      }
      if (tab === "stats") { await click("#share-card"); await settle(400); await clickAll("#ach button"); }
      if (tab === "settings") {
        for (const sec of ["game", "audio", "display", "save", "help", "about"]) {
          await click(`#settings-seg button[data-section="${sec}"]`);
          await settle();
          if (sec === "help") {
            await clickAll(".help details summary");
            await click("[data-feedback]");
            await settle();
            await closeModal();
            await click("#replay-tour");
            await settle();
            await click(".tour-skip");
          }
          if (sec === "save") {
            for (const id of ["export", "import", "create-code"]) { await click(`#${id}`); await settle(200); await closeModal(); }
            await click("#save-now");
          }
          if (sec === "about") { await click("#whats-new"); await settle(300); await closeModal(); }
          // Flip every checkbox twice and step every select through its options.
          await page.evaluate((s) => {
            for (const el of document.querySelectorAll(`#pane-settings .section[data-section="${s}"] input[type=checkbox]`)) { el.click(); el.click(); }
            for (const sel of document.querySelectorAll(`#pane-settings .section[data-section="${s}"] select`)) {
              for (const o of sel.options) { sel.value = o.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
            }
          }, sec);
        }
      }
    }
    await click("#inbox-btn");
    await settle(200);
    await clickAll("[data-mail]");
    await closeModal();
    for (const k of ["m", "b", "1", "2", "3"]) await page.keyboard.press(k);
    await settle(300);
    await page.close();
  }
  assert.deepEqual([...new Set(problems)], []);
}));
