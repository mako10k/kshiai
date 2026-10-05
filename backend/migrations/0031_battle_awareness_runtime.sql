-- R: Persist fenced private runtime for new awareness-v5 battles.

  CREATE TABLE IF NOT EXISTS battle_awareness_runtime (
    battle_id TEXT PRIMARY KEY REFERENCES battles(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    fencing_token INTEGER NOT NULL CHECK (fencing_token > 0),
    runtime_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
