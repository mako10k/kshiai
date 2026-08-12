CREATE TABLE IF NOT EXISTS public.battle_presentations (
  battle_id text NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  receipt_id text NOT NULL,
  sequence bigint NOT NULL,
  phase text NOT NULL,
  combat_turn integer,
  input_digest text NOT NULL,
  narrative_json jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (battle_id, receipt_id),
  UNIQUE (battle_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_battle_presentations_sequence
  ON public.battle_presentations (battle_id, sequence);
