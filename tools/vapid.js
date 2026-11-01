// Makes the VAPID key pair for Web Push and prints the private JWK (which includes the
// public half). Pipe it straight into the secret so it never lands on screen or disk:
//   node tools/vapid.js | npx wrangler secret put VAPID_PRIVATE_JWK
// A new key invalidates every existing subscription; players just re-enable the toggle.
const { privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const { kty, crv, x, y, d } = await crypto.subtle.exportKey("jwk", privateKey);
process.stdout.write(JSON.stringify({ kty, crv, x, y, d }));
