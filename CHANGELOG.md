# Changelog

## [0.5.0](https://github.com/drumandbytes/rows-to-riches/compare/v0.4.1...v0.5.0) (2026-11-01)


### Features

* galaxy.click cloud saves when embedded there ([#35](https://github.com/drumandbytes/rows-to-riches/issues/35)) ([1f3011b](https://github.com/drumandbytes/rows-to-riches/commit/1f3011b016875bf05cd7a4767baec24ef0cd2146))

## [0.4.1](https://github.com/drumandbytes/rows-to-riches/compare/v0.4.0...v0.4.1) (2026-11-01)


### Bug Fixes

* clickable PR links in the What's new card ([#32](https://github.com/drumandbytes/rows-to-riches/issues/32)) ([b3779b9](https://github.com/drumandbytes/rows-to-riches/commit/b3779b9b6f7d5d323708571bb7f92a6d517b305d))

## [0.4.0](https://github.com/drumandbytes/rows-to-riches/compare/v0.3.0...v0.4.0) (2026-11-01)


### Features

* opt-in leaderboards with signed start tickets and server-checked saves ([#30](https://github.com/drumandbytes/rows-to-riches/issues/30)) ([68db11b](https://github.com/drumandbytes/rows-to-riches/commit/68db11b698dd7ce10bc3379f7d4ccaeade16af39))
* sealed saves: encoded storage and exports, edited saves marked as modified ([#29](https://github.com/drumandbytes/rows-to-riches/issues/29)) ([adf6fec](https://github.com/drumandbytes/rows-to-riches/commit/adf6fecfd0ef3ca5c06610b4f30222b14f0390ad))

## [0.3.0](https://github.com/drumandbytes/rows-to-riches/compare/v0.2.2...v0.3.0) (2026-11-01)


### Features

* late-game incidents, requests, all-hands lines, mail and ticker ([#19](https://github.com/drumandbytes/rows-to-riches/issues/19)) ([cafd979](https://github.com/drumandbytes/rows-to-riches/commit/cafd97927253b63173381d16ebb47995d074fc54))
* opt-in Web Push when the offline cap is full or a challenge is about to time out ([#20](https://github.com/drumandbytes/rows-to-riches/issues/20)) ([b4be69c](https://github.com/drumandbytes/rows-to-riches/commit/b4be69ce775e246f439b291b0620d40833a67947))
* steady late-game scaling; browser smoke test in CI ([#17](https://github.com/drumandbytes/rows-to-riches/issues/17)) ([5b1893b](https://github.com/drumandbytes/rows-to-riches/commit/5b1893b9882bad43d3ece2cf08a41dbca935bac1))
* What's new card from the changelog after each release ([#18](https://github.com/drumandbytes/rows-to-riches/issues/18)) ([df3ea1b](https://github.com/drumandbytes/rows-to-riches/commit/df3ea1bb8f12b5ed2864562e40ccfb9db6ccabf9))


### Bug Fixes

* point embedded players to export/import instead of the hidden account codes ([#22](https://github.com/drumandbytes/rows-to-riches/issues/22)) ([8d7cb2b](https://github.com/drumandbytes/rows-to-riches/commit/8d7cb2b01eaeaf7f5bdfda6d73f74b7b12477ae2))

## [0.2.2](https://github.com/drumandbytes/rows-to-riches/compare/v0.2.1...v0.2.2) (2026-11-01)


### Bug Fixes

* deploy check accepts Cloudflare bot challenges, fails only on blocks ([#25](https://github.com/drumandbytes/rows-to-riches/issues/25)) ([01b356c](https://github.com/drumandbytes/rows-to-riches/commit/01b356c0812f1f691568e3b31f0207a508e60936))
* let GPC/DNT browsers opt in to stats, and report rows correctly ([#26](https://github.com/drumandbytes/rows-to-riches/issues/26)) ([71ba06c](https://github.com/drumandbytes/rows-to-riches/commit/71ba06cca618e9824d54a9c584f1534d89bc7cc4))
* offline module list, faster production math, renamed vendor parodies ([#16](https://github.com/drumandbytes/rows-to-riches/issues/16)) ([c4106e5](https://github.com/drumandbytes/rows-to-riches/commit/c4106e5f1953891c73564c298f4d3a64112381f8))

## [0.2.1](https://github.com/drumandbytes/rows-to-riches/compare/v0.2.0...v0.2.1) (2026-11-01)


### Bug Fixes

* serve break_infinity from js/lib, which the zone WAF doesn't block ([#23](https://github.com/drumandbytes/rows-to-riches/issues/23)) ([0641e59](https://github.com/drumandbytes/rows-to-riches/commit/0641e59dc5033281eca680f40245567d3986136e))

## [0.2.0](https://github.com/drumandbytes/rows-to-riches/compare/v0.1.5...v0.2.0) (2026-10-31)


### Features

* account codes instead of email sign-in
* challenge tiers with fixed, calibrated goals and a speed bonus; challenges gate each prestige
* endgame: Big Bang milestones up to 500, Catalog Everything with New Game+, completion pop-up and share
* environments per company with a progress bar to the next one
* no number ceiling: rows, rates, costs and currencies use break_infinity Decimals, capped at 1e(1e15) with a secret achievement
* prestige auto-buyers (Radar Bot, Board Bot, Xenotech) and Permanent Platform
* rebalance: Insight soft cap, steeper Better Defaults, half-speed offline progress
* release-please versions and changelog; deploy on release tags
* selling sources, deployed-upgrades list, output shares, first-run walkthrough


### Bug Fixes

* inbox timestamps follow the Clock setting
