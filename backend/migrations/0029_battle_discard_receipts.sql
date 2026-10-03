-- R: Persist only the identity required to reject recreation of discarded battles.
CREATE TABLE IF NOT EXISTS public.battle_discard_receipts (
  battle_id text PRIMARY KEY,
  cutover_id text NOT NULL
);
