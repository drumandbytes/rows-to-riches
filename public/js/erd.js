// The ever-growing ERD in the Schema tab: raw → staging → intermediate → marts, built from
// what you own. Pure SVG string; cosmetic only.

import { PRODUCERS, UPGRADES, columnName, alienTypeFor } from "./economy.js";
import { producerHue } from "./scene.js";

const W = 200; // table width: fits the longest column name next to its type
const ROW = 15;
const HEAD = 22;
const GAP_Y = 14;
const COL_X = [10, 232, 454, 690, 926];
const LAYER_LABELS = ["raw (Fivetrain / Airbite)", "staging (dbd)", "intermediate (dbd)", "marts", "dimensions"];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function tablesFor(s) {
  const tables = [];
  const edges = [];
  const upgCount = (i) => s.upg.filter((id) => UPGRADES.find((u) => u.id === id)?.target === i && id.indexOf("syn_") !== 0).length;
  const owned = PRODUCERS.filter((p) => s.prod[p.i] > 0);
  for (const p of owned) {
    const syncer = p.i % 2 ? "airbite" : "fivetrain";
    tables.push({ id: `raw_${p.id}`, layer: 0, name: `raw.${p.id}`, hue: producerHue(p.i), cols: [["payload", "JSONB"], [`_${syncer}_synced_at`, "TIMESTAMP"]] });
    const n = upgCount(p.i);
    if (n >= 1) {
      tables.push({ id: `stg_${p.id}`, layer: 1, name: `stg_${p.id}`, hue: producerHue(p.i), cols: [[`${p.id}_id`, "BIGINT"], ["loaded_at", "TIMESTAMP"], ...(n >= 2 ? [["is_valid", "BOOLEAN"]] : [])] });
      edges.push([`raw_${p.id}`, `stg_${p.id}`]);
    }
    if (n >= 3) {
      tables.push({ id: `int_${p.id}`, layer: 2, name: `int_${p.id}_enriched`, hue: producerHue(p.i), cols: [[`${p.id}_id`, "BIGINT"], ["rows_per_s", "NUMERIC"], ...(n >= 6 ? [["vibes", "TEXT"]] : [])] });
      edges.push([`stg_${p.id}`, `int_${p.id}`]);
      edges.push([`int_${p.id}`, "fct_rows"]);
    } else if (n >= 1) {
      edges.push([`stg_${p.id}`, "fct_rows"]);
    }
  }
  // Synergy upgrades join one intermediate model into the next.
  for (const id of s.upg.filter((x) => x.startsWith("syn_"))) {
    const u = UPGRADES.find((x) => x.id === id);
    const a = `int_${PRODUCERS[u.from].id}`;
    const b = `int_${PRODUCERS[u.target].id}`;
    if (tables.some((t) => t.id === a) && tables.some((t) => t.id === b)) edges.push([a, b]);
  }
  const shown = Math.min(s.cols, 10);
  const fctCols = [["row_id", "BIGINT"]];
  for (let n = 0; n < shown; n++) fctCols.push([columnName(n), alienTypeFor(s, n) ?? "…"]);
  if (s.cols > shown) fctCols.push([`…${s.cols - shown} more`, ""]);
  tables.push({ id: "fct_rows", layer: 3, name: "fct_rows", hue: null, cols: fctCols, main: true });
  const dims = [
    [s.cols > 0, "dim_date", [["date_id", "INT"], ["is_friday", "BOOLEAN"]]],
    [!!s.company, "dim_company", [["company_id", "INT"], ["name", "TEXT"]]],
    [s.replat > 0, "dim_insights", [["insight_id", "INT"], ["was_obvious", "BOOLEAN"]]],
    [s.acq > 0, "dim_equity", [["round", "TEXT"], ["valuation_vibes", "NUMERIC"]]],
    [s.contact > 0, "dim_alien", [["species_id", "SEVEN_STATE_BOOL"], ["limb_count", "INT"]]],
    [s.bangs > 0, "dim_universe", [["universe_id", "BIGINT"], ["entropy", "NUMERIC"]]],
    [s.finale, "dim_everything", [["thing_id", "BIGINT"], ["is_data", "BOOLEAN"]]],
  ];
  for (const [on, name, cols] of dims) {
    if (!on) continue;
    tables.push({ id: name, layer: 4, name, hue: null, cols });
    edges.push([name, "fct_rows"]);
  }
  return { tables, edges };
}

export function erdKey(s) {
  return [s.prod.map((c) => (c > 0 ? 1 : 0)).join(""), s.upg.length, s.cols, !!s.company, s.replat > 0, s.acq > 0, s.contact > 0, s.bangs > 0, s.finale].join("|");
}

/** Returns SVG markup. Tables missing from `seen` fade in when `animate`; all get added to it. */
export function renderErd(s, seen, animate) {
  const { tables, edges } = tablesFor(s);
  const pos = {};
  const colY = [36, 36, 36, 36, 36];
  for (const t of tables) {
    const h = HEAD + t.cols.length * ROW + 6;
    pos[t.id] = { x: COL_X[t.layer], y: colY[t.layer], h };
    colY[t.layer] += h + GAP_Y;
  }
  // Centre the fact table vertically against the tallest column.
  const height = Math.max(...colY, 120) + 10;
  pos.fct_rows.y = Math.max(36, (height - pos.fct_rows.h) / 2);
  const width = COL_X[4] + W + 10;

  const paths = edges
    .filter(([a, b]) => pos[a] && pos[b])
    .map(([a, b]) => {
      const A = pos[a], B = pos[b];
      const back = COL_X.indexOf(A.x) > COL_X.indexOf(B.x); // dims point left to the fact table
      const x1 = back ? A.x : A.x + W, y1 = A.y + HEAD / 2;
      const x2 = back ? B.x + W : B.x, y2 = B.y + Math.min(B.h - 8, HEAD / 2 + 10);
      const mx = (x1 + x2) / 2;
      return `<path class="erd-edge" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/>`;
    })
    .join("");

  const boxes = tables
    .map((t) => {
      const { x, y, h } = pos[t.id];
      const color = t.hue === null ? "var(--accent)" : `hsl(${t.hue} 45% 55%)`;
      const fresh = animate && !seen.has(t.id) ? " erd-new" : "";
      seen.add(t.id);
      const rows = t.cols
        .map(([c, type], k) => `<text x="${x + 8}" y="${y + HEAD + 12 + k * ROW}" class="erd-col">${esc(c)}</text><text x="${x + W - 8}" y="${y + HEAD + 12 + k * ROW}" class="erd-type" text-anchor="end">${esc(type)}</text>`)
        .join("");
      return `<g class="erd-table${t.main ? " erd-main" : ""}${fresh}">
        <rect x="${x}" y="${y}" width="${W}" height="${h}" rx="6" class="erd-box"/>
        <rect x="${x}" y="${y}" width="${W}" height="${HEAD}" rx="6" fill="${color}" opacity="0.9"/>
        <rect x="${x}" y="${y + HEAD - 6}" width="${W}" height="6" fill="${color}" opacity="0.9"/>
        <text x="${x + 8}" y="${y + 15}" class="erd-name">${esc(t.name)}</text>${rows}</g>`;
    })
    .join("");

  const labels = LAYER_LABELS.map((l, k) => `<text x="${COL_X[k]}" y="20" class="erd-layer">${l}</text>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Entity relationship diagram of your data model">${labels}${paths}${boxes}</svg>`;
}
