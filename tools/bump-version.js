// Bumps the patch version before a local `npm run deploy`, so every deploy shows a new
// version in About and in feedback. package.json is the source; main.js gets a copy because
// the client has no build step. Commit both afterwards.
//   node tools/bump-version.js [major|minor|patch]
import fs from "node:fs";

const part = process.argv[2] ?? "patch";
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);
pkg.version = { major: `${major + 1}.0.0`, minor: `${major}.${minor + 1}.0`, patch: `${major}.${minor}.${patch + 1}` }[part];
if (!pkg.version) throw new Error(`unknown part: ${part}`);
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

const main = "public/js/main.js";
const src = fs.readFileSync(main, "utf8");
const out = src.replace(/^const VERSION = ".*";$/m, `const VERSION = "${pkg.version}";`);
if (out === src) throw new Error("VERSION line not found in main.js");
fs.writeFileSync(main, out);
console.log(`v${pkg.version}`);
