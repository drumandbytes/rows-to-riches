// Console widgets that unlock as you grow, plus DOM effects (sparks, banners).

const TABLES = ["events", "users", "orders", "clicks", "sessions", "invoices", "telemetry", "dim_customer", "fct_sales", "stg_raw_dump", "page_views", "sensor_readings"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const kw = (s) => `<span class="sql-k">${s}</span>`;
const tbl = (s) => `<span class="sql-t">${s}</span>`;
const num = (s) => `<span class="sql-n">${s}</span>`;

const QUERIES = [
  () => `${kw("INSERT INTO")} ${tbl(pick(TABLES))} ${kw("VALUES")} (${num(Math.floor(Math.random() * 1e5))}, ${num("now()")})`,
  () => `${kw("SELECT")} ${kw("count")}(*) ${kw("FROM")} ${tbl(pick(TABLES))} <span class="sql-c">-- ${pick(["again", "why", "for the board", "still loading"])}</span>`,
  () => `${kw("MERGE INTO")} ${tbl(pick(TABLES))} ${kw("USING")} ${tbl("staging")} ${kw("ON")} id`,
  () => `${kw("CREATE INDEX")} ${kw("CONCURRENTLY")} ${kw("ON")} ${tbl(pick(TABLES))} (created_at)`,
  () => `${kw("VACUUM ANALYZE")} ${tbl(pick(TABLES))}`,
  () => `${kw("COPY")} ${tbl(pick(TABLES))} ${kw("FROM")} <span class="sql-s">'s3://lake/${Math.floor(Math.random() * 999)}.parquet'</span>`,
  () => `${kw("SELECT")} * ${kw("FROM")} ${tbl(pick(TABLES))} ${kw("LIMIT")} ${num(10)} <span class="sql-c">-- just peeking</span>`,
  () => `${kw("UPDATE")} ${tbl(pick(TABLES))} ${kw("SET")} status = <span class="sql-s">'ok'</span> <span class="sql-w">-- no WHERE?!</span>`,
  () => `${kw("ALTER TABLE")} ${tbl(pick(TABLES))} ${kw("ADD COLUMN")} vibes ${kw("TEXT")}`,
  () => `<span class="sql-ok">✓</span> ${tbl(pick(["dag_daily_load", "dbt run", "spark_job_412", "ingest_events"]))} succeeded in ${num((Math.random() * 90).toFixed(1) + "s")}`,
];

export function createQueryLog(el) {
  let timer = 0;
  let active = false;
  function push() {
    const line = document.createElement("div");
    line.className = "q-line";
    line.innerHTML = pick(QUERIES)();
    el.append(line);
    while (el.children.length > 6) el.firstChild.remove();
  }
  function loop() {
    // Faster production → faster log, but always readable.
    const gap = Math.max(350, 2200 - Math.log10(currentRate + 1) * 220);
    timer = setTimeout(() => {
      if (!document.hidden) push();
      loop();
    }, gap);
  }
  let currentRate = 0;
  return {
    setActive(on, rate) {
      currentRate = rate;
      if (on && !active) {
        active = true;
        el.hidden = false;
        push();
        loop();
      } else if (!on && active) {
        active = false;
        el.hidden = true;
        clearTimeout(timer);
      }
    },
  };
}

export function createSparkline(canvas) {
  const samples = [];
  const ctx = canvas.getContext("2d");
  function draw() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const { width: w, height: h } = canvas.getBoundingClientRect();
    if (!w) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (samples.length < 2) return;
    const max = Math.max(...samples) || 1;
    const min = Math.min(...samples);
    const span = max - min || max * 0.1 || 1;
    const x = (i) => (i / 59) * w;
    const y = (v) => h - 4 - ((v - min) / span) * (h - 10);
    const accent = getComputedStyle(canvas).getPropertyValue("--accent").trim();
    ctx.beginPath();
    samples.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineTo(x(samples.length - 1), h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `color-mix(in srgb, ${accent} 35%, transparent)`);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fill();
    const lx = x(samples.length - 1), ly = y(samples.at(-1));
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return {
    sample(v) {
      samples.push(v);
      if (samples.length > 60) samples.shift();
      draw();
    },
  };
}

const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches || ["low", "no-motion", "no-particles"].some((c) => document.body.classList.contains(c));

export function sparks(x, y, hue, n = 14) {
  if (calm()) return;
  for (let k = 0; k < n; k++) {
    const el = document.createElement("i");
    el.className = "spark";
    const a = Math.random() * Math.PI * 2;
    const d = 30 + Math.random() * 60;
    el.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 20}px;--h:${hue + Math.random() * 40}`;
    document.body.append(el);
    setTimeout(() => el.remove(), 750);
  }
}

export function confetti(n = 36) {
  if (calm()) return;
  for (let k = 0; k < n; k++) {
    const el = document.createElement("i");
    el.className = "confetti";
    el.style.cssText = `left:${Math.random() * 100}vw;--h:${Math.random() * 360};--r:${Math.random() * 720 - 360}deg;--d:${1.6 + Math.random() * 1.6}s;--x:${(Math.random() - 0.5) * 120}px`;
    document.body.append(el);
    setTimeout(() => el.remove(), 3400);
  }
}

export function banner(title, sub) {
  const el = document.createElement("div");
  el.className = "banner";
  el.innerHTML = `<div class="banner-in"><small>git push origin</small><b>${title}</b><span>${sub}</span></div>`;
  document.body.append(el);
  confetti();
  setTimeout(() => el.classList.add("out"), 2600);
  setTimeout(() => el.remove(), 3200);
}
