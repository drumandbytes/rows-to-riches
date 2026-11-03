# Changelog

## [0.7.7](https://github.com/drumandbytes/rows-to-riches/compare/v0.7.6...v0.7.7) (2026-11-03)


### Performance Improvements

* the service worker answers from a release-versioned cache first, and the module chain is preloaded ([62e2308](https://github.com/drumandbytes/rows-to-riches/commit/62e2308b06b98123e81f78e3ac7a89dc2c0d30e9))

## [0.7.6](https://github.com/drumandbytes/rows-to-riches/compare/v0.7.5...v0.7.6) (2026-11-03)


### Bug Fixes

* fixed challenge goals for everyone (a fair leaderboard); Long-Term Support is winnable with the interns-only kit; refresh the pace table ([ca58ac3](https://github.com/drumandbytes/rows-to-riches/commit/ca58ac34bddc2cd2c03ab4828ee29d93b17ac4eb))

## [0.7.5](https://github.com/drumandbytes/rows-to-riches/compare/v0.7.4...v0.7.5) (2026-11-03)


### Bug Fixes

* challenge goals follow your own last time, keep the interns-only kit winnable, refresh the pace table ([6e553f2](https://github.com/drumandbytes/rows-to-riches/commit/6e553f261494aa8557a31abe6f61f56844d49ac7))

## [0.7.4](https://github.com/drumandbytes/rows-to-riches/compare/v0.7.3...v0.7.4) (2026-11-03)


### Bug Fixes

* cap boosts and drop bonus rows in challenges, no click upgrades without INSERT, a department of interns as the no-INSERT kit ([0ef7622](https://github.com/drumandbytes/rows-to-riches/commit/0ef7622feaecf277d0b5d4391e51f04c8714c63e))
* keep the Buy button on screen and tidy the challenge banner on phones ([0963c75](https://github.com/drumandbytes/rows-to-riches/commit/0963c75d44f5ab6a2694c3cd9a2f67ed0c422817))
* lower the Acquisition goal reference so rewards from earlier challenges count sooner ([cb0c2f6](https://github.com/drumandbytes/rows-to-riches/commit/cb0c2f63ac96635611858fd37a865f1a1e4f9f02))
* scale challenge goals with the strength you start the run with, and repair the PROBE tool ([616292e](https://github.com/drumandbytes/rows-to-riches/commit/616292ef66fee8a35e2ef357fdacfb7a961354ac))
* small dismissible new-environment card, 16px fields on touch to stop iOS zoom ([078002a](https://github.com/drumandbytes/rows-to-riches/commit/078002a6554ab90e0822debb50e9039e2555d625))
* update lists and cards in place so a tap on a button isn't lost to a re-render ([f0f0668](https://github.com/drumandbytes/rows-to-riches/commit/f0f0668475e19541fea4fe39b698f70ae92778ec))


### Performance Improvements

* tick every 100 ms; measured cost is under 1% CPU even at 50 ms ([49c98c9](https://github.com/drumandbytes/rows-to-riches/commit/49c98c96ce6d053b85ae71540e48790fa57728c9))

## [0.7.3](https://github.com/drumandbytes/rows-to-riches/compare/v0.7.2...v0.7.3) (2026-11-03)


### Bug Fixes

* give every source row the same shape so the list lines up ([58841cd](https://github.com/drumandbytes/rows-to-riches/commit/58841cdb52a7bf5121ce092a57545bea560ab6d0))
* judge currencies against the full multiplier set during a challenge, and relax the pace flag ([0d16a73](https://github.com/drumandbytes/rows-to-riches/commit/0d16a73e64bb9fbed3636edd3bd7c57136eb0a32))
* skip the growth check in the rules-only validation ([fce98b4](https://github.com/drumandbytes/rows-to-riches/commit/fce98b4410c473c0660dfe709176dbe5aa40944f))
* stop checking and announcing cloud saves; show no refusal messages to players ([fe77582](https://github.com/drumandbytes/rows-to-riches/commit/fe77582c3c212f6f0bb53e343f63facf869a389d))

## [0.7.2](https://github.com/drumandbytes/rows-to-riches/compare/v0.7.1...v0.7.2) (2026-11-02)


### Bug Fixes

* call update() from the auto-buyer options, it still used the old updateSettings name ([b46b035](https://github.com/drumandbytes/rows-to-riches/commit/b46b035e8e0ca9b32fd629bd7e981542c5dd251a))

## [0.7.1](https://github.com/drumandbytes/rows-to-riches/compare/v0.7.0...v0.7.1) (2026-11-02)


### Bug Fixes

* pass fmtDuration, prefs and setPref to the prestige module so Challenges opens ([308cbb2](https://github.com/drumandbytes/rows-to-riches/commit/308cbb23ba99b93e083a4fc5a90014cb5441dac8))

## [0.7.0](https://github.com/drumandbytes/rows-to-riches/compare/v0.6.7...v0.7.0) (2026-11-02)


### Features

* 16 more emails, late-game ticker and finale lines, three more secret achievements ([d16d0c2](https://github.com/drumandbytes/rows-to-riches/commit/d16d0c2c12594c25739efabf18595c1063d450ef))
* accessibility pass with an axe CI test ([9b6476e](https://github.com/drumandbytes/rows-to-riches/commit/9b6476ec2129a36c3aeb38efefd2a8e396cd44ee))
* add 144 and 240 fps frame-rate options ([ef459a0](https://github.com/drumandbytes/rows-to-riches/commit/ef459a0e9f1c7146423d858226730c4cc4d40bc5))
* keep unearned secret achievements out of the catalog and disguise Click Me ([36564c7](https://github.com/drumandbytes/rows-to-riches/commit/36564c730313ddaf83781ceb677066d4a735036a))
* offer a reload when a new version is ready and check for updates on return ([c4b09b7](https://github.com/drumandbytes/rows-to-riches/commit/c4b09b7123a8a71cc4687cb701f7d60e5d90ab93))
* one shared frame loop with a frame-rate setting and idle throttling ([427249c](https://github.com/drumandbytes/rows-to-riches/commit/427249c35e55e13b404d93287b3be52afb2dc315))
* run history on the Stats tab: production curve and a prestige log ([af9bdfd](https://github.com/drumandbytes/rows-to-riches/commit/af9bdfddba5b0e467131974fdff923d64a6604c2))
* share card, a picture of the run drawn on demand ([3ed2d4c](https://github.com/drumandbytes/rows-to-riches/commit/3ed2d4c106dedcfe5e25d46194cc0c97e8e7d674))


### Bug Fixes

* drop the status-bar strip, the header clearance alone stops the iOS blur ([0858ad9](https://github.com/drumandbytes/rows-to-riches/commit/0858ad97ed9c9edd872c5073a39325dc42adaeae))
* precache the share card module ([2fb1e3d](https://github.com/drumandbytes/rows-to-riches/commit/2fb1e3d856b7eb9c4367eb92cf0aad475ebb6772))

## [0.6.7](https://github.com/drumandbytes/rows-to-riches/compare/v0.6.6...v0.6.7) (2026-11-02)


### Bug Fixes

* limit the header clearance to iOS and iPadOS installs ([ed21067](https://github.com/drumandbytes/rows-to-riches/commit/ed2106755ffb6d596ae9c94cc2a9bedcf3ae7c00))
* push the installed-app header content clear of iOS's top edge blur ([11f1200](https://github.com/drumandbytes/rows-to-riches/commit/11f1200c25d5af8c88a103aa8235cf7b42ccd684))

## [0.6.6](https://github.com/drumandbytes/rows-to-riches/compare/v0.6.5...v0.6.6) (2026-11-02)


### Bug Fixes

* move push notifications from Save to the Game settings ([d396e17](https://github.com/drumandbytes/rows-to-riches/commit/d396e173b6259709ab777036baebc12387712de1))

## [0.6.5](https://github.com/drumandbytes/rows-to-riches/compare/v0.6.4...v0.6.5) (2026-11-02)


### Bug Fixes

* give iOS 26 a solid fixed strip at the status bar so it stops blurring the header ([d9b390e](https://github.com/drumandbytes/rows-to-riches/commit/d9b390eed4e06464c7f761b558080876eb669d1b))

## [0.6.4](https://github.com/drumandbytes/rows-to-riches/compare/v0.6.3...v0.6.4) (2026-11-02)


### Bug Fixes

* drop the header backdrop blur, it fades the top edge in the PWA ([d2451eb](https://github.com/drumandbytes/rows-to-riches/commit/d2451ebd30a40eef0246523e14e2e2d8bbca1165))
* drop the header backdrop blur, it fades the top edge in the PWA ([61888f8](https://github.com/drumandbytes/rows-to-riches/commit/61888f8dc71ef61f5b5c3c0e6a55be6cb1515b06))
* stop scaling the rows counter, it rasterizes blurry on iOS ([845aafc](https://github.com/drumandbytes/rows-to-riches/commit/845aafc436e796bc567b07e892eaa3711b628c73))
* stop the rate pulse drawing a dark halo on iOS ([aff9e48](https://github.com/drumandbytes/rows-to-riches/commit/aff9e48a7c09aecaeba5dbbe33e2cc432d4c2434))

## [0.6.3](https://github.com/drumandbytes/rows-to-riches/compare/v0.6.2...v0.6.3) (2026-11-02)


### Bug Fixes

* make the header opaque so scrolled content doesn't bleed through ([bd4f732](https://github.com/drumandbytes/rows-to-riches/commit/bd4f73284426c1a1488b7771d72bb097376de8e5))
* make the header opaque so scrolled content doesn't bleed through ([bff238d](https://github.com/drumandbytes/rows-to-riches/commit/bff238dcc776bb0f88d3adc21526fdacf56a00c4))

## [0.6.2](https://github.com/drumandbytes/rows-to-riches/compare/v0.6.1...v0.6.2) (2026-11-02)


### Bug Fixes

* fit the header to narrow screens ([7760208](https://github.com/drumandbytes/rows-to-riches/commit/7760208936cb1c13ceda5f8b46071e924bb430b9))

## [0.6.1](https://github.com/drumandbytes/rows-to-riches/compare/v0.6.0...v0.6.1) (2026-11-02)


### Bug Fixes

* stop loading galaxy.click embed code and drop its framing allowance ([0cd6f17](https://github.com/drumandbytes/rows-to-riches/commit/0cd6f171086c0e1bc4b62df4e2ab306f4b793103))

## [0.6.0](https://github.com/drumandbytes/rows-to-riches/compare/v0.5.0...v0.6.0) (2026-11-02)


### Features

* add share card, structured data, sitemap and guide pages for SEO ([#38](https://github.com/drumandbytes/rows-to-riches/issues/38)) ([887a932](https://github.com/drumandbytes/rows-to-riches/commit/887a932572d1ad594014590693bd356f792e8430))

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
