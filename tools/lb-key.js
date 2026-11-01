// Makes the leaderboard signing key and prints it. Pipe it straight into the secret:
//   node tools/lb-key.js | npx wrangler secret put LEADERBOARD_KEY
// A new key invalidates every start ticket: existing games get a late ticket next time.
const key = crypto.getRandomValues(new Uint8Array(32));
process.stdout.write(Buffer.from(key).toString("base64url"));
