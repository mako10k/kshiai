-- Family-owned frozen inputs and final results; never intermediate checkpoints.
CREATE TABLE character_focused_authoring_payloads (
  run_id text PRIMARY KEY REFERENCES semantic_authoring_runs(run_id) ON DELETE CASCADE,
  source_json jsonb NOT NULL,
  result_json jsonb,
  created_at timestamptz NOT NULL,
  finished_at timestamptz
);
ALTER TABLE character_focused_authoring_payloads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON character_focused_authoring_payloads FROM anon, authenticated;
