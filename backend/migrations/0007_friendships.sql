CREATE TABLE IF NOT EXISTS public.friendships (
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  friend_user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, friend_user_id),
  CHECK (user_id <> friend_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_friend
  ON public.friendships (friend_user_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
