# v0.17.1 release preparation

Status: Stage-only candidate. This document does not authorize production
promotion or a production observation battle.

## Release intent

v0.17.1 is a backward-compatible recovery patch for the v0.17.0 battle
observation pipeline. It packages the accepted RCA fixes from PR #101 and adds
an LLM-free Stage proof for Cloud Tasks OIDC delivery to the exact no-traffic
Cloud Run revision.

## Stage acceptance

- All workspace versions and the lockfile are exactly `0.17.1`.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact
  release commit.
- The annotated `v0.17.1` tag resolves to that release commit.
- Stage applies forward-only migration `0015_pipeline_recovery_fencing.sql`.
- The Stage workflow creates one bounded smoke task and observes its exact
  `smokeId` on the tagged Cloud Run revision.
- The smoke path performs no battle mutation and no LLM call.
- The workflow records the immutable backend digest, Cloud Run revision, and
  Worker version for later review.

## Database and rollback

Migration `0015` only adds `delivery_generation` to the narration outbox and
`fencing_token` to battle leases. It does not drop or rewrite v0.17.0 data.
Application rollback therefore restores the recorded v0.17.0 Cloud Run and
Worker artifacts without reversing PostgreSQL.

## Scope boundary

This release step ends after successful Stage evidence. Production promotion,
traffic changes, an LLM-backed observation battle, and resumption of
`T_OBSERVE_PRODUCTION_PACING` require separate direction.
