// After a deploy: fetches every file in public/ from the live site and fails on anything
// but 200. Catches what local tests can't, like the zone WAF blocking a path (it 403'd
// /js/vendor/ for scanners, which broke v0.2.0).
//   node tools/check-live.js [origin=https://rowstoriches.drumandbytes.dev]
import fs from "node:fs";
import path from "node:path";

const origin = process.argv[2] ?? "https://rowstoriches.drumandbytes.dev";
const files = fs.readdirSync("public", { recursive: true })
  .filter((f) => fs.statSync(path.join("public", f)).isFile() && !path.basename(f).startsWith("_") && !path.basename(f).startsWith("."))
  .map((f) => `/${f.split(path.sep).join("/")}`);

// A bot challenge (Bot Fight Mode on datacenter IPs like CI runners, marked by the
// cf-mitigated header) is fine: a real browser passes it. A plain 403 is a block, which
// browsers don't get past.
const failed = [];
const challenged = [];
await Promise.all(
  ["/", ...files].map(async (p) => {
    const res = await fetch(origin + p, { headers: { "User-Agent": "rows-to-riches-deploy-check" } }).catch((e) => ({ status: e.message, headers: new Headers() }));
    if (res.status === 200) return;
    if (res.headers.get("cf-mitigated") === "challenge") challenged.push(p);
    else failed.push(`${res.status} ${p}`);
  }),
);
console.log(`${files.length + 1} files checked on ${origin}`);
if (challenged.length) console.log(`bot challenge (fine for browsers): ${challenged.sort().join(" ")}`);
if (failed.length) {
  console.error(failed.sort().join("\n"));
  process.exitCode = 1;
}
