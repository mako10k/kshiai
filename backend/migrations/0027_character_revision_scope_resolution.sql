-- One immutable resolved scope per focused character run; the original owner source remains frozen.
ALTER TABLE public.character_focused_authoring_payloads
  ADD COLUMN resolved_source_json jsonb;
