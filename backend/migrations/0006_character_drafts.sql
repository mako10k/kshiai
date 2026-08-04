CREATE TABLE IF NOT EXISTS public.character_drafts (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sheet_json jsonb NOT NULL,
  assistant_message text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_character_drafts_owner_updated
  ON public.character_drafts (owner_user_id, updated_at DESC);

ALTER TABLE public.character_drafts ENABLE ROW LEVEL SECURITY;
