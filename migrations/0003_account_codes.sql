-- Account codes: sign in with a random code instead of an email.
--
-- users.email stays NOT NULL: dropping that would mean rebuilding users, and D1 always
-- enforces foreign keys, so DROP TABLE users would cascade-delete every session and save.
-- Code-only accounts store a "code:" placeholder there instead (see worker/index.js).
--
-- Only a SHA-256 of the code is stored. The code carries 100 random bits, so an unsalted
-- hash is safe to keep: nobody can brute-force it from a leaked database.
ALTER TABLE users ADD COLUMN code_hash TEXT;
CREATE UNIQUE INDEX users_code_hash ON users (code_hash) WHERE code_hash IS NOT NULL;
