// Web Push without a library. Pushes carry no payload, so there's nothing to encrypt
// (RFC 8291); all we need is a VAPID JWT (RFC 8292) signed with ES256 via WebCrypto.
// The only secret is VAPID_PRIVATE_JWK (made by tools/vapid.js); the public key is the
// x/y half of the same JWK.

import { b64url, unb64url } from "../public/js/b64.js";

// Browsers' push services. Anything else is refused, so the cron never fetches a URL a
// stranger made up.
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

export function validEndpoint(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 1024) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}

/** Uncompressed P-256 point (0x04 || x || y), base64url: the browser's applicationServerKey. */
export function publicKey(jwk) {
  return b64url(new Uint8Array([4, ...unb64url(jwk.x), ...unb64url(jwk.y)]));
}

export async function vapidJwt(jwk, endpoint, subject, now = Date.now()) {
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })}`;
  // WebCrypto's ECDSA signature is already r||s, the form JWS wants.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned)));
  return `${unsigned}.${b64url(sig)}`;
}

/** Sends an empty push; resolves to the push service's status code. */
export async function sendPush(jwk, endpoint, subject) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `vapid t=${await vapidJwt(jwk, endpoint, subject)}, k=${publicKey(jwk)}`, TTL: "86400", Urgency: "normal", "Content-Length": "0" },
  });
  return res.status;
}
