CREATE TABLE IF NOT EXISTS public.battle_leases (
  battle_id text PRIMARY KEY REFERENCES public.battles(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  acquired_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_battle_leases_expires
  ON public.battle_leases (expires_at);

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'completed')),
  owner_id text NOT NULL,
  response_json jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, scope, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
  ON public.idempotency_keys (expires_at);

ALTER TABLE public.battle_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
