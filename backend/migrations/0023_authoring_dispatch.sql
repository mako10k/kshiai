ALTER TABLE character_authoring_jobs
  ADD COLUMN IF NOT EXISTS fencing_token INTEGER NOT NULL DEFAULT 0;

ALTER TABLE battlefield_authoring_jobs
  ADD COLUMN IF NOT EXISTS fencing_token INTEGER NOT NULL DEFAULT 0;

ALTER TABLE narration_style_authoring_jobs
  ADD COLUMN IF NOT EXISTS fencing_token INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS asset_authoring_outbox (
  outbox_id TEXT PRIMARY KEY,
  family TEXT NOT NULL CHECK (
    family IN ('character', 'battlefield', 'narration_style')
  ),
  attempt_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'dispatched', 'completed')
  ),
  delivery_attempts INTEGER NOT NULL DEFAULT 0,
  delivery_generation INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  dispatched_at TEXT,
  UNIQUE (family, attempt_id)
);

CREATE INDEX IF NOT EXISTS idx_asset_authoring_outbox_pending
  ON asset_authoring_outbox (status, created_at);

CREATE TABLE IF NOT EXISTS asset_authoring_scheduler (
  scheduler_id TEXT PRIMARY KEY,
  lock_version INTEGER NOT NULL DEFAULT 0
);

INSERT INTO asset_authoring_scheduler (scheduler_id, lock_version)
VALUES ('environment-global', 0)
ON CONFLICT (scheduler_id) DO NOTHING;

INSERT INTO asset_authoring_outbox
  (outbox_id, family, attempt_id, status, created_at)
SELECT 'authoring-outbox:character:' || attempt_id,
       'character', attempt_id, 'pending', created_at
  FROM character_authoring_jobs
 WHERE status IN ('pending', 'claimed')
ON CONFLICT (family, attempt_id) DO NOTHING;

INSERT INTO asset_authoring_outbox
  (outbox_id, family, attempt_id, status, created_at)
SELECT 'authoring-outbox:battlefield:' || attempt_id,
       'battlefield', attempt_id, 'pending', created_at
  FROM battlefield_authoring_jobs
 WHERE status IN ('pending', 'claimed')
ON CONFLICT (family, attempt_id) DO NOTHING;

INSERT INTO asset_authoring_outbox
  (outbox_id, family, attempt_id, status, created_at)
SELECT 'authoring-outbox:narration_style:' || attempt_id,
       'narration_style', attempt_id, 'pending', created_at
  FROM narration_style_authoring_jobs
 WHERE status IN ('pending', 'claimed')
ON CONFLICT (family, attempt_id) DO NOTHING;
