import { implausible, normalize, ACHIEVEMENTS } from "../public/js/economy.js";

const LOGIN_TTL_MS = 15 * 60_000;
const MAX_LINKS_PER_WINDOW = 3;
const SESSION_IDLE_MS = 180 * 86_400_000;
const MIN_SAVE_INTERVAL_MS = 10_000;
const MAX_SAVE_BYTES = 64 * 1024;
// Floor for a first upload's claimed start time: nobody has played longer than the game existed.
const LAUNCH_MS = Date.UTC(2026, 9, 30);
// Resend sends from the rowstoriches.drumandbytes.dev subdomain (verified in Resend; its DNS records
// live in dnb-cloudflare-tf), keeping the apex's iCloud / Email Routing records untouched.
const FROM = "Rows to Riches <noreply@rowstoriches.drumandbytes.dev>";
const APP_NAME = "Rows to Riches";

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
    "SELECT s.token_hash, s.last_seen, u.id, u.email, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
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
  return { id: row.id, email: row.email, createdAt: row.created_at, tokenHash: hash };
}

function loginEmail(link) {
  const text = `Open this link to sign in to ${APP_NAME} (valid 15 minutes):\n\n${link}\n\nIf you didn't ask for this, ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#0d1117;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;background:#161b22;border:1px solid #2a323d;border-radius:12px;">
<tr><td style="padding:28px 28px 8px;text-align:center;color:#e6edf3;font-size:20px;font-weight:700;">▦ ${APP_NAME}</td></tr>
<tr><td style="padding:8px 28px;text-align:center;color:#c9d1d9;font-size:15px;line-height:1.5;">Tap the button to sign in and sync your progress. The link is valid for 15 minutes.</td></tr>
<tr><td style="padding:12px 28px;text-align:center;"><a href="${link}" style="display:inline-block;background:#2fbf71;color:#06110b;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;font-family:Menlo,monospace;">INSERT INTO session</a></td></tr>
<tr><td style="padding:16px 28px 28px;text-align:center;color:#8b949e;font-size:12px;line-height:1.5;word-break:break-all;">Button not working? Paste this into your browser:<br><a href="${link}" style="color:#3fd68a;">${link}</a><br><br>Didn't ask for this? Just ignore it.</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}

async function handleLogin(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  if (env.LOGIN_LIMITER) {
    const { success } = await env.LOGIN_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "Too many requests, try again in a minute." }, 429);
  }
  const body = await readJson(request);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;
  if (!isEmail(email)) return json({ error: "That email doesn't look right." }, 400);

  const now = Date.now();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND created_at > ?")
    .bind(email, now - LOGIN_TTL_MS)
    .first("n");
  // Same response when capped, so nobody can probe or flood an inbox.
  if (recent >= MAX_LINKS_PER_WINDOW) return json({ ok: true });

  const token = randomToken();
  await env.DB.prepare("INSERT INTO login_tokens (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), email, now + LOGIN_TTL_MS, now)
    .run();
  const link = `${env.APP_ORIGIN}/?login=${token}`;
  if (env.DEV_RETURN_LINKS === "1") return json({ ok: true, devLink: link });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [email], subject: `Sign in to ${APP_NAME}`, ...loginEmail(link) }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  } catch (err) {
    console.error("login email failed:", err instanceof Error ? err.message : err);
    return json({ error: "Couldn't send the email right now." }, 502);
  }
  return json({ ok: true });
}

async function handleVerify(request, env) {
  const body = await readJson(request);
  if (typeof body?.token !== "string") return json({ error: "Missing token." }, 400);
  const now = Date.now();
  const hash = await sha256(body.token);
  // Atomic single use: only the request that flips used_at gets a row back.
  const row = await env.DB.prepare(
    "UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email",
  )
    .bind(now, hash, now)
    .first();
  if (!row) return json({ error: "This sign-in link has expired or was already used." }, 400);

  await env.DB.prepare("INSERT INTO users (email, created_at) VALUES (?, ?) ON CONFLICT (email) DO NOTHING").bind(row.email, now).run();
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(row.email).first();
  const session = randomToken();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, last_seen) VALUES (?, ?, ?, ?)").bind(await sha256(session), user.id, now, now),
    env.DB.prepare("DELETE FROM login_tokens WHERE expires_at < ?").bind(now - 86_400_000),
  ]);
  return json({ session, email: row.email });
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
    const text = `💬 Rows to Riches feedback (${category})\n\n${message}\n\n${contact ? `Reply to: ${contact}\n` : ""}${JSON.stringify(context)} ${country ?? ""}`;
    ctx.waitUntil(
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: text.slice(0, 4000) }),
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
  if (pathname === "/api/login" && method === "POST") return handleLogin(request, env);
  if (pathname === "/api/verify" && method === "POST") return handleVerify(request, env);

  const user = await authenticate(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);
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
      env.DB.prepare("DELETE FROM login_tokens WHERE email = ?").bind(user.email),
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
