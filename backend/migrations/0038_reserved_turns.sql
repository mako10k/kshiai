-- Reserved-turn pipeline v1; historical runtimes and battles are unchanged.
CREATE TABLE IF NOT EXISTS battle_reserved_turns (
  battle_id TEXT PRIMARY KEY REFERENCES battles(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  fencing_token INTEGER NOT NULL CHECK (fencing_token > 0),
  snapshot_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
