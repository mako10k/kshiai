CREATE TABLE IF NOT EXISTS public.battle_narration_entries (
  battle_id text NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  receipt_id text NOT NULL,
  sequence bigint NOT NULL,
  phase text NOT NULL,
  combat_turn integer,
  input_json jsonb NOT NULL,
  input_digest text NOT NULL,
  status text NOT NULL,
  active_attempt_id text,
  attempt_count integer NOT NULL DEFAULT 0,
  terminal_narrative_json jsonb,
  fallback_reason text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (battle_id, receipt_id),
  UNIQUE (battle_id, sequence)
);

CREATE TABLE IF NOT EXISTS public.battle_narration_leases (
  battle_id text PRIMARY KEY REFERENCES public.battles(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  fencing_token bigint NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.battle_narration_attempts (
  attempt_id text PRIMARY KEY,
  battle_id text NOT NULL,
  receipt_id text NOT NULL,
  fencing_token bigint NOT NULL,
  status text NOT NULL,
  provider text NOT NULL,
  model text,
  route text NOT NULL,
  http_attempts integer NOT NULL DEFAULT 0,
  token_count integer,
  estimated_cost_usd double precision,
  elapsed_ms integer,
  fallback_reason text,
  error_class text,
  started_at timestamptz NOT NULL,
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.battle_narration_events (
  battle_id text NOT NULL,
  event_sequence bigint NOT NULL,
  event_id text NOT NULL,
  receipt_id text NOT NULL,
  narration_sequence bigint NOT NULL,
  kind text NOT NULL,
  public_payload_json jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (battle_id, event_sequence),
  UNIQUE (battle_id, event_id)
);

CREATE TABLE IF NOT EXISTS public.battle_narration_outbox (
  outbox_id text PRIMARY KEY,
  battle_id text NOT NULL,
  receipt_id text NOT NULL,
  status text NOT NULL,
  delivery_attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  dispatched_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.battle_narration_retention (
  battle_id text PRIMARY KEY REFERENCES public.battles(id) ON DELETE CASCADE,
  pruned_through_sequence bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_battle_narration_entries_ready
  ON public.battle_narration_entries (status, battle_id, sequence);
CREATE INDEX IF NOT EXISTS idx_battle_narration_outbox_pending
  ON public.battle_narration_outbox (status, created_at);
