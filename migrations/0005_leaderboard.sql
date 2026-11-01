-- Leaderboard entries, one per opted-in game (id = the start ticket's random id). Holds the
-- generated name and the board values; nothing that identifies a player. Values come from
-- server-validated saves (worker/leaderboard.js).
-- late: the ticket was issued to a game already in progress, so no fastest time.
-- flagged/flag_reason: faster than the simulator or than real time allows; listed anyway,
-- pinged for a human look. hidden: removed by hand after that look.
CREATE TABLE lb_entries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  late INTEGER NOT NULL DEFAULT 0,
  fastest_ms INTEGER,
  rows_log10 REAL NOT NULL DEFAULT 0,
  bangs INTEGER NOT NULL DEFAULT 0,
  catalogs INTEGER NOT NULL DEFAULT 0,
  flagged INTEGER NOT NULL DEFAULT 0,
  flag_reason TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX lb_fastest ON lb_entries (fastest_ms);
CREATE INDEX lb_rows ON lb_entries (rows_log10);
CREATE INDEX lb_bangs ON lb_entries (bangs);
CREATE INDEX lb_catalogs ON lb_entries (catalogs);
