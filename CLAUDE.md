# CLAUDE.md

Data engineering idle game at rowstoriches.drumandbytes.dev. See README.md for the design.

## Layout

- `public/` — the whole client, served as static assets with no build step. `index.html` + `style.css` + ES modules in `public/js/`.
- `public/js/economy.js` — **all game rules**, as pure functions with no DOM access. The Worker imports this same file to validate uploaded saves, so a balance change here also changes what the server accepts. Keep it free of browser APIs.
- `public/js/main.js` — state, game loop (100ms tick), rendering, inbox, cloud reconcile. Lists rebuild their DOM only when `visibleKey()` changes; everything else updates text in place. Features live in their own modules, each a `createX(ctx)` factory that takes the shared `ctx` object built in main.js (state is `ctx.state()`, never a global `S`; add a helper to `ctx` if a module needs one). `prestige.js` (layers, shops, challenges) loads at startup; `feedback`, `whatsnew`, `completion`, `walkthrough`, `stats`, `settings` and `incidents` load on first use through `lazy(() => import(...), ...)`. Every module goes in `SHELL` in `public/sw.js` (a test checks it).
- `public/js/frames.js` — the one `requestAnimationFrame` loop (frame-rate cap, 30 fps when unfocused, 1 fps when hidden); use `onFrame()` instead of your own rAF.
- `public/js/scene.js` (pipeline canvas: one station per owned source, backdrop per environment `scene`), `widgets.js` (query log, throughput sparkline, sparks/confetti/banners), `flavor.js` (ticker jokes per environment, finale text). All cosmetic.
- `tools/sim.js` — greedy balance simulator. `TWEAK='E.BOARD_BY_ID.rnd.base=9' node tools/sim.js 48` tries a variant without editing the economy.
- `worker/index.js` — `/api/code/new`, `/api/code/login`, `/api/code/rotate` (account codes → session; there is no email sign-in), `/api/save` GET/PUT, `/api/logout`, `/api/account` DELETE. Everything else goes to `env.ASSETS`.
- SEO: `public/{how-to-play,privacy}/index.html` are hand-written static pages sharing `docs.css`; `sitemap.xml`, `robots.txt`, `llms.txt` and the JSON-LD/OG tags in `index.html` list them. Adding a page means updating the sitemap, `llms.txt` and the nav in the other pages. `public/og.png` comes from `tools/og-image.js`.
- `migrations/` — D1 schema. Tokens and account codes are stored only as SHA-256 hashes. D1 always enforces foreign keys: never drop or rebuild `users` while it has rows, it cascade-deletes every session and save (0003 only did it because the table was empty).

## Rules of thumb

- Commit messages and PR titles follow Conventional Commits (`feat:`, `fix:`, `chore:`…): release-please builds versions and the changelog from them, and deploys happen only on its release tags. Merges use merge commits, so the PR title becomes part of history too: give a PR a title that differs from its commit messages, or release-please lists the change twice (the What's new card dedupes identical lines, `CHANGELOG.md` doesn't).

- Big numbers: rows, rates, costs, multipliers and prestige currencies are break_infinity `Decimal`s (`public/js/big.js`, vendored in `public/js/lib/`: not `vendor/`, which the zone WAF blocks as a scanner path), good to 1e9e15. Use their methods (`.add`, `.mul`, `.gte`…), never `+`, `*` or `<`: `Decimal.valueOf()` returns a string, so `d + 1` silently concatenates. Counts and levels stay plain numbers. Saves store Decimals as strings; `normalize()` revives them (and old numeric saves) with `bigSafe`. Visuals that need a plain number get a ratio or a `log10()`.

- New save fields go in `newState()`, and `normalize()` fills them into old saves. Never rename or reuse ids (producers, upgrades, arch, achievements): they're stored in players' saves.
- Balance changes: run `node tools/sim.js 72` and check that no layer snowballs (acquisitions or contacts every few minutes for hours means a feedback exponent near 1). Then run `node --test`. The honest-play tests check that real progress still passes `implausible()`. Loosen `maxBuff()` / `MAX_CLICKS_PER_SEC` there if a new mechanic can legitimately beat them.
- Client clicks are capped at 20/s to match the server budget.
- No third-party requests from the page: fonts, scripts, images and styles are self-hosted (Google Fonts would send every player's IP to Google). The only exception is Cloudflare Web Analytics, which the zone injects. The CSP in `public/_headers` enforces this; don't widen it for a CDN. A new asset the game needs offline goes into `SHELL` in `public/sw.js` (bump `CACHE`). Third-party links get `rel="noopener noreferrer"`.

## Commands

```bash
npm run dev              # wrangler dev, local D1
npm run db:migrate:local
npm test
npm run test:a11y        # axe (WCAG 2.2 AA) + keyboard checks in a real browser (CHROMIUM=1 locally); CI runs it too, and the browser tests also run on WebKit in CI (`ENGINE=webkit`, after `npx playwright-core install webkit`)
npm run test:browser     # smoke tests: play, incidents, re-platform + challenges
```
