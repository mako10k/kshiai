CREATE TABLE IF NOT EXISTS public.semantic_authoring_runs (
  run_id text PRIMARY KEY,
  attempt_id text NOT NULL UNIQUE,
  predecessor_run_id text REFERENCES public.semantic_authoring_runs(run_id),
  family text NOT NULL CHECK (
    family IN ('character', 'battlefield-preset', 'narration-style')
  ),
  mode text NOT NULL CHECK (mode IN ('create', 'revise', 'migrate')),
  owner_user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_asset_id text NOT NULL,
  source_generation_id text,
  source_content_digest text NOT NULL,
  source_payload_ref text NOT NULL,
  target_family text NOT NULL CHECK (
    target_family IN ('character', 'battlefield-preset', 'narration-style')
  ),
  target_version integer NOT NULL,
  adapter_identity text NOT NULL,
  policy_identity text NOT NULL,
  pricing_identity text NOT NULL,
  token_estimator_identity text NOT NULL,
  expected_current_generation_id text,
  status text NOT NULL CHECK (status IN (
    'pending', 'claimed', 'ready_for_review', 'needs_owner_answer',
    'failed', 'cancelled', 'expired'
  )),
  accounting_json jsonb NOT NULL,
  failure_receipt_json jsonb,
  fence_owner_id text NOT NULL,
  fencing_token integer NOT NULL,
  run_version integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_semantic_authoring_runs_owner
  ON public.semantic_authoring_runs (owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.semantic_authoring_provider_requests (
  request_id text PRIMARY KEY,
  run_id text NOT NULL
    REFERENCES public.semantic_authoring_runs(run_id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 8),
  reservation_json jsonb NOT NULL,
  request_digest text NOT NULL,
  provider_route text NOT NULL,
  outcome text CHECK (outcome IN ('succeeded', 'failed', 'unknown_consumption')),
  accounting_json jsonb,
  created_at timestamptz NOT NULL,
  finished_at timestamptz,
  UNIQUE (run_id, ordinal)
);

CREATE TABLE IF NOT EXISTS public.semantic_authoring_questions (
  question_id text PRIMARY KEY,
  run_id text NOT NULL
    REFERENCES public.semantic_authoring_runs(run_id) ON DELETE CASCADE,
  question_json jsonb NOT NULL,
  evidence_json jsonb NOT NULL,
  resumption_json jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('open', 'answered', 'superseded')),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.semantic_authoring_answers (
  answer_id text PRIMARY KEY,
  question_id text NOT NULL
    REFERENCES public.semantic_authoring_questions(question_id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES public.users(id),
  answer_json jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.semantic_authoring_final_candidates (
  final_candidate_id text PRIMARY KEY,
  run_id text NOT NULL UNIQUE
    REFERENCES public.semantic_authoring_runs(run_id) ON DELETE CASCADE,
  digest text NOT NULL,
  family_payload_ref text NOT NULL,
  obligation_coverage_json jsonb NOT NULL,
  reconciliation_receipt_identity text NOT NULL,
  compiler_receipt_identity text NOT NULL,
  disclosure_receipt_identity text NOT NULL,
  expected_current_generation_id text,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.semantic_authoring_commands (
  owner_user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  command_id text NOT NULL,
  run_id text NOT NULL
    REFERENCES public.semantic_authoring_runs(run_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (owner_user_id, command_id)
);
