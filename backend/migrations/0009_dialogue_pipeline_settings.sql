CREATE TABLE IF NOT EXISTS public.dialogue_pipeline_settings (
  id text PRIMARY KEY CHECK (id = 'global'),
  settings_json jsonb NOT NULL,
  revision integer NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by_user_id text REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.dialogue_pipeline_settings ENABLE ROW LEVEL SECURITY;
