import { test } from "node:test";
import assert from "node:assert/strict";
import { validEndpoint, publicKey, vapidJwt } from "../worker/push.js";

const b64 = (s) => Buffer.from(s, "base64url");

test("only browser push services are accepted as endpoints", () => {
  assert.ok(validEndpoint("https://fcm.googleapis.com/fcm/send/abc"));
  assert.ok(validEndpoint("https://web.push.apple.com/QA123"));
  assert.ok(validEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x"));
  assert.ok(validEndpoint("https://wns2-am3p.notify.windows.com/w/?token=x"));
  assert.ok(!validEndpoint("http://fcm.googleapis.com/fcm/send/abc"));
  assert.ok(!validEndpoint("https://evil-fcm.googleapis.com.example.com/x"));
  assert.ok(!validEndpoint("https://example.com/push"));
  assert.ok(!validEndpoint(42));
});

test("the VAPID JWT verifies against the advertised public key", async () => {
  const { privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  const raw = b64(publicKey(jwk));
  assert.equal(raw.length, 65);
  const jwt = await vapidJwt(jwk, "https://fcm.googleapis.com/fcm/send/abc", "https://example.test", 0);
  const [h, c, sig] = jwt.split(".");
  assert.deepEqual(JSON.parse(b64(c)), { aud: "https://fcm.googleapis.com", exp: 12 * 3600, sub: "https://example.test" });
  const pub = await crypto.subtle.importKey("raw", raw, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64(sig), new TextEncoder().encode(`${h}.${c}`)));
});
