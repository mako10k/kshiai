// R: Store private unified runtime independently of historical awareness snapshots.
export const unifiedConsciousnessSchemaSql = `
  CREATE TABLE IF NOT EXISTS battle_unified_consciousness (
    battle_id TEXT PRIMARY KEY REFERENCES battles(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    fencing_token INTEGER NOT NULL CHECK (fencing_token > 0),
    snapshot_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;
