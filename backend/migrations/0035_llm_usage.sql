-- R: Preserve one immutable physical LLM attempt and its observed usage without battle foreign keys.

CREATE TABLE IF NOT EXISTS llm_usage_attempts (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL,
  attempt_ordinal INTEGER NOT NULL CHECK (attempt_ordinal > 0),
  battle_id TEXT,
  provider TEXT NOT NULL,
  requested_model TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  snapshot_json TEXT NOT NULL,
  UNIQUE (call_id, attempt_ordinal)
);
CREATE INDEX IF NOT EXISTS llm_usage_battle_started_idx ON llm_usage_attempts (battle_id, started_at);
