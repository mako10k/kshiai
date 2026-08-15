CREATE TABLE IF NOT EXISTS character_authoring_jobs (
  attempt_id TEXT PRIMARY KEY
    REFERENCES character_authoring_attempts(attempt_id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'claimed', 'completed', 'cancelled')
  ),
  claimed_by TEXT,
  claimed_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_character_authoring_jobs_pending
  ON character_authoring_jobs (status, created_at);
