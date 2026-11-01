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

const failed = [];
await Promise.all(
  ["/", ...files].map(async (p) => {
    const res = await fetch(origin + p, { headers: { "User-Agent": "rows-to-riches-deploy-check" } }).catch((e) => ({ status: e.message }));
    if (res.status !== 200) failed.push(`${res.status} ${p}`);
  }),
);
console.log(`${files.length + 1} files checked on ${origin}`);
if (failed.length) {
  console.error(failed.sort().join("\n"));
  process.exitCode = 1;
}
