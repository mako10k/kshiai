-- R: Retain the pre-creation encounter admission and result for one immutable battle identity.
CREATE TABLE IF NOT EXISTS battle_awareness_creation (
  battle_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  request_digest TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
