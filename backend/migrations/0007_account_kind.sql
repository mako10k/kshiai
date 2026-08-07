ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_kind text NOT NULL DEFAULT 'general';

DO $$
BEGIN
  ALTER TABLE public.users
    ADD CONSTRAINT users_account_kind_check
    CHECK (account_kind IN ('general', 'test', 'e2e'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_account_kind
  ON public.users (account_kind);
