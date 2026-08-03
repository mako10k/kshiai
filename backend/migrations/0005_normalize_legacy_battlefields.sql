UPDATE public.battles
SET state_json = jsonb_set(state_json, '{battlefield,category}', '"custom"'::jsonb)
WHERE state_json #>> '{battlefield,category}' = 'カスタム';
