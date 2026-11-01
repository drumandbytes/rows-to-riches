# Changelog

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
