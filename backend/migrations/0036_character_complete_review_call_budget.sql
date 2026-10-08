-- Accepted ADR0059: only the new character create/revise policy admits calls 9 and 10.
-- Existing run identities and all token/cost ceilings remain unchanged.
ALTER TABLE public.semantic_authoring_provider_requests
  DROP CONSTRAINT semantic_authoring_provider_requests_ordinal_check;
ALTER TABLE public.semantic_authoring_provider_requests
  ADD CONSTRAINT semantic_authoring_provider_requests_ordinal_check
  CHECK (ordinal BETWEEN 1 AND 10);

CREATE FUNCTION public.enforce_semantic_authoring_request_policy_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed_calls integer;
BEGIN
  SELECT CASE WHEN family = 'character' AND mode IN ('create', 'revise')
    AND policy_identity = 'character_complete_review_policy_v2' THEN 10 ELSE 8 END
    INTO allowed_calls FROM public.semantic_authoring_runs WHERE run_id = NEW.run_id;
  IF NEW.ordinal > COALESCE(allowed_calls, 8) THEN
    RAISE EXCEPTION 'SEMANTIC_AUTHORING_REQUEST_POLICY_LIMIT';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER semantic_authoring_request_policy_limit
BEFORE INSERT OR UPDATE OF ordinal, run_id ON public.semantic_authoring_provider_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_semantic_authoring_request_policy_limit();
