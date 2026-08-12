ALTER TABLE public.battles
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_battles_revision
  ON public.battles (id, revision);
