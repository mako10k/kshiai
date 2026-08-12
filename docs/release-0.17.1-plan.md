# v0.17.1 release preparation

Status: Stage passed. This document does not authorize production promotion or
a production observation battle.

## Release intent

v0.17.1 is a backward-compatible recovery patch for the v0.17.0 battle
observation pipeline. It packages the accepted RCA fixes from PR #101 and adds
an LLM-free exact-receipt lifecycle fixture plus a Cloud Tasks OIDC delivery
proof against the exact no-traffic Cloud Run revision.

## Stage acceptance

- All workspace versions and the lockfile are exactly `0.17.1`.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact
  release commit.
- The annotated `v0.17.1` tag resolves to that release commit.
- Stage applies forward-only migration `0015_pipeline_recovery_fencing.sql`.
- The Stage workflow first runs the exact-receipt worker fixture, proving
  ordered processing, generation fencing, and one generator call per receipt.
- It then creates one bounded transport smoke task and observes its exact
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

## Stage evidence

- Release commit and annotated tag target:
  `997d7223bb061072565c1f49ca1ba0c9c78eae35`
- Stage workflow: run `31591179714`, attempt 4, success
- Backend digest:
  `sha256:cb65e6105ff77aaf5da2502669544a1b5b9828bf4c5fe291b2b9f6c3b1a27f60`
- No-traffic Cloud Run revision: `kshiai-api-00085-juz`
- Immutable Worker version: `a572f9a8-e0d1-4895-9290-5421af4e77bb`
- Existing production revision `kshiai-api-00082-ceg` remained at 100% traffic.

The first attempts exposed missing deploy-account read permissions for the
queue state and Cloud Logging. Queue-scoped Cloud Tasks Viewer and project Logs
Viewer were added and read back before attempt 4. Attempt 3 had already
delivered the bounded task with HTTP 200; it failed only while reading the
success log. The workflow now orders migrations before revision deployment to
avoid a no-traffic instance briefly starting against the previous schema.
