// Leaderboards. Stateless until a player opts in:
// - Every new game gets a signed start ticket ({ t: server time, n: random id }). Nothing is
//   stored; the signature is what makes the start time trustworthy.
// - Opted-in games send their sealed save as a checkpoint. The server derives every value
//   from the save itself, never from what the client claims, and stamps it with its own clock.
// - Saves that break the game's rules (implausible) are refused, since an honest save can't.
//   Runs faster than the simulator are listed anyway and flagged for a human look: the sim
//   isn't optimal, so speed alone is a hint, not proof.
// Secret: LEADERBOARD_KEY (tools/lb-key.js). Without it the endpoints 404 and the UI hides.

import { decodeSave } from "../public/js/seal.js";
import { normalize, implausible } from "../public/js/economy.js";
import { validName, ADJECTIVES, MOODS, NOUNS } from "../public/js/names.js";
import PACE from "./pace.json" with { type: "json" };

// Flag a run reaching a milestone in under this share of the simulator's time.
export const PACE_SLACK = 0.5;
export const BOARDS = {
  fastest: { col: "fastest_ms", order: "ASC", where: "fastest_ms IS NOT NULL AND late = 0" },
  rows: { col: "rows_log10", order: "DESC", where: "rows_log10 > 0" },
  bangs: { col: "bangs", order: "DESC", where: "bangs > 0" },
  catalogs: { col: "catalogs", order: "DESC", where: "catalogs > 0" },
};

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const enc = new TextEncoder();

const hmacKey = (env) => crypto.subtle.importKey("raw", unb64url(env.LEADERBOARD_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export async function signToken(env, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyToken(env, token) {
  if (typeof token !== "string" || token.length > 512) return null;
  const [body, sig] = token.split(".");
  try {
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(env), unb64url(sig), enc.encode(body)))) return null;
    return JSON.parse(new TextDecoder().decode(unb64url(body)));
  } catch {
    return null;
  }
}

/** The first milestone this save reached faster than PACE_SLACK × the simulator, or null. */
export function paceFlag(s, elapsedH) {
  const reached = { rows: Math.floor(s.everRows.add(1).log10()), acq: s.acq, contact: s.contact, bangs: s.bangs };
  const labels = { rows: (k) => `1e${k} rows`, acq: (k) => `${k} acquisitions`, contact: (k) => `${k} first contacts`, bangs: (k) => `${k} Big Bangs` };
  for (const [kind, table] of Object.entries(PACE)) {
    const hit = Object.keys(table).map(Number).filter((k) => k <= reached[kind]).sort((a, b) => b - a)[0];
    if (hit !== undefined && elapsedH < table[hit] * PACE_SLACK) return `${labels[kind](hit)} after ${elapsedH.toFixed(1)} h (sim: ${table[hit]} h)`;
  }
  return null;
}

export async function handleTicket(request, body, env) {
  const ticket = await signToken(env, { k: "t", t: Date.now(), n: b64url(crypto.getRandomValues(new Uint8Array(12))), late: !body?.fresh });
  return { ticket };
}

/** Validates an opted-in save and updates its entry. Returns { status, data }. */
export async function handleCheckpoint(body, env, ping) {
  const ticket = await verifyToken(env, body?.ticket);
  if (ticket?.k !== "t") return { status: 400, data: { error: "Invalid ticket." } };
  let decoded;
  try {
    decoded = decodeSave(body.save);
  } catch {
    return { status: 400, data: { error: "That isn't a save." } };
  }
  const now = Date.now();
  const s = normalize(decoded.raw, now);
  if (!decoded.sealed || s.modified) return { status: 422, data: { error: "This save was modified, so it can't be ranked." } };
  if (s.lb?.ticket !== body.ticket) return { status: 400, data: { error: "The ticket doesn't belong to this save." } };
  // The game's own rules: these can't fail for an honest save, however fast.
  const broken = implausible(null, s, 1e15); // any amount of time: rules only
  if (broken) return { status: 422, data: { error: `This save breaks the game's rules (${broken}).` } };

  const elapsedH = (now - ticket.t) / 3.6e6;
  // Faster than real time allows (e.g. a forwarded clock faking offline time), or faster than
  // the simulator: listed anyway, flagged for a look.
  const flag = ticket.late ? null : (implausible(null, s, (now - ticket.t) / 1000) ?? paceFlag(s, elapsedH));
  const old = await env.DB.prepare("SELECT name, flagged, fastest_ms FROM lb_entries WHERE id = ?").bind(ticket.n).first();
  const name = old?.name ?? (validName(body.name) ? body.name : null);
  if (!name) return { status: 400, data: { error: "Pick a generated name." } };
  // Names stay unique (lb_name index): a new entry with a taken one gets 409 and rerolls.
  if (!old && (await env.DB.prepare("SELECT 1 FROM lb_entries WHERE name = ?").bind(name).first())) return { status: 409, data: { error: "Name taken." } };
  // Fastest completion: the first checkpoint that sees one, by server time, on a ticket from
  // the game's real start. Later checkpoints (New Game+) never change it.
  const fastest = old?.fastest_ms ?? (!ticket.late && s.completions > 0 ? now - ticket.t : null);
  const rowsLog10 = Math.floor(s.everRows.add(1).log10() * 100) / 100;
  await env.DB.prepare(
    `INSERT INTO lb_entries (id, name, late, fastest_ms, rows_log10, bangs, catalogs, flagged, flag_reason, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
     ON CONFLICT (id) DO UPDATE SET fastest_ms = ?4, rows_log10 = MAX(rows_log10, ?5), bangs = MAX(bangs, ?6), catalogs = MAX(catalogs, ?7),
       flagged = MAX(flagged, ?8), flag_reason = COALESCE(flag_reason, ?9), updated_at = ?10`,
  )
    .bind(ticket.n, name, ticket.late ? 1 : 0, fastest, rowsLog10, s.bangs, s.completions, flag ? 1 : 0, flag, now)
    .run();
  if (flag && !old?.flagged) ping(`🏁 <b>Leaderboard run to look at</b> · Rows to Riches\n\n${name}: ${flag}\n<i>Remove with: UPDATE lb_entries SET hidden = 1 WHERE id = '${ticket.n}'</i>`);
  return { status: 200, data: { ok: true, name } };
}

export async function handleBoard(url, env) {
  const board = BOARDS[url.searchParams.get("b")];
  if (!board) return { status: 400, data: { error: "Unknown board." } };
  const me = url.searchParams.get("me") ?? "";
  const where = `hidden = 0 AND ${board.where}`;
  const { results } = await env.DB.prepare(`SELECT id, name, ${board.col} AS value FROM lb_entries WHERE ${where} ORDER BY ${board.col} ${board.order}, created_at LIMIT 10`).all();
  // Ties share a rank: 1 + how many entries are strictly better.
  const better = board.order === "ASC" ? "<" : ">";
  const rankOf = async (value) =>
    1 + (await env.DB.prepare(`SELECT COUNT(*) AS n FROM lb_entries WHERE ${where} AND ${board.col} ${better} ?`).bind(value).first()).n;
  const top = [];
  for (const r of results) top.push({ name: r.name, value: r.value, rank: await rankOf(r.value), me: r.id === me });
  let mine = null;
  if (me && !top.some((r) => r.me)) {
    const row = await env.DB.prepare(`SELECT name, ${board.col} AS value FROM lb_entries WHERE id = ? AND ${where}`).bind(me).first();
    if (row) mine = { name: row.name, value: row.value, rank: await rankOf(row.value), me: true };
  }
  return { status: 200, data: { top, me: mine } };
}

// Names are unique, so entries can't outgrow the name lists (~1.2M). Past this many, the
// daily check pings until the lists in public/js/names.js get longer.
export const NAME_ALERT = 1_000_000;
export const NAME_SPACE = ADJECTIVES.length * MOODS.length * NOUNS.length;

/** From the cron: once a day (the 09:00 UTC run), count entries and ping when near the limit. */
export async function checkNameSpace(env, scheduledTime, ping) {
  const at = new Date(scheduledTime);
  if (!env.LEADERBOARD_KEY || at.getUTCHours() !== 9 || at.getUTCMinutes() >= 5) return;
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM lb_entries").first();
  if (n >= NAME_ALERT) ping(`📛 <b>Leaderboard names running out</b> · Rows to Riches\n\n${n.toLocaleString("en-US")} of ${NAME_SPACE.toLocaleString("en-US")} names are taken. Add words to public/js/names.js.`);
}

export async function handleRemove(body, env) {
  const ticket = await verifyToken(env, body?.ticket);
  if (ticket?.k !== "t") return { status: 400, data: { error: "Invalid ticket." } };
  await env.DB.prepare("DELETE FROM lb_entries WHERE id = ?").bind(ticket.n).run();
  return { status: 200, data: { ok: true } };
}
