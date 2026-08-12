# v0.17.3 release preparation

Status: production deployment is authorized as the exact continuation of the
v0.17.2 production handoff. A new production observation battle remains
suspended.

## Release intent

v0.17.3 is a backward-compatible operational correction for the v0.17.2 Stage
acceptance workflow. It builds `@kshiai/shared` before loading the backend
narration worker and runs only the exact LLM-free receipt lifecycle fixture.

## Acceptance

- All workspace versions and the lockfile are exactly `0.17.3`.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact release
  commit merged to `main`.
- An annotated `v0.17.3` tag resolves to that commit and remains immutable.
- Stage runs with `narration_guarded`, dialogue projection override `none`, and
  `candidate-12-v2`.
- Stage proves the one-test narration receipt fixture, Cloud Tasks OIDC delivery
  to the tagged no-traffic revision, and records the exact backend revision and
  Worker version.
- Promote deploys those exact staged artifacts and passes production health,
  authentication, SSE, database, and error checks.
- Readback confirms 100% Cloud Run traffic, the Worker version, release record,
  and narration queue state without creating an observation battle.

## Database and rollback

There is no new migration. Migration `0015_pipeline_recovery_fencing.sql`
remains additive. Production v0.17.1 Cloud Run and Worker artifacts remain the
rollback targets until v0.17.3 promotion succeeds. The incomplete v0.17.2 Stage
revision is not eligible for partial promotion.
