-- Account codes replace email sign-in: accounts are a code hash and nothing else.
--
-- Rebuilding users is only safe because it was empty when this ran (checked on the live
-- database, 2026-10-30): D1 always enforces foreign keys, so dropping a users table with
-- rows would cascade-delete their sessions and saves. Never copy this pattern onto a
-- table with data.
--
-- Only a SHA-256 of each code is stored. A code carries 100 random bits, so the unsalted
-- hash can't be brute-forced from a leaked database.
PRAGMA defer_foreign_keys = true;
DROP TABLE login_tokens;
DROP TABLE users;
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
