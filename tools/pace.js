// Regenerates worker/pace.json: when the simulator (optimal play, never sleeps) first
// reaches each milestone. The leaderboard flags runs faster than PACE_SLACK of this for a
// human look; it never rejects them. Rerun after balance changes:
//   node tools/pace.js
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "r2r-pace-")), "trace.json");
execFileSync("node", ["tools/sim.js", "400"], { env: { ...process.env, TRACE: file }, stdio: "ignore" });
const trace = JSON.parse(fs.readFileSync(file, "utf8"));
// A milestone every few steps is plenty, and keeps the file small.
const pick = (map, keep) => Object.fromEntries(Object.entries(map).filter(([k]) => keep(Number(k))));
const pace = {
  rows: pick(trace.rows, (e) => e % 5 === 0 && e > 0),
  acq: pick(trace.acq, (n) => [1, 2, 3, 5, 10, 20, 50, 100, 200, 500, 1000].includes(n)),
  contact: pick(trace.contact, (n) => [1, 2, 5, 10, 20, 50, 100].includes(n)),
  bangs: pick(trace.bangs, (n) => n <= 5 || n % 5 === 0),
};
if (!pace.bangs[50]) throw new Error("the sim didn't reach 50 Big Bangs (Catalog Everything) in 400 h");
fs.writeFileSync("worker/pace.json", JSON.stringify(pace, null, 1) + "\n");
console.log(`worker/pace.json: Catalog Everything (50 Big Bangs) at ${pace.bangs[50]} h`);
