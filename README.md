# Rows to Riches

An idle clicker about data engineering. Start with one CSV on `localhost`, hire spreadsheet interns, schedule cron jobs, grow into warehouses, lakehouses and data centers, and end up storing rows in a Dyson sphere. Then re-platform everything and do it again, faster.

**Play:** [rowstoriches.drumandbytes.dev](https://rowstoriches.drumandbytes.dev) · part of [Drumandbytes Projects](https://drumandbytes.com/projects/)

## How it plays

The story starts reasonable and gets steadily sillier: a CSV on localhost, then cron jobs and warehouses, then qubit farms, orbital data centers and a Dyson Warehouse, then aliens with their own data types, and finally *everything is data*.

| System | What it does |
| --- | --- |
| **Walkthrough** | A 9-step spotlight tour on a fresh save (some steps wait for you to do the thing); replay it from Settings → Help. |
| **Numbers** | No ceiling: rows, rates and currencies use break_infinity.js Decimals (up to 1e9e15), and all ten notations format them, e.g. `3.20e9,500` or `e1.50e12`. |
| **INSERT** | The click. Fast clicking builds a combo (up to +100%). Upgrades turn it from +1 row into a share of your rows/s, and the button's SQL grows up with them. |
| **Data Sources** | 26 sources, from Spreadsheet Intern to Everything Is Data. Each one stands on the pipeline stage and sends packets to the storage sink. Cards show each source's share of output; sell mode sells bought units back for half. |
| **Upgrades** | 9 ×2 upgrades per source, 25 synergies (each source boosts the next), plus click and global upgrades: about 280 in total. |
| **Schema** | Columns multiply everything. Alien data types (`QUBIT`, `VIBE`, `NULLER_THAN_NULL`, …) make every column stronger. |
| **Incidents** | PagerDuty alerts, backfills, viral dashboards, schema drift and, later, 🛸 abductions. |
| **Environments** | localhost → dev → staging → prod → multi-region → quantum → planetary → orbital → interstellar → first contact → multiverse → everything. Each has its own backdrop and ticker jokes. |
| **Challenges** | 13 restricted runs across three tiers (no columns, sources ×100 cost, no INSERT, production ÷1e9, …). Beat the goal for a strong reward that lasts until the layer above next resets: Re-platform challenges until the next Acquisition, and so on. |
| **Inbox** | About 30 emails, news items and vendor notices triggered by milestones. Amazonian Web Servers would like you to finance your own data center. |
| **Stats & Data Catalog** | About 200 achievements (+1% production each) and detailed stats: best rows/s, fastest prestiges, longest combo, time played, … |
| **Settings** | Game (company name, number notation, automation), Audio (master / SFX / music), Display (quality, full screen on desktop), Save (cloud, save now, export / import, reset), Help, About. Volumes, quality and notation are per device and never synced. |
| **Audio** | All synthesized live with Web Audio: sound effects, plus generative music with one mood per environment (lo-fi localhost → server-room pulse → quantum bells → space pads → alien scales → music box). No audio files. |
| **Secrets** | A few hidden achievements, plus one you get by clicking it. |
| **Keyboard** | <kbd>Space</kbd> INSERT · <kbd>1</kbd>–<kbd>6</kbd> tabs · <kbd>B</kbd> buy amount · <kbd>M</kbd> mute · <kbd>F</kbd> full screen |
| **Corporate life** | 🎯 Quarterly OKRs (15 min of play) graded at a 📣 all-hands with a performance rating; 📅 meetings and 📨 stakeholder requests as two-choice cards. |
| **Analytics** | Cookieless and identifier-free: anonymous events to Workers Analytics Engine via `/api/t`. Players can opt out under Save → Privacy; GPC and DNT are respected. |
| **Embedding** | `frame-ancestors` allows galaxy.click only. Embedded players get a note that cloud sync needs the main site (iframe storage is partitioned). |
| **Installable app (PWA)** | Manifest, maskable icons and a network-first service worker (`public/sw.js`): installs on desktop and Android, Add to Home Screen on iOS, and plays offline. **Adding a JS module means adding it to `SHELL` in `sw.js`**, or offline loads miss it. |
| **Offline progress** | Closed tabs keep earning at the current rate, up to 4h (more with Bigger Disks). |

### Prestige layers

Each layer resets everything below it. Its currency comes from a root of the rows earned since that layer last reset. The roots keep the numbers converging instead of snowballing (see `tools/sim.js`).

| Layer | Currency | Spent on |
| --- | --- | --- |
| 💡 **Re-platform** | Insights = ∛(company rows / 1e5), +3% production each | **Architecture** (18 one-time picks) and the **Tech Radar** (9 levelled tracks) |
| 📈 **Acquisition** | Equity = ⁴√(civilization rows / 1e18) | **Board**: automation (auto re-platform, GitOps), the R&D Lab (6 post-Dyson sources), Synergy, Investor Relations, Golden Parachute, … |
| 👽 **First Contact** | Xenobytes = ⁵√(universe rows / 1e30) | **Xenotech**: Contact Protocol (5 alien sources), alien data types, Warp Drive, Hive Automation, Abduction Insurance |
| 🌀 **Big Bang** | Axioms, after the finale | Never spent: ×3 production and ×1.5 to every prestige gain, forever |

Simulated pacing (greedy play, 2 clicks/s, no idle gaps; real players take several times longer): first re-platform ≈ 45 min, first acquisition ≈ 5h, First Contact ≈ 15h, finale ≈ 31h, then 8–10h universes.

Numbers are plain doubles. Each universe caps at 1e300 rows and multipliers cap at 1e200, so nothing reaches `Infinity`. An open-ended New Game+ would need a move to `break_infinity.js`.

## Saves and sync

- The game is local-first. It autosaves to `localStorage` every 5s and whenever the tab is hidden. Export and Import live under Settings.
- **Cloud sync** is optional. Create an **account code** (`R2R-XXXX-XXXX-XXXX-XXXX-XXXX`, 100 random bits) and enter it, or open its `#code=` link, on your other devices. No email, no password; the server keeps only a hash. Lost it? Any device that's still signed in can make a new one. Settings → Delete account removes everything.
- When two devices disagree, the save with more all-time rows wins automatically. If the cloud is ahead, the game asks first.

### Why not a salted hash?

All the game code runs in the player's browser, so whatever key salts or signs a save ships to them too. A hash proves a save wasn't changed *after* signing, but it can't prove the numbers were earned. Instead, the Worker re-runs the same rules (`public/js/economy.js`) on every upload and rejects saves that can't be real:

- the bank is larger than the run's earnings, or a run is larger than all-time,
- the cost of everything owned is more than the run earned,
- there are more Insights than the formula grants, or Architecture costs don't add up,
- prestige currencies above what their formulas grant, sources the save hasn't unlocked,
- rows grew faster than the save's best possible rate (all buffs stacked, 20 clicks/s) could explain, measured on the server's clock.

Achievements are re-derived on the server rather than trusted. A careful cheater can still build a self-consistent fake save. That's fine for a single-player game, and it's the bar a leaderboard would need anyway.

## Development

Plain ES modules with no build step. One Cloudflare Worker serves `public/` as static assets and handles `/api/*` with D1.

```bash
npm install
npm run db:migrate:local
npm run dev          # http://localhost:8787
npm test             # node:test, economy + plausibility checks
node tools/sim.js 72 # balance sim: prestige milestones over 72 simulated hours
```

`.dev.vars` (gitignored) sets `APP_ORIGIN` to the local server.

## Deploying

Infrastructure lives in the org's OpenTofu repos; secrets stay out of state. First publish, in order:

1. **GitHub repo**: `drumandbytes/dnb-tf` (branch `feat/rows-to-riches`) adds this public repo with branch protection from the org ruleset. Plan and apply there (`just kp plan`, `just kp apply`), then push this checkout to it.
2. **Secrets**: `CLOUDFLARE_API_TOKEN` is a repo secret here (it overrides the org secret): the account token `dnb-ci-rows-to-riches-deploy`, which adds D1 Read/Write for the migration step to the Workers scopes. `CLOUDFLARE_ACCOUNT_ID` comes from the org. Both the token and its rotation live in `dnb-cloudflare-tf` (`tokens.tf`, `just kp rotate-all`). Actions secrets are deliberately not in dnb-tf.
3. **D1**: `drumandbytes/dnb-cloudflare-tf` (branch `feat/rows-to-riches`, `rows-to-riches.tf`) creates the `rows-to-riches` database. After applying, put its UUID into `wrangler.jsonc` (`tofu state show cloudflare_d1_database.rows_to_riches_db`).
4. **Deploy**: merging to `main` runs `.github/workflows/deploy.yml` (tests → D1 migrations → `wrangler deploy`). The Worker's `custom_domain` route creates `rowstoriches.drumandbytes.dev`.
   Releases: commits follow Conventional Commits (`feat: …`, `fix: …`). release-please keeps a release PR open with the version bump (package.json and `VERSION` in `public/js/main.js`) and `CHANGELOG.md`; merging it tags `vX.Y.Z`, and the tag runs `deploy.yml` (tests → D1 migrations → `wrangler deploy`). Patch releases auto-merge once CI passes; minor and major wait for you. `npm run deploy` still works for an emergency deploy from a checkout, without a version bump.
5. **Import the new DNS records** into dnb-cloudflare-tf: the two Worker custom-domain records. `_dmarc.rowstoriches` (`p=reject`) stays: the subdomain sends no mail, so nobody may send as it.

Already covered, nothing to do:
- **Page views**: Cloudflare Web Analytics is zone-wide and auto-injected on drumandbytes.dev; the CSP allows it.
- **Referrers**: the Worker writes to the shared `dnb_refs` dataset itself (`logRef`), so ref-logger needs no route for this host.
- **Gameplay stats**: the `rows_to_riches_events` Analytics Engine dataset is created on first write.
- **Embedding**: `frame-ancestors` allows galaxy.click; submitting the game there is done on galaxy.click.

Cost: static assets are free; the API, D1 and Analytics Engine sit well within the Workers Paid plan's included usage.
