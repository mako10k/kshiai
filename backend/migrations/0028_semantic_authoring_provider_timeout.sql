ALTER TABLE public.semantic_authoring_provider_requests
  DROP CONSTRAINT IF EXISTS semantic_authoring_provider_requests_outcome_check;

ALTER TABLE public.semantic_authoring_provider_requests
  ADD CONSTRAINT semantic_authoring_provider_requests_outcome_check
  CHECK (outcome IN ('succeeded', 'failed', 'unknown_consumption', 'provider_transport_timeout'));
