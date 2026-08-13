ALTER TABLE public.battles
  ADD COLUMN IF NOT EXISTS observation_run_id text;

CREATE TABLE IF NOT EXISTS public.provider_operation_runs (
  run_id text PRIMARY KEY,
  observer_user_id text NOT NULL,
  battle_id text UNIQUE,
  taxonomy_revision text NOT NULL,
  projected_operations_json jsonb NOT NULL,
  approved_attempt_ceiling integer NOT NULL CHECK (approved_attempt_ceiling > 0),
  reserved_attempts integer NOT NULL DEFAULT 0
    CHECK (reserved_attempts >= 0 AND reserved_attempts <= approved_attempt_ceiling),
  status text NOT NULL CHECK (status IN ('active', 'completed', 'failed')),
  created_at timestamptz NOT NULL,
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.provider_operation_attempts (
  run_id text NOT NULL REFERENCES public.provider_operation_runs(run_id) ON DELETE CASCADE,
  logical_call_id text NOT NULL,
  attempt_ordinal integer NOT NULL CHECK (attempt_ordinal > 0),
  battle_id text NOT NULL,
  layer text NOT NULL,
  operation text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  status text NOT NULL CHECK (status IN ('reserved', 'succeeded', 'failed')),
  token_count integer,
  estimated_cost_usd double precision,
  elapsed_ms integer,
  error_class text,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  PRIMARY KEY (run_id, logical_call_id, attempt_ordinal)
);

CREATE INDEX IF NOT EXISTS idx_provider_operation_attempts_run_layer
  ON public.provider_operation_attempts (run_id, layer, operation);

CREATE UNIQUE INDEX IF NOT EXISTS uq_battles_observation_run
  ON public.battles (observation_run_id)
  WHERE observation_run_id IS NOT NULL;
