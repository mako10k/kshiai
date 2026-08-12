ALTER TABLE public.battle_narration_outbox
  ADD COLUMN IF NOT EXISTS delivery_generation integer NOT NULL DEFAULT 0;

ALTER TABLE public.battle_leases
  ADD COLUMN IF NOT EXISTS fencing_token bigint NOT NULL DEFAULT 1;
