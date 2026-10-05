-- R: Persist immutable receipt coverage for awareness-v5 narration physical attempts.
CREATE TABLE IF NOT EXISTS battle_awareness_narration_batches (
  attempt_id TEXT PRIMARY KEY,
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  fencing_token INTEGER NOT NULL CHECK (fencing_token > 0),
  receipt_ids_json TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  status TEXT NOT NULL,
  reservation_id TEXT,
  request_digest TEXT,
  pricing_revision TEXT,
  maximum_usd REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_awareness_narration_batches_battle
  ON battle_awareness_narration_batches(battle_id, status);
