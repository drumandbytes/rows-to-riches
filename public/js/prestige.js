// The prestige layers: Re-platform, Acquisition, First Contact and Big Bang, their shops, the
// challenges and the challenge banner. The game loop's auto-prestige and the per-tick tab dot use it too.

import { morph } from "./morph.js";

export function createPrestige({ E, state, fmt, esc, $, modal, toast, scene, audio, track, afterPurchase, render, setHtml, ROMAN, getTab, fmtDuration, prefs, setPref }) {
  let prestigeTab = "replat";

  const LAYERS = [
    {
      id: "replat", icon: "💡", name: "Re-platform", cur: "Insights",
      have: (s) => s.ins, spendable: (s) => s.ins.sub(s.insSpent),
      pending: E.pendingInsights, run: E.replatform, verb: "Re-platform",
      progress: (s) => `Next Insight at ${fmt(E.nextInsightAt(s))} company rows (${fmt(s.coRows)} so far).`,
      effect: (s) => `Insights boost production: +${E.insightPct(s) * 100}% per point, with diminishing returns (now +${fmt(E.insightBonus(s).mul(100))}%).`,
      confirm: "Rewrite everything in this year's hot new stack. You lose rows, Data Sources, upgrades and columns.",
      keeps: "Insights, Architecture, Tech Radar and everything above are kept.",
      done: (g) => `💡 <b>Re-platformed.</b> +${fmt(g)} Insights. The new stack is mostly YAML.`,
      visible: () => true,
      shops: ["arch", "radar"],
    },
    {
      id: "acq", icon: "📈", name: "Acquisition", cur: "Equity",
      have: (s) => s.eq, spendable: (s) => s.eq.sub(s.eqSpent),
      pending: E.pendingEquity, run: E.acquire, verb: "Get acquired",
      progress: (s) => `Next Equity at ${fmt(E.nextEquityAt(s))} civilization rows (${fmt(s.civRows)} so far).`,
      effect: (s) => `Equity boosts production (now ×${fmt(E.equityProdMult(s))}) and buys Board seats.`,
      confirm: "A bigger fish buys your company. You also lose Insights, Architecture and the Tech Radar.",
      keeps: "Equity, the Board and everything above are kept.",
      done: (g) => `📈 <b>Acquired!</b> +${fmt(g)} Equity. Your new title is 'Head of Data Synergies'.`,
      visible: (s) => s.acq > 0 || s.contact > 0 || s.bangs > 0 || s.ins >= 50,
      teaser: "Unlocks once you have 50 Insights.",
      shops: ["board"],
    },
    {
      id: "contact", icon: "👽", name: "First Contact", cur: "Xenobytes",
      have: (s) => s.xeno, spendable: (s) => s.xeno.sub(s.xenoSpent),
      pending: E.pendingXeno, run: E.firstContact, verb: "Make contact",
      progress: (s) =>
        E.rndComplete(s)
          ? `Next Xenobyte at ${fmt(E.nextXenoAt(s))} universe rows (${fmt(s.allRows)} so far).`
          : `The aliens only talk to civilizations with a complete R&D Lab (${E.boardLevel(s, "rnd")}/${E.RND_PRODUCERS}, on the Board).`,
      effect: (s) => `Xenobytes boost production (now ×${fmt(E.xenoProdMult(s))}) and buy alien tech.`,
      confirm: "Aliens arrive. They are very interested in your schema. You also lose Equity and the Board.",
      keeps: "Xenobytes, Xenotech and Axioms are kept.",
      done: (g) => `👽 <b>Contact made.</b> +${fmt(g)} Xenobytes. They brought their own data types.`,
      visible: (s) => s.contact > 0 || s.bangs > 0 || s.acq >= 3,
      teaser: "Unlocks after 3 acquisitions.",
      shops: ["xeno"],
    },
    {
      id: "bang", icon: "🌀", name: "Big Bang", cur: "Axioms",
      have: (s) => s.axioms, spendable: () => 0,
      pending: E.pendingAxioms, run: E.bigBang, verb: "Big Bang",
      progress: (s) =>
        E.canBigBang(s)
          ? `Ready. A Big Bang turns this universe's rows into Axioms: one per 30 orders of magnitude (${fmt(s.allRows)} rows so far).`
          : "Not yet: the universe ends once you own the final Data Source, Everything Is Data. Then a Big Bang turns its rows into Axioms.",
      effect: (s) => `Axioms are permanent. Each one triples all production and makes every other prestige currency (Insights, Equity, Xenobytes) grow 1.5× faster. You have ${s.axioms}.`,
      confirm: "End this universe and start a new one. Everything resets except Axioms, the Data Catalog and lifetime stats.",
      keeps: "Axioms are permanent.",
      done: (g) => `🌀 <b>Let there be rows.</b> +${g} Axioms. A new universe boots up on localhost.`,
      visible: (s) => s.contact > 0 || s.bangs > 0,
      teaser: "Unlocks after First Contact.",
      shops: [],
    },
  ];
  const LAYER_BY_ID = Object.fromEntries(LAYERS.map((l) => [l.id, l]));

  const SHOP_META = {
    arch: { title: "Architecture", icon: "🏗️", cur: "💡", note: "One-time. Spending Insights doesn't lower their bonus." },
    radar: { title: "Tech Radar", icon: "📡", cur: "💡", note: "Levels. Reset by acquisitions (Golden Parachute keeps some)." },
    board: { title: "Board", icon: "🏛️", cur: "📈", note: "Levels. Reset by First Contact (unless you own Probe Swarm)." },
    xeno: { title: "Xenotech", icon: "🛸", cur: "👽", note: "Levels. Reset by a Big Bang." },
  };

  // Which retention rewards apply when prestiging at each layer.
  const RETENTION = { replat: ["keepupg", "keepcols", "keepsrc"], acq: ["keepradar", "keepins"], contact: ["keepeq", "keepcontact"], bang: ["keepxeno", "keepboard"] };

  function onPrestige(layer) {
    const gain = layer.pending(state());
    if (E.big(gain).lt(1) || !E.gateOpen(state(), layer.id)) return;
    const kept = (RETENTION[layer.id] ?? []).filter((id) => E.won(state(), id)).map((id) => `<li>${esc(E.CHALLENGE_BY_ID[id].reward)}</li>`);
    modal(
      `<h2>${layer.icon} ${layer.verb}?</h2><p>${esc(layer.confirm)}</p><p>You gain <b>${fmt(gain)} ${layer.cur}</b>.</p><p class="muted">${esc(layer.keeps)}</p>${kept.length ? `<p>🏆 Challenge rewards in effect:</p><ul class="kept">${kept.join("")}</ul>` : ""}`,
      [["Cancel"], [layer.verb, "primary", () => doPrestige(layer)]],
    );
  }

  function doPrestige(layer, quiet = false) {
    E.tick(state(), Date.now());
    const gain = layer.run(state());
    if (E.big(gain).lt(1)) return;
    track(layer.id);
    if (!quiet) {
      toast(layer.done(gain));
      scene.shake();
      audio.sfx("prestige");
    }
    afterPurchase();
  }

  function shopItems(shop) {
    // Architecture is paid in Insights like the Radar, so it borrows the Radar's currency keys.
    const [defs, key, cur, spent] = E.SHOPS[shop === "arch" ? "radar" : shop];
    const free = state()[cur].sub(state()[spent]);
    if (shop === "arch") {
      return E.ARCH.map((a) => {
        const owned = state().arch.includes(a.id);
        return { id: a.id, name: a.name, desc: a.desc, owned, cost: a.cost, afford: !owned && free.gte(a.cost), label: owned ? "Owned" : `${fmt(a.cost)} ${SHOP_META.arch.cur}` };
      });
    }
    return Object.values(defs).map((d) => {
      const l = state()[key][d.id] ?? 0;
      const maxed = l >= d.max;
      const cost = E.levelCost(d, l);
      const lv = d.max === 1 ? "" : d.max >= 100 ? `Lv ${l}` : `Lv ${l}/${d.max}`;
      return { id: d.id, name: d.name, lv, desc: d.desc(l), owned: maxed, cost, afford: !maxed && free.gte(cost), label: maxed ? (d.max === 1 ? "Owned" : "MAX") : `${fmt(cost)} ${SHOP_META[shop].cur}` };
    });
  }

  function renderShop(shop) {
    const meta = SHOP_META[shop];
    const items = shopItems(shop)
      .map(
        (it) => `<li class="item ${it.owned ? "owned" : ""} ${it.afford ? "affordable" : ""}"><div class="ico" aria-hidden="true">${meta.icon}</div>
        <div><div class="name">${esc(it.name)}${it.lv ? ` <span class="lv">${it.lv}</span>` : ""}</div><div class="sub">${esc(it.desc)}</div></div>
        <button class="buy" type="button" data-shop="${shop}" data-item="${it.id}" ${it.afford ? "" : "disabled"}>${it.label}</button></li>`,
      )
      .join("");
    return `<h3>${meta.title}</h3><p class="muted">${meta.note}</p><ul class="list">${items}</ul>`;
  }

  // Tab dot / auto-prestige rule of thumb: the pending gain would at least double what you have.
  // Measured against what this company (civilization, universe) earned, so carried-over
  // currency from the Big Bang milestones doesn't stop prestige from paying off.
  const wouldDouble = (l) => E.big(l.pending(state())).gte((l.id === "bang" ? E.big(l.have(state())) : E.layerEarned(state(), l.id)).max(1));

  function renderPrestige() {
    // Tab dot: some layer would at least double its currency.
    const ready = LAYERS.some((l) => l.visible(state()) && E.gateOpen(state(), l.id) && wouldDouble(l));
    $("ins-dot").hidden = !ready;
    if (getTab() !== "prestige") return;
    const visible = LAYERS.filter((l) => l.visible(state()));
    const chalOpen = E.CHALLENGE_LAYERS.some((l) => l.unlocked(state()));
    const next = LAYERS.find((l) => !l.visible(state()));
    if (prestigeTab === "chal" ? !E.CHALLENGE_LAYERS.some((l) => l.unlocked(state())) : !LAYER_BY_ID[prestigeTab]?.visible(state())) prestigeTab = "replat";
    const seg =
      visible.map((l) => `<button type="button" data-layer="${l.id}" class="${l.id === prestigeTab ? "on" : ""}">${l.icon} ${l.name}${wouldDouble(l) ? ' <i class="mini-dot"></i>' : ""}</button>`).join("") +
      (chalOpen ? `<button type="button" data-layer="chal" class="${prestigeTab === "chal" ? "on" : ""}">🏁 Challenges</button>` : "") +
      (next ? `<button type="button" disabled title="${esc(next.teaser)}">🔒 ???</button>` : "");
    if ($("prestige-seg").dataset.html !== seg) {
      $("prestige-seg").dataset.html = seg;
      morph($("prestige-seg"), seg);
    }
    if (prestigeTab === "chal") {
      setHtml("prestige-card", `<div class="replat-card"><div class="muted">Challenges are runs under a restriction, in tiers. A tier switches off prestige upgrades and currencies from the layer it unlocks at and above; challenge rewards stay on. Reach the goal and the reward switches on. Each prestige needs ${E.GATE_NEED} completed challenges of the layer below. Rewards last until the next reset of the layer above. Starting one banks your pending Insights and begins a fresh run.</div><div class="muted">Completed: <b>${state().chalDone.length}</b> active · ${fmt(state().chalWins)} all-time</div></div>`);
      setHtml("prestige-shops", renderChallenges());
      return;
    }
    const l = LAYER_BY_ID[prestigeTab];
    const gain = l.pending(state());
    const gate = E.GATE_LAYER[l.id];
    const open = E.gateOpen(state(), l.id);
    const gateNote = gate
      ? `<div class="gate ${open ? "ok" : ""}">${open ? "✅" : "🔒"} Needs ${E.GATE_NEED} completed ${esc(LAYER_BY_ID[gate].name)} challenges: <b>${Math.min(E.gateHave(state(), l.id), E.GATE_NEED)}/${E.GATE_NEED}</b>${open ? "" : ` (🏁 Challenges tab)`}</div>`
      : "";
    const can = E.big(gain).gte(1) && open;
    const card = `<div class="replat-card">
      <div class="muted">${l.cur}: <b>${fmt(l.have(state()))}</b>${l.shops.length ? ` · spendable ${fmt(l.spendable(state()))}` : ""}</div>
      <div class="num">+${fmt(gain)} ${l.icon}</div>
      <div class="muted">${esc(l.progress(state()))}</div>
      <div class="muted">${esc(l.effect(state()))}</div>${gateNote}
      <button class="big ${can ? "affordable" : ""}" type="button" data-prestige="${l.id}" ${can ? "" : "disabled"}>${l.verb}</button></div>`;
    if ($("prestige-card").dataset.html !== card) {
      $("prestige-card").dataset.html = card;
      morph($("prestige-card"), card);
    }
    const shops =
      l.shops.map(renderShop).join("") ||
      `<p class="muted">Axioms are never spent; they make every future universe faster. Big Bangs themselves unlock milestones (you've done ${state().bangs}):</p><ul class="list">${E.BANG_MILESTONES.map((m) => {
        const got = state().bangs >= m.at;
        const text = m.secret && !got ? "Keep going. Something happens." : m.secret ? "The universe has run out of things to measure. The dashboard is still loading." : m.text;
        return `<li class="item ${got ? "owned" : ""}"><div class="ico" aria-hidden="true">${got ? "✅" : "🌀"}</div><div><div class="name">${m.at} Big Bang${m.at === 1 ? "" : "s"}</div><div class="sub">${esc(text)}</div></div><span></span></li>`;
      }).join("")}</ul>${E.canCatalog(state()) ? `<div class="replat-card catalog"><div class="num">🗂️ Catalog Everything</div><div class="muted">The real end. Everything resets, Axioms and Big Bangs included, and you start a New Game+ ×${E.NG_PROD} stronger (production) and ×${E.NG_GAIN} faster (prestige gains) per completion. Achievements, the Data Catalog and lifetime stats stay. Completions so far: ${state().completions}.</div><button class="big affordable" type="button" id="catalog-btn">Catalog Everything</button></div>` : ""}`;
    if ($("prestige-shops").dataset.html !== shops) {
      $("prestige-shops").dataset.html = shops;
      morph($("prestige-shops"), shops);
    }
  }

  const TIER_UNLOCK = { acq: "your first Acquisition", contact: "First Contact", bang: "a Big Bang" };
  // What a tier switches off: its unlock layer and everything above.
  const OFF_NAMES = { replat: "Insights, Architecture, Tech Radar", acq: "Board, Equity", contact: "Xenotech, Xenobytes", bang: "Axioms" };
  const tierOff = (layer) => E.LAYER_ORDER.slice(E.LAYER_ORDER.indexOf(layer)).map((l) => OFF_NAMES[l]).join(", ");

  function renderChallenges() {
    return E.CHALLENGE_LAYERS.map((layer) => {
      if (!layer.unlocked(state())) return `<h3>${esc(layer.name)}</h3><p class="muted">🔒 ${esc(layer.hint)}</p>`;
      const items = E.CHALLENGES.filter((c) => c.layer === layer.id)
        .map((c) => {
          const open = E.challengeUnlocked(state(), c);
          const anyDone = state().chalDone.includes(c.id);
          const activeHere = E.parseTier(state().chal)?.challenge === c;
          const tiers = [];
          for (let t = 1; t <= E.tierCount(c); t++) {
            const key = E.tierKey(c, t);
            const tl = E.parseTier(key).layer;
            // Completed, even while a challenge switches its reward off.
            const done = state().chalDone.includes(key);
            const active = state().chal === key;
            const unlocked = E.tierUnlocked(state(), c, t);
            const best = state().chalBest[key];
            const status = best ? `⏱️ ${fmtDuration(best / 1000)} · ×${E.speedBonus(state(), key).toFixed(2)}${t > 1 ? ` · ×${E.TIER_REWARD}` : ""}${done ? "" : " (beat it again to switch on)"}` : "";
            const lock = t === 1 ? c.reqText : !state().chalEver.includes(E.tierKey(c, t - 1)) ? `Beat tier ${ROMAN[t - 1]} first.` : `Unlocks after ${TIER_UNLOCK[tl]}.`;
            const btn = active
              ? `<button type="button" data-abandon="1">Abandon</button>`
              : unlocked
                ? `<button type="button" data-challenge="${c.id}" data-tier="${t}" ${state().chal ? "disabled" : ""}>${done ? "Retry" : "Start"}</button>`
                : `<button type="button" disabled>🔒</button>`;
            tiers.push(`<div class="tier ${done ? "done" : ""} ${active ? "active" : ""} ${unlocked ? "" : "locked"}"><b>${done ? "✓ " : ""}${ROMAN[t]}</b><span>${unlocked || done ? `goal ${fmt(E.tierGoal(c, t))}` : esc(lock)}</span><span class="muted">${status}</span>${btn}</div>`);
          }
          return `<li class="item chal ${anyDone ? "owned" : ""} ${activeHere ? "active" : ""} ${!open && !anyDone ? "locked" : ""}"><div class="ico" aria-hidden="true">${anyDone ? "🏆" : open ? "🏁" : "🔒"}</div>
            <div><div class="name">${esc(c.name)}</div>
            <div class="sub">⛓ ${esc(c.restriction)}</div><div class="sub reward">🎁 ${esc(c.reward)}${E.tierCount(c) > 1 ? ` Higher tiers: production ×${E.TIER_REWARD} each.` : ""}</div>
            <div class="tiers">${tiers.join("")}</div></div><span></span></li>`;
        })
        .join("");
      return `<h3>${esc(layer.name)}</h3><p class="muted">Rewards last until the ${esc(layer.until)}. Time limit ${fmtDuration(E.CHALLENGE_LIMIT_MS / 1000)} per attempt; the faster you finish, the bigger the speed bonus (up to ×2). Each tier switches off the prestige power of the layer it unlocks at and everything above.</p><ul class="list">${items}</ul>`;
    }).join("");
  }

  function startChallengeNow(c, tier) {
    E.tick(state(), Date.now());
    if (E.startChallenge(state(), c.id, Date.now(), tier)) {
      toast(`🏁 <b>${esc(c.name)} ${ROMAN[tier]}</b> started. Good luck.`);
      afterPurchase();
    }
  }

  function onStartChallenge(id, tier = 1) {
    const c = E.CHALLENGE_BY_ID[id];
    if (prefs.skipChalConfirm) return startChallengeNow(c, tier);
    const layer = E.parseTier(E.tierKey(c, tier)).layer;
    modal(
      `<h2>🏁 ${esc(c.name)} ${ROMAN[tier]}</h2><p>⛓ ${esc(c.restriction)}</p><p>🚫 Switched off: ${esc(tierOff(layer))}.</p><p>Goal: <b>${fmt(E.tierGoal(c, tier))}</b> rows within ${fmtDuration(E.CHALLENGE_LIMIT_MS / 1000)}.</p><p>🎁 ${tier === 1 ? esc(c.reward) : `Production ×${E.TIER_REWARD}`}, plus a speed bonus.</p><p class="muted">Starting banks your pending Insights and begins a fresh run. Stuck? Abandon any time from the banner: the restriction lifts and you keep playing that run, just without the reward.</p>
       ${state().chalEver.length ? `<label class="toggle"><input type="checkbox" id="skip-chal-confirm" /> Don't ask again (Settings → Game turns it back on)</label>` : ""}`,
      [["Cancel"], ["Start challenge", "primary", () => {
        if ($("skip-chal-confirm")?.checked) setPref("skipChalConfirm", true);
        startChallengeNow(c, tier);
      }]],
    );
  }

  function renderChallengeBanner() {
    const t = E.parseTier(state().chal);
    const el = $("chal-banner");
    el.hidden = !t;
    if (!t) return;
    const { challenge: c, tier } = t;
    const goal = E.tierGoal(c, tier);
    const pct = Math.min(100, (state().runRows.max(1).log10() / Math.log10(goal)) * 100);
    const left = Math.max(0, E.CHALLENGE_LIMIT_MS - E.challengeElapsed(state())) / 1000;
    setHtml("chal-banner", `<div class="chal-row"><b>🏁 ${esc(c.name)} ${ROMAN[tier]}</b><span>${fmt(state().runRows)} / ${fmt(goal)}</span><span class="${left < 300 ? "warn" : ""}">⏱️ ${fmtDuration(left)} left</span><button type="button" data-abandon="1">Abandon</button></div><div class="muted">⛓ ${esc(c.restriction)}</div><div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>`);
  }

  return { LAYER_BY_ID, onPrestige, doPrestige, render: renderPrestige, renderChallengeBanner, onStartChallenge, selectLayer: (id) => (prestigeTab = id) };
}
