// R: Define the portable private narrator cognition store independent of canonical battle facts.
export const awarenessNarratorStorageSchemaSql = `
CREATE TABLE IF NOT EXISTS battle_awareness_narrator_state (
 battle_id TEXT PRIMARY KEY REFERENCES battles(id) ON DELETE CASCADE,
 last_published_sequence INTEGER NOT NULL CHECK(last_published_sequence >= 0),
 continuity_json TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
`;
