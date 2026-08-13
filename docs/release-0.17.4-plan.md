# v0.17.4 release preparation

Status: released, deployed, and observed successfully. This plan freezes the
completed exact guarded path; it does not authorize a second observation or a
pacing-policy decision.

## Release intent

v0.17.4 is a backward-compatible operational correction for the provider-call
telemetry gap found during the v0.17.3 production observation. It records and
atomically bounds physical provider attempts, keeps terminal narration attempts
visible after ownership is released, and requires exact run-bound ledger
reconciliation before accepting an observation.

## Acceptance

- All workspace versions and the lockfile are exactly `0.17.4`.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact release
  commit merged to `main`.
- An annotated `v0.17.4` tag resolves to that commit and remains immutable.
- Stage runs with `narration_guarded`, dialogue projection override `none`, and
  `candidate-12-v2`.
- Stage applies migration `0016_provider_operation_accounting.sql`, proves the
  provider-attempt ledger without an LLM, and records the exact backend digest,
  Cloud Run revision, and Worker version.
- Promote deploys those exact staged artifacts and passes production health,
  authentication, SSE, database, and error checks.
- Readback confirms 100% Cloud Run traffic, the Worker version, release record,
  and exact release SHA.
- One observation runs with 24 maximum advances and a 169-operation ceiling.
  Acceptance requires an exact battle/run binding, no reserved attempts, all
  attempts classified and terminal, by-layer totals equal to the ledger total,
  and narration receipts reconciled with physical attempts.

## Database and rollback

Migration `0016_provider_operation_accounting.sql` is additive: it adds an
optional immutable observation binding plus observation-run and provider-attempt
tables. The v0.17.3 application does not depend on or mutate those structures
and remains the application rollback target after the migration. Application
rollback does not remove the migration or observation evidence.

Token and monetary usage remain `null` when a provider does not return them;
the release must not convert unknown usage to zero. A separate conservative
price-bound decision remains outside this release.

## Completion evidence

- Release commit: `abb42e6b138b27f6f3ef075178d5d00b0b3bf151`
- Stage run: `31657704957`
- Cloud Run revision: `kshiai-api-00090-luh`
- Worker version: `4b25b139-bebf-49d3-9dc5-d057bafaf674`
- Promote run: `31658001263`
- Observation run: `31658142563`
- Observation evidence:
  [production-observation-0.17.4-2026-08-13.md](evidence/production-observation-0.17.4-2026-08-13.md)
