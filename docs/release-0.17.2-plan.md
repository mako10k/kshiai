# v0.17.2 release preparation

Status: preparing the exact release commit. Production deployment is authorized
by the repository owner; the separate production observation remains suspended.

## Release intent

v0.17.2 is a backward-compatible correction for the v0.17.1 narration
lifecycle, battle presentation, history visibility, and observation acceptance
gaps. It retains the existing authority boundaries and pacing candidate.

## Acceptance

- All workspace versions and the lockfile are exactly `0.17.2`.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact release
  commit merged to `main`.
- An annotated `v0.17.2` tag resolves to that commit.
- Stage runs the LLM-free exact-receipt fixture and proves Cloud Tasks OIDC
  delivery to the tagged no-traffic revision.
- Promote deploys the exact staged backend digest and Worker version, then
  passes production health, authentication, SSE, database, and error checks.
- The narration queue remains paused during deployment. Resuming it and running
  another paid observation are separate operations after production readback.

## Database and rollback

There is no new migration. Migration `0015_pipeline_recovery_fencing.sql`
remains additive. The pre-release v0.17.1 Cloud Run revision and Worker version
are the rollback targets and remain schema-compatible.
