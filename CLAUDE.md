# CLAUDE.md

Data engineering idle game at rowstoriches.drumandbytes.dev. See README.md for the design.

## Layout

- `public/` — the whole client, served as static assets with no build step. `index.html` + `style.css` + ES modules in `public/js/`.
- `public/js/economy.js` — **all game rules**, as pure functions with no DOM access. The Worker imports this same file to validate uploaded saves, so a balance change here also changes what the server accepts. Keep it free of browser APIs.
- `public/js/main.js` — state, game loop (200ms tick), rendering, incidents, cloud reconcile. Lists rebuild their DOM only when `visibleKey()` changes; everything else updates text in place.
- `public/js/scene.js` (pipeline canvas: one station per owned source, backdrop per environment `scene`), `widgets.js` (query log, throughput sparkline, sparks/confetti/banners), `flavor.js` (ticker jokes per environment, finale text). All cosmetic.
- `tools/sim.js` — greedy balance simulator. `TWEAK='E.BOARD_BY_ID.rnd.base=9' node tools/sim.js 48` tries a variant without editing the economy.
- `worker/index.js` — `/api/code/new`, `/api/code/login`, `/api/code/rotate` (account codes → session; there is no email sign-in), `/api/save` GET/PUT, `/api/logout`, `/api/account` DELETE. Everything else goes to `env.ASSETS`.
- `migrations/` — D1 schema. Tokens and account codes are stored only as SHA-256 hashes. D1 always enforces foreign keys: never drop or rebuild `users` while it has rows, it cascade-deletes every session and save (0003 only did it because the table was empty).

## Rules of thumb

- Commit messages and PR titles follow Conventional Commits (`feat:`, `fix:`, `chore:`…): release-please builds versions and the changelog from them, and deploys happen only on its release tags. Merges use merge commits, so the PR title becomes part of history too.

- Big numbers: rows, rates, costs, multipliers and prestige currencies are break_infinity `Decimal`s (`public/js/big.js`, vendored in `public/js/vendor/`), good to 1e9e15. Use their methods (`.add`, `.mul`, `.gte`…), never `+`, `*` or `<`: `Decimal.valueOf()` returns a string, so `d + 1` silently concatenates. Counts and levels stay plain numbers. Saves store Decimals as strings; `normalize()` revives them (and old numeric saves) with `bigSafe`. Visuals that need a plain number get a ratio or a `log10()`.

- Saves are versioned (`SAVE_VERSION`). New fields go in `newState()`, and `normalize()` fills them into old saves. Never rename or reuse ids (producers, upgrades, arch, achievements): they're stored in players' saves.
- Balance changes: run `node tools/sim.js 72` and check that no layer snowballs (acquisitions or contacts every few minutes for hours means a feedback exponent near 1). Then run `node --test`. The honest-play tests check that real progress still passes `implausible()`. Loosen `maxBuff()` / `MAX_CLICKS_PER_SEC` there if a new mechanic can legitimately beat them.
- Client clicks are capped at 20/s to match the server budget.
- No third-party requests from the page: fonts, scripts, images and styles are self-hosted (Google Fonts would send every player's IP to Google). The only exception is Cloudflare Web Analytics, which the zone injects. The CSP in `public/_headers` enforces this; don't widen it for a CDN. A new asset the game needs offline goes into `SHELL` in `public/sw.js` (bump `CACHE`). Third-party links get `rel="noopener noreferrer"`.

## Commands

```bash
npm run dev              # wrangler dev, local D1
npm run db:migrate:local
npm test
```
