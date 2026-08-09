CREATE TABLE IF NOT EXISTS snapshots (
  event_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
