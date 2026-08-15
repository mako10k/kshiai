CREATE TABLE IF NOT EXISTS owner_notifications (
  notification_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('authoring_ready', 'authoring_failed')),
  attempt_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  attempt_kind TEXT NOT NULL CHECK (attempt_kind IN ('create', 'revision', 'upgrade')),
  created_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE (attempt_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_owner_notifications_owner_created
  ON owner_notifications (owner_user_id, created_at DESC);
