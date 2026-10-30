-- Accounts exist only once a sign-in link has been opened.
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- Only SHA-256 hashes of tokens are stored, so a leaked DB can't sign anyone in.
CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX login_tokens_email ON login_tokens (email, created_at);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE saves (
  user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
