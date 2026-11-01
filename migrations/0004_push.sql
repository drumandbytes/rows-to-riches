-- Scheduled Web Push notifications (opt-in, Save → Notifications). A row exists only while
-- something is scheduled for a browser's push endpoint and is deleted once sent; there's
-- no account link. kind: "cap" (offline cap full) or "chal" (challenge about to time out).
CREATE TABLE push_schedule (
  endpoint TEXT NOT NULL,
  kind TEXT NOT NULL,
  notify_at INTEGER NOT NULL,
  PRIMARY KEY (endpoint, kind)
);
CREATE INDEX push_schedule_notify_at ON push_schedule (notify_at);
