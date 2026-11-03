// Incident pop-ups: the clickable alerts (backfills, wormholes, phishing tests) and what they do.
// Loaded when the first one is due.

export function createIncidents({ E, state, scene, audio, toast, esc, fmt, $, grantSecret, saveLocal, render }) {
  function spawn() {
    const pool = E.incidentsFor(state());
    const total = pool.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    const inc = pool.find((x) => (r -= x.weight) < 0) ?? pool[0];
    const btn = document.createElement("button");
    btn.className = "incident";
    btn.type = "button";
    btn.textContent = inc.labels ? inc.labels[Math.floor(Math.random() * inc.labels.length)] : inc.label;
    btn.style.left = `${8 + Math.random() * (innerWidth - 220)}px`;
    btn.style.top = `${90 + Math.random() * Math.max(80, innerHeight - 260)}px`;
    const gone = setTimeout(() => {
      btn.remove();
      if (inc.trap) passedPhish();
      if (inc.rescue) lostTable();
    }, 13_000);
    const resolve = () => {
      clearTimeout(gone);
      btn.remove();
      resolveIncident(inc);
    };
    btn.addEventListener("click", resolve);
    // Self-healing pipelines fix incidents; they don't click suspicious links.
    if (E.archOn(state(), "selfheal") && !inc.trap) setTimeout(() => btn.isConnected && resolve(), 3000);
    $("incident-layer").append(btn);
    audio.sfx("incident");
  }

  function lostTable() {
    E.tick(state(), Date.now());
    const lost = state().rows.mul(0.1);
    state().rows = state().rows.sub(lost);
    toast(`💀 <b>Table lost.</b> Nobody restored it in time: −${fmt(lost)} rows. The intern has been promoted to manager.`);
    audio.sfx("deny");
  }

  function passedPhish() {
    state().stats.phishPassed++;
    E.tick(state(), Date.now());
    const amount = E.baseRate(state()).mul(120).add(13);
    const gained = E.bonusRows(state(), amount);
    toast(`✅ <b>Phishing test passed.</b> IT is proud of you${gained.gt(0) ? `: +${fmt(gained)} rows` : ""}.`, "info");
    audio.sfx("achievement");
  }

  function resolveIncident(inc) {
    const now = Date.now();
    E.tick(state(), now);
    scene.shake();
    // A clicked phishing test isn't a resolved incident.
    if (!inc.trap) {
      state().incidents++;
      audio.sfx("resolve");
    }
    if (inc.rescue) {
      state().stats.rescues++;
      const amount = E.baseRate(state()).mul(60).add(13);
      const gained = E.bonusRows(state(), amount);
      toast(`🧯 <b>${inc.title}</b>: ${esc(inc.desc)}${gained.gt(0) ? ` +${fmt(gained)} rows.` : ""}`);
    } else if (inc.trap) {
      state().buffs.push({ kind: "prod", mult: inc.buff.mult, until: now + inc.buff.secs * 1000, name: "Security training" });
      grantSecret("phished");
      toast(`🎣 <b>${inc.title}</b>: you clicked it. Production ×${inc.buff.mult} for ${inc.buff.secs}s while you do the training.`);
      audio.sfx("deny");
    } else if (inc.buff) {
      const secs = inc.buff.secs * (E.archOn(state(), "slo") ? 2 : 1);
      const mult = Math.round(inc.buff.mult * E.incidentMult(state()) * 100) / 100;
      state().buffs.push({ kind: inc.buff.kind, mult, until: now + secs * 1000, name: inc.title });
      toast(`${inc.label.split(" ")[0]} <b>${inc.title}</b>: ×${mult} for ${secs}s${state().chal && mult > 3 ? " (capped at ×3 in a challenge)" : ""}.`, "info");
    } else if (inc.lump) {
      const amount = E.baseRate(state()).mul(900).min(state().rows.mul(E.backfillCap(state()))).add(13);
      const gained = E.bonusRows(state(), amount);
      scene.floatText(gained.gt(0) ? `+${fmt(gained)}` : "no bonus in a challenge", "#ffb547");
      scene.burst(12);
      toast(`${inc.label.split(" ")[0]} <b>${inc.title}</b>${gained.gt(0) ? `: +${fmt(gained)} rows` : ": no bonus rows during a challenge"}.`, "info");
    }
    saveLocal();
    render(true);
  }

  return { spawn };
}
