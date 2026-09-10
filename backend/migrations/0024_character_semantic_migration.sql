CREATE TABLE IF NOT EXISTS public.character_semantic_migration_attempts (
  migration_attempt_id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  character_id text NOT NULL,
  source_generation_id text NOT NULL REFERENCES public.asset_generations(generation_id),
  source_schema_version integer NOT NULL CHECK (source_schema_version = 2),
  source_content_json jsonb NOT NULL,
  source_content_digest text NOT NULL,
  natural_source_json jsonb,
  natural_source_digest text,
  natural_source_disclosure_contract_id text,
  allowed_source_paths_json jsonb,
  target_schema_version integer NOT NULL CHECK (target_schema_version = 3),
  migration_contract_id text NOT NULL,
  prompt_identity text NOT NULL,
  response_schema_identity text NOT NULL,
  provider_route text NOT NULL,
  model_identity text NOT NULL,
  compiler_capabilities_json jsonb NOT NULL,
  initial_request_digest text NOT NULL,
  created_at timestamptz NOT NULL,
  CHECK (
    (natural_source_json IS NULL
      AND natural_source_digest IS NULL
      AND natural_source_disclosure_contract_id IS NULL
      AND allowed_source_paths_json IS NULL)
    OR
    (natural_source_json IS NOT NULL
      AND natural_source_digest IS NOT NULL
      AND natural_source_disclosure_contract_id IS NOT NULL
      AND allowed_source_paths_json IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_character_semantic_migration_attempt_asset
  ON public.character_semantic_migration_attempts (character_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.character_semantic_migration_events (
  migration_attempt_id text NOT NULL
    REFERENCES public.character_semantic_migration_attempts(migration_attempt_id)
    ON DELETE CASCADE,
  event_sequence integer NOT NULL CHECK (event_sequence > 0),
  event_type text NOT NULL CHECK (event_type IN (
    'attempt_started', 'provider_request_recorded',
    'provider_request_succeeded', 'provider_request_failed'
  )),
  subject_id text NOT NULL,
  details_json jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (migration_attempt_id, event_sequence)
);

CREATE TABLE IF NOT EXISTS public.character_semantic_migration_provider_requests (
  provider_request_id text PRIMARY KEY,
  migration_attempt_id text NOT NULL
    REFERENCES public.character_semantic_migration_attempts(migration_attempt_id)
    ON DELETE CASCADE,
  parent_provider_request_id text
    REFERENCES public.character_semantic_migration_provider_requests(provider_request_id),
  request_ordinal integer NOT NULL CHECK (request_ordinal BETWEEN 1 AND 6),
  request_kind text NOT NULL CHECK (request_kind IN (
    'initial_generation', 'semantic_review', 'semantic_repair', 'semantic_rereview'
  )),
  request_digest text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (migration_attempt_id, request_ordinal)
);

CREATE TABLE IF NOT EXISTS public.character_semantic_migration_provider_receipts (
  provider_request_id text PRIMARY KEY
    REFERENCES public.character_semantic_migration_provider_requests(provider_request_id)
    ON DELETE CASCADE,
  outcome text NOT NULL CHECK (outcome IN ('succeeded', 'failed')),
  response_digest text,
  response_json jsonb,
  failure_code text,
  failure_detail text,
  accounting_json jsonb NOT NULL,
  finished_at timestamptz NOT NULL,
  CHECK (
    (outcome = 'succeeded'
      AND response_digest IS NOT NULL
      AND response_json IS NOT NULL
      AND failure_code IS NULL
      AND failure_detail IS NULL)
    OR
    (outcome = 'failed'
      AND response_digest IS NULL
      AND response_json IS NULL
      AND failure_code IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.character_migration_preservation_capsules (
  capsule_digest text PRIMARY KEY,
  migration_attempt_id text NOT NULL
    REFERENCES public.character_semantic_migration_attempts(migration_attempt_id),
  source_generation_id text NOT NULL REFERENCES public.asset_generations(generation_id),
  target_generation_id text NOT NULL REFERENCES public.asset_generations(generation_id),
  capsule_json jsonb NOT NULL,
  byte_length integer NOT NULL CHECK (byte_length > 0 AND byte_length <= 262144),
  created_at timestamptz NOT NULL,
  UNIQUE (migration_attempt_id, target_generation_id)
);
