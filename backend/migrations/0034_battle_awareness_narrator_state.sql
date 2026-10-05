-- R: Store publication-owned narrator cognition and exact dispatch-context evidence.
CREATE TABLE IF NOT EXISTS battle_awareness_narrator_state (
 battle_id TEXT PRIMARY KEY REFERENCES battles(id) ON DELETE CASCADE,
 last_published_sequence INTEGER NOT NULL CHECK(last_published_sequence >= 0),
 continuity_json TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
ALTER TABLE battle_awareness_narration_batches ADD COLUMN context_json TEXT;
ALTER TABLE battle_awareness_narration_batches ADD COLUMN context_digest TEXT;
