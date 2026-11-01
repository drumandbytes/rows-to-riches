// Minimal static server for public/ (browser smoke test, quick local checks).
//   node tools/serve.js [port=8790]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("public");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain", ".ico": "image/x-icon" };

export function serve(port = 8790) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/api/")) return res.writeHead(404).end();
    const file = path.join(root, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) serve(Number(process.argv[2] ?? 8790)).then(() => console.log("serving public/"));
