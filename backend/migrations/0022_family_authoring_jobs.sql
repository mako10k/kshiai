CREATE TABLE IF NOT EXISTS battlefield_authoring_jobs (
  attempt_id TEXT PRIMARY KEY
    REFERENCES battlefield_authoring_attempts(attempt_id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  battlefield_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'claimed', 'completed', 'cancelled')
  ),
  claimed_by TEXT,
  claimed_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_battlefield_authoring_jobs_pending
  ON battlefield_authoring_jobs (status, created_at);

CREATE TABLE IF NOT EXISTS narration_style_authoring_jobs (
  attempt_id TEXT PRIMARY KEY
    REFERENCES narration_style_authoring_attempts(attempt_id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  narration_style_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'claimed', 'completed', 'cancelled')
  ),
  claimed_by TEXT,
  claimed_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_narration_style_authoring_jobs_pending
  ON narration_style_authoring_jobs (status, created_at);

ALTER TABLE owner_notifications
  ADD COLUMN IF NOT EXISTS asset_type TEXT NOT NULL DEFAULT 'character';
