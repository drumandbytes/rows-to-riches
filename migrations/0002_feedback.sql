-- In-game feedback. Read with: npx wrangler d1 execute rows-to-riches --remote
--   --command "SELECT id, datetime(created_at / 1000, 'unixepoch') AS at, category, message, contact FROM feedback ORDER BY id DESC LIMIT 20"
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  -- Optional email the player gave for a reply.
  contact TEXT,
  -- Anonymous game context (version, environment, prestige counts), as JSON.
  context TEXT,
  country TEXT
);
