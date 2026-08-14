CREATE TABLE IF NOT EXISTS battlefield_asset_states (
  battlefield_id TEXT PRIMARY KEY,
  compatibility_status TEXT NOT NULL CHECK (
    compatibility_status IN ('unsupported', 'upgrading', 'upgrade_failed', 'ready')
  ),
  current_generation_id TEXT,
  active_attempt_id TEXT,
  reason_code TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS battlefield_authoring_attempts (
  attempt_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  battlefield_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('create', 'revision', 'upgrade')),
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  source_text TEXT,
  source_digest TEXT NOT NULL,
  expected_generation_id TEXT,
  expected_content_digest TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'pending_structure', 'generating_structure', 'validating_structure',
    'generating_description', 'validating_description',
    'awaiting_owner_acceptance', 'committing', 'succeeded', 'failed',
    'discarded', 'expired'
  )),
  candidate_json TEXT,
  candidate_digest TEXT,
  assistant_message TEXT NOT NULL DEFAULT '',
  error_code TEXT,
  result_generation_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (owner_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_battlefield_authoring_owner_updated
  ON battlefield_authoring_attempts (owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_battlefield_authoring_asset
  ON battlefield_authoring_attempts (battlefield_id, updated_at DESC);
