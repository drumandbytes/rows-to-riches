# Maintaining Rows to Riches

Notes for running the live game at rowstoriches.drumandbytes.dev.

## Releases and deploys

- Merging to `main` doesn't deploy. [release-please](https://github.com/googleapis/release-please) keeps a release PR open with the next version (`package.json`, `VERSION` in `public/js/main.js`) and `CHANGELOG.md`.
- Merging the release PR tags `vX.Y.Z`, and the tag runs `.github/workflows/deploy.yml`: tests → D1 migrations → `wrangler deploy` → `tools/check-live.js`, which fails the run if any file in `public/` doesn't load from the live site.
- Patch releases auto-merge once CI passes; minor and major releases wait for a maintainer.
- The deploy copies `CHANGELOG.md` into the site, where the in-game "What's new" card reads it.
- `npm run deploy` deploys straight from a checkout, without a version bump, for emergencies only.

## Infrastructure

- The Worker, its routes and custom domains are defined in `wrangler.jsonc`. The cron (every 5 minutes) sends due push notifications and, once a day, checks how many leaderboard names are taken.
- The D1 database, DNS, WAF rules, zone bot settings and the CI deploy token are managed in the `drumandbytes/dnb-cloudflare-tf` OpenTofu repo, not here.
- The zone WAF blocks any path containing `/vendor/` as a scanner probe. Vendored libraries live in `public/js/lib/` for that reason.
- The page's Content Security Policy is in `public/_headers`. It allows only same-origin scripts plus Cloudflare Web Analytics, so any zone feature that injects scripts (Google tag gateway, bot JavaScript detections) gets blocked and should stay off for this host.

## Secrets

GitHub: `CLOUDFLARE_API_TOKEN` (repo secret, the deploy token) and `CLOUDFLARE_ACCOUNT_ID` (from the org).

Worker secrets, set with `npx wrangler secret put <NAME>`. Every one is optional: the feature it powers stays off without it.

| Secret | Powers | How to make it |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Pings for in-game feedback, flagged leaderboard runs and the name-space alert | A Telegram bot |
| `VAPID_PRIVATE_JWK` | Push notifications | `node tools/vapid.js \| npx wrangler secret put VAPID_PRIVATE_JWK`. A new key drops every push subscription |
| `LEADERBOARD_KEY` | Leaderboards | `openssl rand -base64 32 \| tr '+/' '-_' \| tr -d '=\n' \| npx wrangler secret put LEADERBOARD_KEY` (32 random bytes as base64url). A new key invalidates start tickets: games in progress get a "late" ticket, which counts for every board except fastest |

The tools print keys to stdout, so piping them straight into `wrangler` keeps them off the screen and out of files.

## Leaderboards

- Nothing is rejected for being fast. Runs that reach a milestone in under half the simulator's time (`worker/pace.json`), or grow faster than real time allows, stay listed and are pinged to Telegram once for a look.
- To hide an entry after checking it:

  ```bash
  npx wrangler d1 execute rows-to-riches --remote --command "UPDATE lb_entries SET hidden = 1 WHERE id = '<id from the ping>'"
  ```

- After a balance change, regenerate the pace table with `node tools/pace.js`, or honest runs may start getting flagged.
- Names are unique, from about 1.2 million combinations (`public/js/names.js`). A daily check pings once 1,000,000 are taken; add words before the lists run out.

## Analytics

- Page views: Cloudflare Web Analytics, injected zone-wide.
- Referrers: the Worker writes them to the shared `dnb_refs` Analytics Engine dataset (`logRef` in `worker/index.js`).
- Gameplay stats: the `rows_to_riches_events` Analytics Engine dataset, created on first write.

## Cost

Static assets are free. The API, D1 and Analytics Engine sit well within the Workers Paid plan's included usage.
