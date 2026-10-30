# CLAUDE.md

Data engineering idle game at rowstoriches.drumandbytes.dev. See README.md for the design.

## Layout

- `public/` — the whole client, served as static assets with no build step. `index.html` + `style.css` + ES modules in `public/js/`.
- `public/js/economy.js` — **all game rules**, as pure functions with no DOM access. The Worker imports this same file to validate uploaded saves, so a balance change here also changes what the server accepts. Keep it free of browser APIs.
- `public/js/main.js` — state, game loop (200ms tick), rendering, incidents, cloud reconcile. Lists rebuild their DOM only when `visibleKey()` changes; everything else updates text in place.
- `public/js/scene.js` (pipeline canvas: one station per owned source, backdrop per environment `scene`), `widgets.js` (query log, throughput sparkline, sparks/confetti/banners), `flavor.js` (ticker jokes per environment, finale text). All cosmetic.
- `tools/sim.js` — greedy balance simulator. `TWEAK='E.BOARD_BY_ID.rnd.base=9' node tools/sim.js 48` tries a variant without editing the economy.
- `worker/index.js` — `/api/login`, `/api/verify` (magic link → session), `/api/save` GET/PUT, `/api/logout`, `/api/account` DELETE. Everything else goes to `env.ASSETS`.
- `migrations/` — D1 schema. Tokens are stored only as SHA-256 hashes.

## Rules of thumb

- Saves are versioned (`SAVE_VERSION`). New fields go in `newState()`, and `normalize()` fills them into old saves. Never rename or reuse ids (producers, upgrades, arch, achievements): they're stored in players' saves.
- Balance changes: run `node tools/sim.js 72` and check that no layer snowballs (acquisitions or contacts every few minutes for hours means a feedback exponent near 1). Then run `node --test`. The honest-play tests check that real progress still passes `implausible()`. Loosen `maxBuff()` / `MAX_CLICKS_PER_SEC` there if a new mechanic can legitimately beat them.
- Client clicks are capped at 20/s to match the server budget.
- Sign-in links are built from `APP_ORIGIN`, never from the request's Host header.

## Commands

```bash
npm run dev              # wrangler dev, local D1
npm run db:migrate:local
npm test
```
