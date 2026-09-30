-- R: Persist append-only cutover control revisions and fenced operation permits.
CREATE TABLE public.cutover_control_revisions (
  cutover_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  artifact_id text NOT NULL CHECK (artifact_id <> ''),
  phase text NOT NULL CHECK (phase IN ('closed', 'trial', 'open')),
  policy_json jsonb NOT NULL,
  operation_id text NOT NULL,
  operator_id text NOT NULL,
  previous_revision integer,
  recovery_mode text NOT NULL CHECK (recovery_mode IN ('snapshot-eligible', 'forward-only')),
  stopped_barrier_receipt_id text,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (cutover_id, revision),
  UNIQUE (cutover_id, operation_id),
  CHECK ((revision = 1 AND previous_revision IS NULL) OR
         (revision > 1 AND previous_revision = revision - 1))
);

CREATE TABLE public.cutover_control_active (
  singleton_id text PRIMARY KEY CHECK (singleton_id = 'active'),
  cutover_id text NOT NULL,
  revision integer NOT NULL,
  artifact_id text NOT NULL,
  FOREIGN KEY (cutover_id, revision)
    REFERENCES public.cutover_control_revisions(cutover_id, revision)
);

CREATE TABLE public.cutover_operation_permits (
  permit_id text PRIMARY KEY,
  cutover_id text NOT NULL,
  control_revision integer NOT NULL,
  binding_operation_id text NOT NULL,
  reservation_attempt_id text NOT NULL,
  request_digest char(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  actor_id text NOT NULL,
  operation_kind text NOT NULL CHECK (operation_kind IN ('http', 'task', 'provider', 'background')),
  method text,
  path text,
  battle_id text,
  background_kind text,
  owner_attempt_id text,
  candidate_digest char(64),
  state text NOT NULL CHECK (state IN (
    'reserved-not-sent', 'sending', 'result-accounting-pending',
    'settled', 'indeterminate', 'cancelled-before-send'
  )),
  result_digest char(64),
  reconciliation_receipt_id text,
  reconciliation_operation_id text,
  reconciliation_operator_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (cutover_id, control_revision)
    REFERENCES public.cutover_control_revisions(cutover_id, revision),
  UNIQUE (cutover_id, binding_operation_id, reservation_attempt_id),
  CHECK (candidate_digest IS NULL OR candidate_digest ~ '^[0-9a-f]{64}$'),
  CHECK (result_digest IS NULL OR result_digest ~ '^[0-9a-f]{64}$'),
  CHECK ((reconciliation_receipt_id IS NULL AND reconciliation_operation_id IS NULL
          AND reconciliation_operator_id IS NULL) OR
         (reconciliation_receipt_id IS NOT NULL AND reconciliation_operation_id IS NOT NULL
          AND reconciliation_operator_id IS NOT NULL))
);

CREATE INDEX cutover_operation_permits_barrier
  ON public.cutover_operation_permits (cutover_id, state);

REVOKE ALL ON public.cutover_control_revisions,
  public.cutover_control_active, public.cutover_operation_permits FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.cutover_control_revisions,
      public.cutover_control_active, public.cutover_operation_permits FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.cutover_control_revisions,
      public.cutover_control_active, public.cutover_operation_permits FROM authenticated;
  END IF;
END $$;
