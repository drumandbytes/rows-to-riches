// Social share card (public/og.png, 1200×630): brand, tagline and the multiverse screenshot.
//   CHROMIUM=1 node tools/og-image.js   (needs docs/listing/4-multiverse.png)
import fs from "node:fs";
import { chromium } from "playwright-core";
import { serve } from "./serve.js";

const shot = fs.readFileSync("docs/listing/4-multiverse.png").toString("base64");
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: "Space Grotesk"; src: url(/fonts/space-grotesk-latin-wght-normal.woff2); font-weight: 300 700; }
@font-face { font-family: "JetBrains Mono"; src: url(/fonts/jetbrains-mono-latin-wght-normal.woff2); font-weight: 100 800; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #16181c; color: #e3e5e8; font-family: "Space Grotesk", sans-serif; position: relative; overflow: hidden; }
.glow { position: absolute; inset: 0; background: radial-gradient(700px 400px at 15% 10%, rgba(82,194,122,.22), transparent 70%); }
.text { position: absolute; left: 64px; top: 70px; width: 520px; }
.mark { width: 72px; height: 72px; margin-bottom: 28px; }
h1 { font-size: 78px; line-height: 1; font-weight: 700; letter-spacing: -2px; }
h1 span { color: #52c27a; font-weight: 400; font-size: 52px; margin: 0 6px; }
p { margin-top: 26px; font-size: 30px; line-height: 1.3; color: #b9bec6; }
.url { position: absolute; left: 64px; bottom: 56px; font: 500 24px "JetBrains Mono", monospace; color: #e3b341; }
.shot { position: absolute; left: 620px; top: 80px; width: 1000px; border-radius: 16px; border: 2px solid #353a42; box-shadow: 0 30px 80px rgba(0,0,0,.6); }
</style><div class="glow"></div>
<div class="text">
<svg class="mark" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#202328"/><g fill="#52c27a"><rect x="9" y="11" width="34" height="8" rx="2"/><rect x="9" y="23" width="15" height="6" rx="1.5" opacity=".85"/><rect x="28" y="23" width="15" height="6" rx="1.5" opacity=".85"/><rect x="9" y="33" width="15" height="6" rx="1.5" opacity=".65"/><rect x="9" y="43" width="15" height="6" rx="1.5" opacity=".45"/></g><circle cx="42" cy="42" r="15" fill="#202328"/><circle cx="42" cy="42" r="12" fill="#e3b341"/><circle cx="42" cy="42" r="8.5" fill="#b8862a"/><circle cx="42" cy="42" r="6.5" fill="#e3b341"/></svg>
<h1>Rows<span>to</span>Riches</h1>
<p>An idle game about data engineering and the company around it.</p>
</div>
<div class="url">rowstoriches.drumandbytes.dev</div>
<img class="shot" src="data:image/png;base64,${shot}">`;

const server = await serve(8794);
const browser = await chromium.launch(process.env.CHROMIUM ? {} : { channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  // Same origin as the fonts, so the @font-face URLs resolve.
  await page.route("http://localhost:8794/card", (r) => r.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://localhost:8794/card");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "public/og.png" });
} finally {
  await browser.close();
  server.close();
}
