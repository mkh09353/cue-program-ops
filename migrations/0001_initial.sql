-- Suggested D1 schema. The Ruckus local default intentionally uses in-memory data and does not require D1.
CREATE TABLE IF NOT EXISTS sync_links (
  provider TEXT NOT NULL, entity_type TEXT NOT NULL, local_id TEXT NOT NULL, scope TEXT NOT NULL,
  remote_id TEXT NOT NULL, payload_hash TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, entity_type, local_id, scope)
);
CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL, provider TEXT NOT NULL, mode TEXT NOT NULL,
  status TEXT NOT NULL, mapping_version TEXT NOT NULL, mapping_snapshot TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT, counts_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_run_items (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, entity_type TEXT NOT NULL, local_id TEXT NOT NULL,
  operation TEXT NOT NULL, idempotency_key TEXT NOT NULL, payload_hash TEXT NOT NULL, remote_id TEXT,
  status TEXT NOT NULL, payload_summary TEXT NOT NULL, error_json TEXT, created_at TEXT NOT NULL
);
