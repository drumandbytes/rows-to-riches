// The living scene: every owned Data Source stands on stage and sends packets down a
// pipe into the storage sink. Backdrop follows the environment. Cosmetic only.

import { PRODUCERS } from "./economy.js";

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const SINKS = ["📄", "📋", "🗂️", "🗄️", "🖥️", "🏢", "🗺️", "🌍", "☀️", "🌌", "🫧", "🪞", "🫠"];
// Things that turn out to be rows, for the finale backdrop.
const FLOATIES = ["🐈", "☀️", "🍝", "👵", "🌧️", "❤️", "🦆", "🎻", "🌋", "🧦", "🐋", "🍕"];
export const producerHue = (i) => (i * 360) / PRODUCERS.length + 20;

// Emoji are slow to rasterize, so each (glyph, size) is drawn once to an offscreen canvas.
const spriteCache = new Map();
function sprite(glyph, size, dpr) {
  const key = `${glyph}|${size}|${dpr}`;
  let c = spriteCache.get(key);
  if (!c) {
    c = document.createElement("canvas");
    const px = Math.ceil(size * 1.3 * dpr);
    c.width = c.height = px;
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${size}px ${EMOJI_FONT}`;
    g.fillText(glyph, (size * 1.3) / 2, (size * 1.3) / 2 + size * 0.05);
    // The emoji font can still be loading on the first frames, which draws nothing.
    // Only cache sprites that actually have pixels, so blank ones are retried.
    const alpha = g.getImageData(0, 0, px, px).data;
    for (let k = 3; k < alpha.length; k += 16) {
      if (alpha[k]) {
        spriteCache.set(key, c);
        break;
      }
    }
  }
  return c;
}

export function createScene(canvas) {
  const ctx = canvas.getContext("2d");
  let reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let allowShake = true;
  let mode = "animated";
  let w = 0, h = 0, dpr = 1;
  let sceneName = "room", hue = 150;
  const floaties = FLOATIES.map((e, k) => ({ e, id: 1000 + k * 37, x: Math.random() * 600, y: 20 + Math.random() * 150, v: 0.5 + Math.random(), p: Math.random() * 6 }));
  let sinkIdx = 0, sinkProgress = 0, sinkPulse = 0;
  let stations = [];
  let counts = PRODUCERS.map(() => 0);
  let shares = PRODUCERS.map(() => 0);
  let packets = [];
  let floaters = [];
  let stars = [];
  let shake = 0;
  let raf = 0;
  let low = false;
  let skip = false;
  let last = performance.now();
  let time = 0;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    stars = Array.from({ length: 70 }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.4 + 0.3, p: Math.random() * 6 }));
    layout();
  }

  const sinkPos = () => ({ x: w - Math.min(70, w * 0.16), y: h * 0.52 });

  function layout() {
    const owned = PRODUCERS.filter((p) => counts[p.i] > 0);
    const areaW = w - Math.min(150, w * 0.32);
    const n = Math.max(1, owned.length);
    const cols = Math.min(n, Math.max(2, Math.ceil(Math.sqrt(n * (areaW / h) * 1.1))));
    const rows = Math.ceil(n / cols);
    const cellW = areaW / cols;
    const cellH = (h - 16) / rows;
    const size = Math.max(18, Math.min(46, cellH * 0.5, cellW * 0.42));
    const prev = new Map(stations.map((s) => [s.i, s]));
    stations = owned.map((p, k) => {
      const col = k % cols;
      const row = Math.floor(k / cols);
      const old = prev.get(p.i);
      return {
        i: p.i,
        icon: p.icon,
        x: cellW * (col + 0.5) + 8,
        y: 12 + cellH * (row + 0.5),
        size,
        phase: old?.phase ?? Math.random() * 6,
        born: old?.born ?? time,
        carry: old?.carry ?? 0,
        pop: old?.pop ?? 0,
      };
    });
  }

  function spawn(fromX, fromY, hueP, big = false) {
    if (packets.length > (low ? 40 : 160)) return;
    const s = sinkPos();
    packets.push({
      x0: fromX, y0: fromY,
      cx: (fromX + s.x) / 2 + (Math.random() - 0.5) * 40,
      cy: Math.min(fromY, s.y) - 30 - Math.random() * 40,
      t: 0,
      speed: 0.7 + Math.random() * 0.5,
      hue: hueP,
      size: big ? 6 : 3.5 + Math.random() * 1.5,
    });
  }

  function drawBackdrop() {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (sceneName === "room" || sceneName === "office") {
      // cosy room → office: warm wall, wooden desk
      const room = sceneName === "room";
      g.addColorStop(0, `hsl(${room ? 30 : 210} 12% ${room ? 15 : 18}%)`);
      g.addColorStop(1, "hsl(220 10% 10%)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      if (room) {
        const lamp = ctx.createRadialGradient(w * 0.2, h * 0.1, 0, w * 0.2, h * 0.1, h * 1.1);
        lamp.addColorStop(0, "rgba(255,200,120,.28)");
        lamp.addColorStop(1, "rgba(255,200,120,0)");
        ctx.fillStyle = lamp;
        ctx.fillRect(0, 0, w, h);
      } else {
        // office windows with a slow day/night tint
        ctx.fillStyle = `hsla(${205 + Math.sin(time / 20) * 10} 30% 60% / .08)`;
        for (let x = 20; x < w - 40; x += 90) ctx.fillRect(x, 14, 60, h * 0.35);
      }
      ctx.fillStyle = "hsl(28 35% 22%)";
      ctx.fillRect(0, h - 14, w, 14);
      ctx.fillStyle = "hsl(28 35% 30%)";
      ctx.fillRect(0, h - 14, w, 3);
    } else if (sceneName === "servers" || sceneName === "quantum") {
      // server room: rows of racks with blinking LEDs; quantum adds interference waves
      const q = sceneName === "quantum";
      g.addColorStop(0, q ? "hsl(255 18% 10%)" : "hsl(220 10% 10%)");
      g.addColorStop(1, "hsl(220 10% 7%)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let x = 6; x < w; x += 34) {
        ctx.fillStyle = "hsl(220 8% 15%)";
        ctx.fillRect(x, 8, 26, h - 20);
        for (let y = 16; y < h - 16; y += 9) {
          const on = Math.sin(time * 3 + x * 0.7 + y) > 0.6;
          ctx.fillStyle = on ? `hsl(${q ? ((x + y) % 2 ? 255 : 190) : (x + y) % 3 ? 130 : 38} 60% 60%)` : "hsl(220 8% 22%)";
          ctx.fillRect(x + 4, y, 3, 2);
          ctx.fillRect(x + 9, y, 12, 2);
        }
      }
      ctx.fillStyle = "rgba(0,0,0,.45)";
      ctx.fillRect(0, 0, w, h);
      if (q) {
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 3; k++) {
          ctx.strokeStyle = `hsla(${255 - k * 30} 60% 70% / .25)`;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 6) {
            const y = h * (0.3 + k * 0.2) + Math.sin(x / (30 + k * 12) + time * (1 + k * 0.4)) * 10 * Math.sin(time * 0.5 + k);
            x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke();
        }
      }
    } else if (sceneName === "planet") {
      g.addColorStop(0, "hsl(220 25% 7%)");
      g.addColorStop(1, "hsl(210 30% 16%)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      drawStars(0.5);
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 1.9, w * 1.2, h * 1.15, 0, 0, Math.PI * 2);
      ctx.fillStyle = "hsl(150 25% 24%)";
      ctx.fill();
      ctx.strokeStyle = "hsla(200 60% 70% / .35)";
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (sceneName === "everything") {
      // The finale: a soft pastel sky full of things that are now rows.
      g.addColorStop(0, `hsl(${(time * 6) % 360} 35% 30%)`);
      g.addColorStop(1, `hsl(${(time * 6 + 120) % 360} 35% 18%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.font = `10px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textAlign = "center";
      for (const f of floaties) {
        const x = (f.x + time * f.v * 12) % (w + 40) - 20;
        const y = f.y + Math.sin(time + f.p) * 6;
        const img = sprite(f.e, 20, dpr);
        ctx.globalAlpha = 0.75;
        ctx.drawImage(img, x - 13, y - 13, 26, 26);
        ctx.fillStyle = "rgba(255,255,255,.6)";
        ctx.fillText(`id=${f.id}`, x, y + 20);
      }
      ctx.globalAlpha = 1;
    } else {
      // space; "alien" gets a green tint and the odd flying saucer
      const alien = sceneName === "alien";
      g.addColorStop(0, alien ? "hsl(150 25% 5%)" : "hsl(225 20% 5%)");
      g.addColorStop(1, alien ? "hsl(120 25% 10%)" : "hsl(225 20% 10%)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const neb = ctx.createRadialGradient(w * 0.7, h * 0.3, 0, w * 0.7, h * 0.3, w * 0.6);
      neb.addColorStop(0, `hsla(${hue} 40% 50% / .15)`);
      neb.addColorStop(1, "transparent");
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, w, h);
      drawStars(1);
      if (alien) {
        const x = ((time * 25) % (w + 80)) - 40;
        const img = sprite("🛸", 22, dpr);
        ctx.drawImage(img, x - 14, 18 + Math.sin(time * 2) * 6, 28, 28);
      }
    }
  }

  function drawStars(alpha) {
    for (const s of stars) {
      ctx.globalAlpha = alpha * (0.4 + 0.6 * Math.abs(Math.sin(time * 1.2 + s.p)));
      ctx.fillStyle = "#fff";
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  function drawStation(s) {
    const n = counts[s.i];
    const appear = Math.min(1, (time - s.born) * 3);
    const bob = reduceMotion ? 0 : Math.sin(time * 2.4 + s.phase) * 2.5;
    const scale = appear * (1 + s.pop * 0.35);
    // A crowd behind the main sprite hints at how many you own.
    const crowd = low ? 0 : Math.min(4, Math.floor(Math.log2(n)));
    for (let k = crowd; k >= 1; k--) {
      const sz = s.size * 0.6;
      const img = sprite(s.icon, Math.round(sz), dpr);
      ctx.globalAlpha = 0.55 * appear;
      const ox = s.x + (k % 2 ? 1 : -1) * (s.size * 0.42 + k * 3);
      const oy = s.y - s.size * 0.25 + Math.sin(time * 2 + s.phase + k) * 1.5;
      ctx.drawImage(img, ox - (sz * 1.3) / 2, oy - (sz * 1.3) / 2, sz * 1.3, sz * 1.3);
    }
    ctx.globalAlpha = 1;
    // glow pad
    const pad = ctx.createRadialGradient(s.x, s.y + s.size * 0.45, 0, s.x, s.y + s.size * 0.45, s.size * 0.8);
    pad.addColorStop(0, `hsla(${producerHue(s.i)} 45% 55% / ${0.18 + s.pop * 0.35})`);
    pad.addColorStop(1, "transparent");
    ctx.fillStyle = pad;
    ctx.fillRect(s.x - s.size, s.y, s.size * 2, s.size);
    const sz = s.size * scale;
    const img = sprite(s.icon, Math.round(s.size), dpr);
    ctx.drawImage(img, s.x - (sz * 1.3) / 2, s.y + bob - (sz * 1.3) / 2, sz * 1.3, sz * 1.3);
    ctx.font = `600 ${Math.max(9, s.size * 0.28)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.fillStyle = `hsl(${producerHue(s.i)} 40% 75%)`;
    ctx.fillText(`×${n}`, s.x, s.y + s.size * 0.85);
  }

  function drawSink() {
    const { x, y } = sinkPos();
    const size = Math.min(64, h * 0.32) * (1 + sinkPulse * 0.18);
    const r = Math.min(64, h * 0.32) * 0.85;
    // progress ring to the next storage unit
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `hsl(${hue} 50% 55%)`;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sinkProgress);
    ctx.stroke();
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
    glow.addColorStop(0, `hsla(${hue} 50% 55% / ${0.08 + sinkPulse * 0.25})`);
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
    const img = sprite(SINKS[sinkIdx] ?? "🌌", Math.round(Math.min(64, h * 0.32)), dpr);
    ctx.drawImage(img, x - (size * 1.3) / 2, y - (size * 1.3) / 2, size * 1.3, size * 1.3);
  }

  function frame(t) {
    // Low quality draws at half the frame rate.
    skip = low && !skip;
    if (skip) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    time += dt;
    const sp = sinkPos();
    // emit packets from stations in proportion to their share of production
    for (const s of stations) {
      s.pop = Math.max(0, s.pop - dt * 3);
      s.carry += dt * (0.4 + shares[s.i] * 9 + Math.min(2, Math.log10(counts[s.i] + 1)));
      while (s.carry >= 1) {
        s.carry -= 1;
        spawn(s.x, s.y, producerHue(s.i));
      }
    }
    sinkPulse = Math.max(0, sinkPulse - dt * 2.5);
    shake = Math.max(0, shake - dt * 3);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 6, (Math.random() - 0.5) * shake * 6);
    drawBackdrop();

    // packets with a short trail
    packets = packets.filter((p) => {
      p.t += dt * p.speed;
      const k = Math.min(1, p.t);
      const at = (u) => {
        const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
        return [a * p.x0 + b * p.cx + c * sp.x, a * p.y0 + b * p.cy + c * sp.y];
      };
      for (let j = 3; j >= 0; j--) {
        const u = Math.max(0, k - j * 0.035);
        const [x, y] = at(u);
        ctx.globalAlpha = 1 - j * 0.22;
        ctx.fillStyle = `hsl(${p.hue} 55% ${62 + j * 6}%)`;
        const s = p.size * (1 - j * 0.15);
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      if (k >= 1) sinkPulse = Math.min(1, sinkPulse + 0.08);
      return k < 1;
    });

    for (const s of stations) drawStation(s);
    if (!stations.length) {
      ctx.font = `13px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.fillText("just you and a CSV.", 16, h / 2);
      ctx.fillText("press INSERT ↓", 16, h / 2 + 18);
    }
    drawSink();

    floaters = floaters.filter((f) => {
      f.t += dt;
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
      ctx.font = `700 13px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.t * 30);
      ctx.globalAlpha = 1;
      return f.t < 1.2;
    });

    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  document.addEventListener("visibilitychange", () => (document.hidden || mode !== "animated" ? stop() : start()));
  new ResizeObserver(resize).observe(canvas);
  resize();
  start();

  return {
    update({ prod, rates, env, sink, progress }) {
      const total = rates.reduce((a, b) => a + b, 0) || 1;
      shares = rates.map((r) => r / total);
      hue = env.hue;
      sceneName = env.scene;
      sinkIdx = sink;
      sinkProgress = progress;
      const changed = prod.some((c, i) => (c > 0) !== (counts[i] > 0));
      const grew = prod.map((c, i) => c > counts[i]);
      counts = prod.slice();
      if (changed) layout();
      for (const s of stations) if (grew[s.i]) s.pop = 1;
    },
    burst(n = 3) {
      for (let k = 0; k < n; k++) spawn(w * (0.35 + Math.random() * 0.3), h - 4, hue + 40, true);
    },
    floatText(text, color = "#fff") {
      const sp = sinkPos();
      floaters.push({ text, x: sp.x, y: sp.y - 40, t: 0, color });
    },
    /** reduced: no bobbing or shaking; mode: "animated", "paused" (one still frame) or "hidden". */
    setMotion(opts) {
      reduceMotion = opts.reduced || matchMedia("(prefers-reduced-motion: reduce)").matches;
      allowShake = opts.shake;
      mode = opts.mode;
      if (mode === "animated") start();
      else {
        stop();
        if (mode === "paused") requestAnimationFrame(() => frame(performance.now()) || stop());
      }
    },
    setQuality(q) {
      low = q === "low";
    },
    shake() {
      if (!reduceMotion && allowShake) shake = 1;
    },
  };
}
