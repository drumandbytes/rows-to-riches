// Store-listing screenshots (docs/listing/): plays the sim to a few points in the game,
// loads each state into Chrome and captures a tab at 1920×1080.
//   node tools/screenshots.js   (CHROMIUM=1 for playwright's own Chromium)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { serve } from "./serve.js";

// Hours picked deep into a run (sim states right after a reset look like the start).
const SHOTS = [
  { name: "1-staging", hours: 3, tab: "sources" },
  { name: "2-upgrades", hours: 45, tab: "upgrades", then: "#upg-deployed-n" },
  { name: "3-challenges", hours: 100, tab: "prestige", then: 'button[data-layer="chal"]' },
  { name: "4-multiverse", hours: 110, tab: "sources", thumb: true },
  { name: "5-schema", hours: 110, tab: "schema" },
  { name: "6-stats", hours: 150, tab: "stats" },
];
const OUT = "docs/listing";
const VERSION = fs.readFileSync("public/js/main.js", "utf8").match(/VERSION = "([^"]+)"/)[1];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "r2r-shots-"));

const server = await serve(8793);
const browser = await chromium.launch(process.env.CHROMIUM ? {} : { channel: "chrome" });
try {
  for (const shot of SHOTS) {
    const file = path.join(tmp, `${shot.hours}.json`);
    if (!fs.existsSync(file)) execFileSync("node", ["tools/sim.js", String(shot.hours)], { env: { ...process.env, DUMP: file }, stdio: "ignore" });
    const save = JSON.parse(fs.readFileSync(file, "utf8"));
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
    // Sim time starts at 0: move it to now so nothing counts as offline, and skip the
    // walkthrough, the What's new card, toasts and the sound.
    await page.addInitScript(({ st, version }) => {
      if (sessionStorage.getItem("loaded")) return;
      sessionStorage.setItem("loaded", "1");
      const shift = Date.now() - st.lastTick;
      st.stats.onlineMs = st.lastTick;
      for (const k of ["startedAt", "playthroughStartedAt", "runStartedAt", "lastTick"]) st[k] += shift;
      st.stats.companyStartedAt += shift;
      st.company = "Synergy Analytics";
      localStorage.setItem("r2r.save", JSON.stringify(st));
      localStorage.setItem("r2r.prefs", JSON.stringify({ tourDone: true, seenVersion: version, muted: true, stats: false, toasts: "off" }));
    }, { st: save, version: VERSION });
    await page.goto("http://localhost:8793/");
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    await page.click(`.tabs button[data-tab="${shot.tab}"]`);
    if (shot.then) await page.click(shot.then);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, `${shot.name}.png`) });
    // Thumbnail: the scene alone, with the window bar above it.
    if (shot.thumb) {
      const bar = await page.locator(".win-title").boundingBox();
      const stage = await page.locator(".stage").boundingBox();
      await page.screenshot({ path: path.join(OUT, "thumbnail.png"), clip: { x: stage.x, y: bar.y - 14, width: stage.width, height: stage.y + stage.height - bar.y + 14 } });
    }
    await page.close();
    console.log(`${OUT}/${shot.name}.png`);
  }
} finally {
  await browser.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
