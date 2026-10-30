import { implausible, normalize, ACHIEVEMENTS } from "../public/js/economy.js";

const SESSION_IDLE_MS = 180 * 86_400_000;
const MIN_SAVE_INTERVAL_MS = 10_000;
const MAX_SAVE_BYTES = 64 * 1024;
// Floor for a first upload's claimed start time: nobody has played longer than the game existed.
const LAUNCH_MS = Date.UTC(2026, 9, 30);

const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const isEmail = (v) => typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Account codes: 20 Crockford base32 characters (100 random bits), shown as
// R2R-XXXX-XXXX-XXXX-XXXX-XXXX. No I, L, O or U, and typing those is forgiven.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const chars = [...bytes].map((b) => CODE_ALPHABET[b & 31]).join("");
  return `R2R-${chars.match(/.{4}/g).join("-")}`;
}

/** The 20 code characters, or null. Accepts any case, spaces, dashes and the R2R- prefix. */
function cleanCode(input) {
  if (typeof input !== "string") return null;
  const s = input.toUpperCase().replace(/^\s*R2R/, "").replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0").replace(/U/g, "V");
  return /^[0-9A-HJKMNP-TV-Z]{20}$/.test(s) ? s : null;
}

const codeHash = (input) => sha256(`r2r-code:${cleanCode(input)}`);

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_SAVE_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function authenticate(request, env) {
  const auth = request.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const hash = await sha256(auth.slice(7).trim());
  const row = await env.DB.prepare(
    "SELECT s.token_hash, s.last_seen, u.id, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
  )
    .bind(hash)
    .first();
  if (!row) return null;
  const now = Date.now();
  if (now - row.last_seen > SESSION_IDLE_MS) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(hash).run();
    return null;
  }
  // Only touch last_seen hourly to keep writes down.
  if (now - row.last_seen > 3_600_000) await env.DB.prepare("UPDATE sessions SET last_seen = ? WHERE token_hash = ?").bind(now, hash).run();
  return { id: row.id, createdAt: row.created_at, tokenHash: hash };
}

async function startSession(env, userId, now = Date.now()) {
  const session = randomToken();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, last_seen) VALUES (?, ?, ?, ?)").bind(await sha256(session), userId, now, now).run();
  return session;
}

async function loginLimited(request, env) {
  if (!env.LOGIN_LIMITER) return false;
  const { success } = await env.LOGIN_LIMITER.limit({ key: request.headers.get("CF-Connecting-IP") ?? "local" });
  return !success;
}

// New account. The code is returned once; the server keeps only its hash.
async function handleCodeNew(request, env) {
  if (await loginLimited(request, env)) return json({ error: "Too many requests, try again in a minute." }, 429);
  const now = Date.now();
  const code = newCode();
  const hash = await codeHash(code);
  // 2^100 codes: a collision would need ~10^15 accounts, so the unique index is just a backstop.
  const user = await env.DB.prepare("INSERT INTO users (code_hash, created_at) VALUES (?, ?) RETURNING id").bind(hash, now).first();
  return json({ code, session: await startSession(env, user.id, now) });
}

async function handleCodeLogin(request, env) {
  // 5 guesses a minute per IP against 2^100 codes.
  if (await loginLimited(request, env)) return json({ error: "Too many attempts, try again in a minute." }, 429);
  const body = await readJson(request);
  if (!cleanCode(body?.code)) return json({ error: "That doesn't look like an account code (R2R- and 20 letters or digits)." }, 400);
  const user = await env.DB.prepare("SELECT id FROM users WHERE code_hash = ?").bind(await codeHash(body.code)).first();
  if (!user) return json({ error: "No account with that code." }, 404);
  return json({ session: await startSession(env, user.id) });
}

// A fresh code for the signed-in account. The old code
// stops working; sessions on other devices stay signed in.
async function handleCodeRotate(user, env) {
  const code = newCode();
  await env.DB.prepare("UPDATE users SET code_hash = ? WHERE id = ?").bind(await codeHash(code), user.id).run();
  return json({ code });
}

async function getSave(env, userId) {
  const row = await env.DB.prepare("SELECT data, updated_at FROM saves WHERE user_id = ?").bind(userId).first();
  return row ? { save: JSON.parse(row.data), updatedAt: row.updated_at } : null;
}

async function handleGetSave(user, env) {
  const stored = await getSave(env, user.id);
  return json({ save: stored?.save ?? null });
}

async function handlePutSave(request, user, env) {
  const body = await readJson(request);
  if (!body?.save || typeof body.save !== "object") return json({ error: "Missing save." }, 400);
  const now = Date.now();
  const next = normalize(body.save, now);
  // Achievements are re-derived rather than trusted.
  next.ach = ACHIEVEMENTS.filter((a) => a.test(next)).map((a) => a.id);
  next.buffs = [];

  const stored = await getSave(env, user.id);
  if (stored && now - stored.updatedAt < MIN_SAVE_INTERVAL_MS && !body.force) return json({ error: "Saving too often." }, 429);
  if (stored && next.everRows < (stored.save.everRows ?? stored.save.allRows) && !body.force) return json({ error: "Cloud save is ahead.", save: stored.save }, 409);

  // Two ways a save can be plausible: grown from the stored one since its upload, or grown
  // from nothing since the save says it started (another device may have been far ahead
  // all along, e.g. offline play on both).
  const sinceStart = (now - Math.max(LAUNCH_MS, Math.min(next.startedAt, now))) / 1000;
  let reason = implausible(null, next, sinceStart);
  if (reason && stored) reason = implausible(normalize(stored.save, now), next, (now - stored.updatedAt) / 1000) && reason;
  if (reason) return json({ error: reason }, 422);

  await env.DB.prepare(
    "INSERT INTO saves (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
  )
    .bind(user.id, JSON.stringify(next), now)
    .run();
  return json({ ok: true });
}

// Anonymous gameplay analytics. No cookies, no user or device ids, no IPs stored: just an
// event name, coarse context and a few numbers, written to Workers Analytics Engine.
const EVENTS = new Set(["session_start", "session_end", "snapshot", "replat", "acq", "contact", "bang", "finale", "challenge", "quarter"]);
const LABEL = /^[a-z0-9_-]{0,24}$/;
const NUMBERS = ["sessionSecs", "playHours", "log10Rows", "replat", "acq", "contact", "bangs", "ach", "chalWins", "quarters"];

async function handleEvent(request, env) {
  if (!env.STATS) return new Response(null, { status: 204 }); // local dev without the binding
  if (env.EVENT_LIMITER) {
    const { success } = await env.EVENT_LIMITER.limit({ key: request.headers.get("CF-Connecting-IP") ?? "local" });
    if (!success) return new Response(null, { status: 204 });
  }
  const body = await readJson(request);
  if (!body || !EVENTS.has(body.e)) return new Response(null, { status: 204 });
  const label = (k) => (typeof body[k] === "string" && LABEL.test(body[k]) ? body[k] : "");
  const n = (k) => (Number.isFinite(body[k]) ? Math.max(-1e6, Math.min(1e6, body[k])) : 0);
  env.STATS.writeDataPoint({
    indexes: [body.e],
    blobs: [body.e, label("env"), label("device"), label("visitor"), label("detail"), label("notation"), request.cf?.country ?? ""],
    doubles: NUMBERS.map(n),
  });
  return new Response(null, { status: 204 });
}

// In-game feedback into D1, plus an optional Telegram ping (secrets TELEGRAM_BOT_TOKEN and
// TELEGRAM_CHAT_ID; without them feedback is only stored).
const FEEDBACK_CATEGORIES = new Set(["bug", "idea", "balance", "other"]);
const CONTEXT_KEYS = ["v", "env", "device", "notation", "replat", "acq", "contact", "bangs", "log10Rows", "playHours"];

const CATEGORY_LABELS = { bug: "🐛 Bug", idea: "💡 Idea", balance: "⚖️ Balance", other: "💬 Other" };
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const flag = (cc) => (/^[A-Z]{2}$/.test(cc ?? "") ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) + " " + cc : "");

// Telegram HTML: the message stands out, the context reads as one-line facts.
function feedbackText(category, message, contact, c, country) {
  const prestige = ["replat", "acq", "contact", "bangs"].filter((k) => c[k]).map((k) => `${k} ${c[k]}`);
  const facts = [
    [c.v && `v${c.v}`, c.device, flag(country)],
    [c.env, c.log10Rows !== undefined && `~1e${c.log10Rows} rows`, c.playHours !== undefined && `${c.playHours} h played`],
    [prestige.length ? prestige.join(", ") : "no prestige yet", c.notation && `${c.notation} notation`],
  ].map((line) => line.filter(Boolean).join(" · ")).filter(Boolean);
  return [
    `<b>${CATEGORY_LABELS[category]}</b> · Rows to Riches`,
    "",
    `<blockquote>${escapeHtml(message)}</blockquote>`,
    contact ? `Reply to: ${escapeHtml(contact)}` : "",
    `<i>${escapeHtml(facts.join("\n"))}</i>`,
  ].filter((l, i) => l || i === 1).join("\n");
}

async function handleFeedback(request, env, ctx) {
  if (env.FEEDBACK_LIMITER) {
    const { success } = await env.FEEDBACK_LIMITER.limit({ key: request.headers.get("CF-Connecting-IP") ?? "local" });
    if (!success) return json({ error: "That's a lot of feedback. Try again in a minute." }, 429);
  }
  const body = await readJson(request);
  // Honeypot: a field people never see, so only bots fill it in. Pretend it worked.
  if (body?.website) return json({ ok: true });
  const category = FEEDBACK_CATEGORIES.has(body?.category) ? body.category : "other";
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) : "";
  if (message.length < 5) return json({ error: "Please write a little more." }, 400);
  const contact = isEmail(body?.contact?.trim?.()) ? body.contact.trim().toLowerCase() : null;
  const context = {};
  for (const k of CONTEXT_KEYS) {
    const v = body?.context?.[k];
    if (typeof v === "number" && Number.isFinite(v)) context[k] = v;
    else if (typeof v === "string" && v.length <= 32) context[k] = v;
  }
  const country = request.cf?.country ?? null;
  await env.DB.prepare("INSERT INTO feedback (created_at, category, message, contact, context, country) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(Date.now(), category, message, contact, JSON.stringify(context), country)
    .run();
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const text = feedbackText(category, message, contact, context, country);
    ctx.waitUntil(
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
      }).catch((err) => console.error("telegram failed:", err instanceof Error ? err.message : err)),
    );
  }
  return json({ ok: true });
}

async function route(request, env, ctx) {
  const { pathname } = new URL(request.url);
  const method = request.method;
  if (pathname === "/api/feedback" && method === "POST") return handleFeedback(request, env, ctx);
  if (pathname === "/api/t" && method === "POST") return handleEvent(request, env);
  if (pathname === "/api/code/new" && method === "POST") return handleCodeNew(request, env);
  if (pathname === "/api/code/login" && method === "POST") return handleCodeLogin(request, env);

  const user = await authenticate(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);
  if (pathname === "/api/code/rotate" && method === "POST") return handleCodeRotate(user, env);
  if (pathname === "/api/save" && method === "GET") return handleGetSave(user, env);
  if (pathname === "/api/save" && method === "PUT") return handlePutSave(request, user, env);
  if (pathname === "/api/logout" && method === "POST") {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(user.tokenHash).run();
    return json({ ok: true });
  }
  if (pathname === "/api/account" && method === "DELETE") {
    // D1 doesn't enforce foreign keys by default, so delete children explicitly.
    await env.DB.batch([
      env.DB.prepare("DELETE FROM saves WHERE user_id = ?").bind(user.id),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
      env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
    ]);
    return json({ ok: true });
  }
  return json({ error: "Not found." }, 404);
}

// Copy of logRef() from drumandbytes/cloudflare-workers ref-logger (same dataset): counts
// where page loads come from, by ?ref= or Referer host. No cookies, no IPs.
function logRef(request, refs) {
  if (!refs || request.method !== "GET" || request.headers.get("sec-fetch-dest") !== "document") return;
  const url = new URL(request.url);
  let refHost = "";
  try {
    refHost = new URL(request.headers.get("referer") ?? "").hostname;
  } catch {
    // missing or malformed Referer
  }
  if (refHost === url.hostname) return;
  const from = (url.searchParams.get("ref") || refHost || "direct").slice(0, 64);
  refs.writeDataPoint({ indexes: [from], blobs: [from, url.hostname, url.pathname, refHost] });
}

// Earlier addresses of the game: permanently redirected to APP_ORIGIN.
const OLD_HOSTS = new Set(["rows.drumandbytes.dev"]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (OLD_HOSTS.has(url.hostname)) return Response.redirect(`${env.APP_ORIGIN}${url.pathname}${url.search}`, 301);
    const { pathname } = url;
    if (!pathname.startsWith("/api/")) {
      logRef(request, env.REFS);
      return env.ASSETS.fetch(request);
    }
    try {
      return await route(request, env, ctx);
    } catch (err) {
      console.error("api error:", err instanceof Error ? err.stack : err);
      return json({ error: "Server error." }, 500);
    }
  },
};
