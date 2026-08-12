CREATE TABLE IF NOT EXISTS asset_generations (
  asset_type TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation > 0),
  generation_id TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  content_json TEXT NOT NULL,
  content_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (asset_type, asset_id, generation)
);

CREATE TABLE IF NOT EXISTS asset_current_generations (
  asset_type TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation > 0),
  generation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (asset_type, asset_id),
  FOREIGN KEY (asset_type, asset_id, generation)
    REFERENCES asset_generations(asset_type, asset_id, generation)
);

CREATE INDEX IF NOT EXISTS idx_asset_generations_lookup
  ON asset_generations (asset_type, asset_id, generation DESC);
