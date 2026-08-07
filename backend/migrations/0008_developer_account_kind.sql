ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_account_kind_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_account_kind_check
  CHECK (account_kind IN ('general', 'developer', 'test', 'e2e'));
