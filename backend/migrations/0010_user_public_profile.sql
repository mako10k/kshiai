ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS display_name text;

CREATE TABLE IF NOT EXISTS public.user_favorites (
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, target_user_id),
  CHECK (user_id <> target_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_target
  ON public.user_favorites (target_user_id);

CREATE TABLE IF NOT EXISTS public.friend_requests (
  from_user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (from_user_id, to_user_id),
  CHECK (from_user_id <> to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_to
  ON public.friend_requests (to_user_id);

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
