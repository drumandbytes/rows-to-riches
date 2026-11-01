// Saves are stored and exported as "r2r1.<base64url JSON>.<seal>". The encoding keeps the
// save from being readable at a glance; the seal notices when someone changes it without
// knowing how the seal is made. Neither is security (the code is right here): a save whose
// seal doesn't match still loads, it's just marked `modified` and can't be ranked. The
// leaderboard's server-signed checkpoints are what actually hold.

const PREFIX = "r2r1.";
const PEPPER = "rows-to-riches:the DBA has concerns";

// cyrb53 (public domain): a fast 53-bit string hash. Sync, so saving on pagehide still works.
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const seal = (body) => cyrb53(PEPPER + body, body.length).toString(36);

const toB64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

export function encodeSave(state) {
  const body = toB64(JSON.stringify(state));
  return `${PREFIX}${body}.${seal(body)}`;
}

/** { raw, sealed }: sealed is false for a broken seal and for the older unsealed formats
 *  (plain JSON, base64 JSON exports). Throws on anything that isn't a save. */
export function decodeSave(text) {
  text = text.trim();
  if (text.startsWith(PREFIX)) {
    const [body, sig] = text.slice(PREFIX.length).split(".");
    return { raw: JSON.parse(fromB64(body)), sealed: sig === seal(body) };
  }
  if (text.startsWith("{")) return { raw: JSON.parse(text), sealed: false };
  return { raw: JSON.parse(fromB64(text)), sealed: false };
}
