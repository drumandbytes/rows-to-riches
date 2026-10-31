import { fmt as fmtNum } from "./format.js";
// Active play for the mid and late game, as corporate satire: quarterly OKRs graded at an
// all-hands, and stakeholder requests / meeting invites that ask you to choose.
// Rewards are only production or INSERT boosts and rows, which the server's plausibility
// check already budgets for (see maxBuff in economy.js).

const QUARTER_MS = 15 * 60_000; // of online play

// Each OKR kind: when it's on offer, its current value, and how far to push it.
const OKR_KINDS = {
  own: {
    when: (s) => s.prod.some((c) => c > 0),
    setup(s, E, rnd) {
      const i = s.prod.findLastIndex((c) => c > 0);
      const n = 10 + Math.floor(rnd() * 3) * 5;
      return { i, add: n, label: `Scale ingest: own ${n} more ${E.PRODUCERS[i].plural}` };
    },
    value: (s, _E, x) => s.prod[x.i],
  },
  clicks: { when: () => true, setup: (_s, _E, rnd) => { const n = 200 + Math.floor(rnd() * 4) * 100; return { add: n, label: `Hands-on leadership: INSERT ${n} times` }; }, value: (s) => s.clicks },
  incidents: { when: () => true, setup: (_s, _E, rnd) => { const n = 2 + Math.floor(rnd() * 2); return { add: n, label: `Operational excellence: resolve ${n} incidents` }; }, value: (s) => s.incidents },
  // Tracked as log10(rows/s), so base and target stay plain numbers however big the rate gets.
  rate: {
    when: (s, E) => E.baseRate(s).gt(0),
    setup: (s, E, rnd) => {
      const k = 3 + Math.floor(rnd() * 3);
      return { abs: E.baseRate(s).log10() + Math.log10(k), label: `Grow throughput ${k}× (to ${fmtNum(E.baseRate(s).mul(k))} rows/s)` };
    },
    value: (s, E) => E.baseRate(s).max(1e-300).log10(),
  },
  upgrades: { when: () => true, setup: (_s, _E, rnd) => { const n = 3 + Math.floor(rnd() * 3); return { add: n, label: `Ship ${n} upgrades (any upgrades; nobody checks)` }; }, value: (s) => s.stats.upgBought },
  columns: { when: (s, E) => !E.rule(s).noColumns, setup: () => ({ add: 1, label: "Data modelling: add a column to the schema" }), value: (s) => s.stats.colsBought },
  phish: { when: (s) => s.stats.phishPassed + s.incidents > 3, setup: () => ({ add: 1, label: "Security awareness: pass a phishing test" }), value: (s) => s.stats.phishPassed },
  momentum: { when: () => true, setup: () => ({ add: 20, label: "Deep work: 20s of focus (momentum above 80%)" }), value: (s) => s.stats.momentumSecs },
  replat: { when: (s) => s.replat > 0, setup: () => ({ add: 1, label: "Modernize the stack: re-platform once" }), value: (s) => s.replat },
  chal: { when: (s, E) => E.CHALLENGES.some((c) => !E.won(s, c.id) && E.challengeUnlocked(s, c)), setup: () => ({ add: 1, label: "Stretch goal: complete a challenge" }), value: (s) => s.chalWins },
  meetings: { when: (s) => s.stats.requests > 0, setup: () => ({ add: 2, label: "Alignment: attend 2 meetings" }), value: (s) => s.stats.meetings },
};

const ANNOUNCEMENTS = [
  "We're pivoting to AI. We were always an AI company, actually.",
  "Return to office is now four days a week. For culture.",
  "Great news: we're a family! Families, as you know, have performance reviews.",
  "Our new value is 'radical ownership'. You now own the on-call rotation.",
  "We've replaced the coffee machine with a dashboard showing coffee consumption.",
  "Headcount is frozen, but the snacks budget is flexible. Within reason.",
  "The org chart has been flattened. Everyone now reports to the same three VPs.",
  "We're excited to announce our 14th 'single source of truth'.",
  "Q&A will be taken in the Slack thread, which is read-only.",
  "Our data strategy for next year: more data. Questions?",
  "To improve velocity, all meetings are now 25 minutes. They will run 40.",
  "We are not doing layoffs. We are 'right-sizing for impact'.",
  "Congratulations to the data team, who we will now call 'the AI team'.",
  "Hybrid work means you can choose which four days you come in.",
];

const RATINGS = [
  { min: 3, name: "Exceeds expectations", text: "Your manager says the word \"impact\" six times. A real bonus this time.", reward: { prod: [3, 300] } },
  { min: 2, name: "Meets expectations", text: "Solid work. Here's a mug.", reward: { rows: 300 } },
  { min: 1, name: "Partially meets expectations", text: "Let's set up a recurring 1:1 to discuss growth areas.", reward: {} },
  { min: 0, name: "Needs improvement", text: "You've been placed on a Performance Improvement Plan. Its first step is attending more meetings.", reward: {} },
];

// Requests and invites. Each option: label, what it does in words, and its effect:
//   prod/click: [multiplier, seconds]; rows: seconds of production (negative = a share
//   of the bank, as a fraction); momentum: fill the bar; meeting: counts as a meeting;
//   gamble: [chance, effectIfWin, effectIfLose].
const REQUESTS = [
  { from: "CEO", icon: "👔", title: "Can we get a dashboard by Friday?", text: "It's for the board. Nothing fancy. Just everything.",
    a: { label: "Ship it hacky", desc: "+5 min of rows now, production ×0.8 for 2 min (tech debt)", fx: { rows: 300, prod: [0.8, 120] } },
    b: { label: "Push back politely", desc: "INSERT ×5 for 60s and full momentum", fx: { click: [5, 60], momentum: 1 } } },
  { from: "Calendar", icon: "📅", title: "Invite: Quick sync about the sync (60 min)", text: "Agenda: TBD. Optional: no.", meeting: true,
    a: { label: "Accept", desc: "Production ×0.7 for 60s, counts as a meeting", fx: { prod: [0.7, 60], meeting: 1 } },
    b: { label: "Decline: could've been an email", desc: "Full momentum", fx: { momentum: 1 } } },
  { from: "Calendar", icon: "📅", title: "Invite: Data Strategy 2030 offsite (all day)", text: "There will be a vision board. And sandwiches.", meeting: true,
    a: { label: "Attend", desc: "Production ×0.5 for 90s, then the vision pays off: +10 min of rows", fx: { prod: [0.5, 90], rows: 600, meeting: 1 } },
    b: { label: "Send a deck instead", desc: "+2 min of rows", fx: { rows: 120 } } },
  { from: "Finance", icon: "💸", title: "Cut cloud spend by 30%", text: "We noticed a line item called 'compute'. What is it?",
    a: { label: "Turn off the 'unused' clusters", desc: "+8 min of rows saved now, production ×0.7 for 90s (they were used)", fx: { rows: 480, prod: [0.7, 90] } },
    b: { label: "Explain egress costs (1 h meeting)", desc: "Counts as a meeting, production ×1.5 for 60s afterwards", fx: { meeting: 1, prod: [1.5, 60] } } },
  { from: "Marketing", icon: "📣", title: "Can the dashboard be real-time?", text: "Like, really real-time. Live. Instant. Today.",
    a: { label: "Build proper streaming", desc: "Production ×3 for 30s", fx: { prod: [3, 30] } },
    b: { label: "Refresh every 5 min and call it real-time", desc: "+3 min of rows", fx: { rows: 180 } } },
  { from: "Legal", icon: "⚖️", title: "GDPR deletion request", text: "A user wants all their data deleted. All of it. Including the backups.",
    a: { label: "Delete it everywhere, properly", desc: "Costs 2% of your bank, but you sleep well", fx: { rows: -0.02, momentum: 1 } },
    b: { label: "Delete it from prod only", desc: "70%: nothing happens. 30%: the regulator finds the backups (−15% bank)", fx: { gamble: [0.7, {}, { rows: -0.15 }] } } },
  { from: "Slack", icon: "💬", title: "\"hey, quick question?\"", text: "(It is never a quick question.)",
    a: { label: "Answer now", desc: "INSERT ×10 for 30s while you context-switch", fx: { click: [10, 30] } },
    b: { label: "Mute the channel", desc: "Focus time: production ×1.3 for 60s", fx: { prod: [1.3, 60] } } },
  { from: "Snowfake", icon: "❄️", title: "Vendor demo: 30 minutes?", text: "We'll show you our new AI-powered Data Cloud Lakehouse Fabric.", meeting: true,
    a: { label: "Take the demo", desc: "Counts as a meeting, free trial credits: +5 min of rows", fx: { meeting: 1, rows: 300 } },
    b: { label: "Ghost them", desc: "Nothing. They'll email again tomorrow.", fx: {} } },
  { from: "Intern", icon: "🧑‍💻", title: "Can you mentor me?", text: "I want to learn how the pipelines work. All of them.",
    a: { label: "Mentor them", desc: "INSERT ×10 for 60s, production ×0.9 for 60s", fx: { click: [10, 60], prod: [0.9, 60] } },
    b: { label: "Send the docs link", desc: "Nothing (the link 404s)", fx: {} } },
  { from: "HR", icon: "🔀", title: "Reorg: your team now reports to Marketing", text: "Effective immediately. Synergies are expected.",
    a: { label: "Embrace the synergy", desc: "50%: production ×3 for 60s. 50%: ×0.5 for 60s.", fx: { gamble: [0.5, { prod: [3, 60] }, { prod: [0.5, 60] }] } },
    b: { label: "Update your LinkedIn", desc: "Full momentum", fx: { momentum: 1 } } },
  { from: "The Board", icon: "🏛️", title: "What's our AI strategy?", text: "Every other company has one. Ours should be bigger.",
    a: { label: "Add 'AI' to everything", desc: "+10 min of rows from the hype", fx: { rows: 600 } },
    b: { label: "Explain that it's a regression", desc: "Production ×1.5 for 90s (credibility)", fx: { prod: [1.5, 90] } } },
  { from: "Calendar", icon: "📅", title: "Invite: All-hands rehearsal", text: "We need people in the room so the CEO can practise the jokes.", meeting: true,
    a: { label: "Attend and laugh on cue", desc: "Counts as a meeting, production ×0.8 for 60s", fx: { meeting: 1, prod: [0.8, 60] } },
    b: { label: "Decline", desc: "Full momentum", fx: { momentum: 1 } } },
  { from: "Engineering", icon: "🛠️", title: "Hackathon this weekend!", text: "Pizza provided. Weekend not provided back.",
    a: { label: "Join", desc: "INSERT ×20 for 30s", fx: { click: [20, 30] } },
    b: { label: "Touch grass", desc: "Production ×1.2 for 120s (you come back rested)", fx: { prod: [1.2, 120] } } },
  { from: "Data Governance", icon: "📋", title: "Please fill in the data catalog", text: "Every table needs an owner, a description and a vibe.",
    a: { label: "Document everything", desc: "Production ×0.8 for 60s, then +6 min of rows", fx: { prod: [0.8, 60], rows: 360 } },
    b: { label: "Write 'TODO' in every field", desc: "+1 min of rows", fx: { rows: 60 } } },
];

export function createActive(ctx) {
  const { E, fmt, esc, toast, sfx, modal, confetti, $ } = ctx;
  const rnd = Math.random;
  let request = null; // { r, until }
  let nextRequestAt = Date.now() + 120_000;
  let hiddenSince = 0;

  const S = () => ctx.state();
  const okrUnlocked = (s) => s.replat > 0 || s.acq + s.contact + s.bangs > 0;
  const requestsUnlocked = (s) => s.replat >= 3 || s.acq + s.contact + s.bangs > 0;

  function buff(s, kind, mult, secs, name) {
    const now = Date.now();
    // Same-named buffs refresh instead of stacking, which keeps within the server's budget.
    s.buffs = s.buffs.filter((b) => b.name !== name);
    s.buffs.push({ kind, mult, until: now + secs * 1000, name });
  }

  function apply(s, fx, name) {
    if (fx.gamble) {
      const [chance, win, lose] = fx.gamble;
      const won = rnd() < chance;
      apply(s, won ? win : lose, name);
      return won ? "It worked out." : "It did not work out.";
    }
    if (fx.rows > 0) E.earn(s, E.baseRate(s).mul(fx.rows).add(13));
    if (fx.rows < 0) s.rows = s.rows.mul(1 + fx.rows);
    if (fx.prod) buff(s, "prod", fx.prod[0], fx.prod[1], name);
    if (fx.click) buff(s, "click", fx.click[0], fx.click[1], `${name} (INSERT)`);
    if (fx.momentum) s.momentum = 1;
    if (fx.meeting) s.stats.meetings += fx.meeting;
    return "";
  }

  // ---- OKRs ------------------------------------------------------------------------

  function newQuarter(s) {
    const kinds = Object.entries(OKR_KINDS).filter(([, k]) => k.when(s, E)).sort(() => rnd() - 0.5).slice(0, 3);
    const items = kinds.map(([kind, k]) => {
      const x = k.setup(s, E, rnd);
      const base = k.value(s, E, x);
      const target = x.abs ?? base + x.add;
      return { kind, label: x.label, base, target, i: x.i, done: false };
    });
    s.okr = { quarter: (s.okr?.quarter ?? s.stats.quarters) + 1, endsAt: s.stats.onlineMs + QUARTER_MS, items };
  }

  function quarterName(q) {
    return `Q${((q - 1) % 4) + 1} FY${2027 + Math.floor((q - 1) / 4)}`;
  }

  function progress(s, item) {
    const k = OKR_KINDS[item.kind];
    const x = { i: item.i ?? s.prod.findLastIndex((c) => c > 0) };
    if (!k) return 0;
    const v = k.value(s, E, x);
    return item.target > item.base ? Math.min(1, Math.max(0, (v - item.base) / (item.target - item.base))) : v >= item.target ? 1 : 0;
  }

  function allHands(s) {
    const hit = s.okr.items.filter((x) => x.done).length;
    const rating = RATINGS.find((r) => hit >= r.min);
    const lines = [...ANNOUNCEMENTS].sort(() => rnd() - 0.5).slice(0, 2);
    apply(s, rating.reward.prod ? { prod: rating.reward.prod } : rating.reward, "All-hands bonus");
    s.stats.quarters++;
    if (hit === 3) confetti(80);
    ctx.track?.("quarter", { detail: `okrs_${hit}` });
    sfx(hit >= 2 ? "achievement" : "deny");
    const rewardText = rating.reward.prod ? `Bonus: production ×${rating.reward.prod[0]} for ${rating.reward.prod[1] / 60} minutes.` : rating.reward.rows ? `Bonus: ${rating.reward.rows / 60} minutes of rows.` : "No bonus this quarter.";
    modal(
      `<h2>📣 All-hands: ${quarterName(s.okr.quarter)} review</h2>
       <ul class="okr-review">${s.okr.items.map((x) => `<li>${x.done ? "✅" : "❌"} ${esc(x.label)}</li>`).join("")}</ul>
       <p>Performance rating: <b>${rating.name}</b>. ${esc(rating.text)}</p><p class="muted">${rewardText}</p>
       <h3>Announcements</h3>${lines.map((l) => `<p>📢 ${esc(l)}</p>`).join("")}`,
      [["Back to work", "primary"]],
    );
    newQuarter(s);
  }

  function tickOkrs(s) {
    if (!okrUnlocked(s)) return;
    if (!s.okr) newQuarter(s);
    for (const item of s.okr.items) {
      if (item.done || progress(s, item) < 1) continue;
      item.done = true;
      s.stats.okrs++;
      buff(s, "prod", 2, 180, "OKR bonus");
      toast(`🎯 <b>Key result achieved:</b> ${esc(item.label)}. Production ×2 for 3 min.`);
      sfx("upgrade");
    }
    // The review waits for a moment when no other dialog is open.
    if (s.stats.onlineMs >= s.okr.endsAt && !$("modal").open && !document.hidden) allHands(s);
  }

  function renderOkrs(s) {
    const el = $("okr-strip");
    el.hidden = !okrUnlocked(s) || !s.okr;
    if (el.hidden) return;
    const left = Math.max(0, (s.okr.endsAt - s.stats.onlineMs) / 1000);
    const mm = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
    const items = s.okr.items
      .map((x) => {
        const p = progress(s, x);
        return `<li class="${x.done ? "done" : ""}"><span>${x.done ? "✅" : "🎯"}</span><span class="okr-label">${esc(x.label)}</span><span class="okr-bar"><i style="width:${(p * 100).toFixed(0)}%"></i></span></li>`;
      })
      .join("");
    const done = s.okr.items.filter((x) => x.done).length;
    ctx.setHtml("okr-strip", `<button type="button" class="okr-head" data-okr-toggle="1"><b>🎯 OKRs · ${quarterName(s.okr.quarter)} · ${done}/3</b><span>all-hands in ${mm}</span></button><ul>${items}</ul>`);
  }

  // ---- requests and meetings ---------------------------------------------------

  function tickRequests(s) {
    const now = Date.now();
    if (document.hidden) {
      hiddenSince ||= now;
      return;
    }
    // Time spent away doesn't count towards the next request.
    if (hiddenSince) {
      nextRequestAt += now - hiddenSince;
      hiddenSince = 0;
    }
    if (request && now > request.until) {
      toast(`⌛ <b>${esc(request.r.from)}</b> stopped waiting. No reply is also a reply.`, "info");
      request = null;
      nextRequestAt = now + (150 + rnd() * 180) * 1000;
    }
    if (!request && requestsUnlocked(s) && now >= nextRequestAt && !$("modal").open) {
      request = { r: REQUESTS[Math.floor(rnd() * REQUESTS.length)], until: now + 30_000 };
      sfx(request.r.meeting ? "mail" : "incident");
    }
  }

  function renderRequest() {
    const el = $("request-card");
    el.hidden = !request;
    if (!request) return;
    const { r } = request;
    const secs = Math.max(0, Math.ceil((request.until - Date.now()) / 1000));
    ctx.setHtml(
      "request-card",
      `<div class="req-head"><span>${r.icon} <b>${esc(r.from)}</b></span><span class="muted">${secs}s</span></div>
       <div class="req-title">${esc(r.title)}</div><div class="muted">${esc(r.text)}</div>
       <div class="req-options">${["a", "b"].map((k) => `<button type="button" data-request="${k}"><b>${esc(r[k].label)}</b><small>${esc(r[k].desc)}</small></button>`).join("")}</div>`,
    );
  }

  function answer(key) {
    if (!request) return;
    const s = S();
    E.tick(s, Date.now());
    const opt = request.r[key];
    const outcome = apply(s, opt.fx, request.r.from);
    s.stats.requests++;
    toast(`${request.r.icon} <b>${esc(opt.label)}</b>. ${esc(outcome)}`);
    sfx("buy");
    request = null;
    nextRequestAt = Date.now() + (150 + rnd() * 180) * 1000;
    ctx.changed();
  }

  return {
    tick() {
      const s = S();
      if (s.momentum >= 0.8) s.stats.momentumSecs += 0.2; // the loop runs every 200 ms
      tickOkrs(s);
      tickRequests(s);
    },
    render() {
      renderOkrs(S());
      renderRequest();
    },
    answer,
  };
}
