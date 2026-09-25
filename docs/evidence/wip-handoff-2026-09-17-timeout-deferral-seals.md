# WIP handoff — cc304 / semantic authoring / Seal provenance (2026-09-17)

## Exact restart point

- Worktree: `/home/katsumata-m/.codex/worktrees/compact-psyche-repair-integration-kshiai`
- Branch: `codex/compact-psyche-repair-integration`
- Pre-handoff local HEAD: `e022fdc7c12b44a4296ee6df79c8d1b4db6876e3` (`Accept draft test evidence ADR`). On 2026-09-18, GitHub readback found the remote branch at `85c56478ab665c94c6c8695b6ec2c4ae7fef4a35`, one commit behind that local HEAD.
- This handoff was prepared when the owner requested preservation by handoff, one WIP commit, and push. No further Seal promotion, implementation, or test repair should be inferred from that request.
- Working-tree changes include earlier cc304, plan, ADR, and Seal-health WIP as well as the latest timeout and deferral changes. Preserve the whole state. On 2026-09-18, after being shown this complete scope, the owner explicitly confirmed one WIP commit containing all these changes and this handoff, followed by a push to the same-name origin branch.

## User outcome and current position

The larger goal is to make v2 characters usable in v3 through migration, with the shared structured-authoring foundation needed for generation, correction, and migration. The immediate authorized implementation slice fixed two behavior issues: a semantic-authoring provider transport timeout is recorded as a typed, durable outcome with accounting, and a character adapter's `propose_deferral` does not falsely report acceptance when no deferral was registered. The owner then requested provenance Seals for implementation and tests. That provenance work is incomplete; do not describe the changes or the tests as fully Seal-governed.

The current migration plan is `docs/character-semantic-migration-plan-revision-10.md` and `docs/character-semantic-migration.pert`. Prior test-purpose transition is recorded in `docs/evidence/test-purpose-transition-cc304-2026-09-16.md`. Seal-health context is recorded in `docs/evidence/seal-health-execution-consumers-2026-09-17.md` and adjacent evidence files.

## Implementation and verification state

- Timeout handling uses `provider.transportPolicy.timeoutMs`, records `provider_transport_timeout` and `provider_transport_unavailable`, retains reserved token/cost accounting, and does not blindly retry. SQLite schema handling and a new Postgres migration (`backend/migrations/0028_semantic_authoring_provider_timeout.sql`) are present in the worktree. The Postgres migration was not applied to a database.
- Character `propose_deferral` returns `accepted: false` with `deferral-not-registered` when the adapter did not register a deferral.
- Focused tests: 50 passed. `npm run typecheck` passed. `npm test` passed the currently eligible subset, but the test-authority selector disabled the four modified semantic-authoring test files listed below because their earlier Seal bindings are stale or source-diverged. Therefore the `npm test` result is not evidence that those changed files were admitted by the governed harness.
- An independent read-only code review of the two fixes reported no actionable defect. No runtime activation, deployment, database migration, merge, or release was performed.

## Seal provenance — what is and is not done

Eight new non-draft implementation Seals were published against the current structured-semantic-authoring design and ADR-0032 authority:

1. `implementation/authoring-timeout-contracts-20260917`
2. `implementation/authoring-timeout-ports-20260917`
3. `implementation/authoring-timeout-orchestration-20260917`
4. `implementation/authoring-timeout-execution-20260917`
5. `implementation/authoring-timeout-repository-20260917`
6. `implementation/authoring-timeout-durable-execution-20260917`
7. `implementation/authoring-timeout-revision-scope-20260917`
8. `implementation/authoring-timeout-character-worker-20260917`

The batch was interrupted during `implementation/authoring-timeout-sqlite-schema-20260917` for `backend/src/db.ts`. Its last observed state was an unsealed, non-draft candidate with a matching workfile and no head Seal; inspect its Cause Links before proceeding. Other intended implementation Seals (Postgres migration, scripted ports, and character deferral adapter) were not started. The four modified test files still lack new purpose-specific test provenance Seals:

- `backend/src/repositories/semantic-authoring.test.ts`
- `backend/src/services/semantic-authoring/adapters/character-v3.test.ts`
- `backend/src/services/semantic-authoring/conformance.test.ts`
- `backend/src/services/semantic-authoring/scripted-ports.test.ts`

Do not switch the test inventory to those refs until each test's assertions and exact upstream basis have been reviewed, linked, sealed, and checked for current source binding. A Seal records provenance, not semantic correctness or acceptance. The exact then-current authority heads were `design/structured-semantic-authoring-kernel-v1-current` (`9664f17a…`) and `acceptance/adr-0032-current` (`996c4d11…`); recheck freshness on resumption.

## Next authorized work boundary

The preservation request stopped optional Seal work here. On 2026-09-18, repository-start and work-time checks were repeated for the preservation step. After further resumption is separately instructed: inspect Git, SealGraph, and authority freshness; finish the SQLite candidate only if its binding and Causes are correct; create the remaining implementation Seals; review and seal the four modified test files under their actual governing purpose; update the selector inventory; then run SealGraph integrity, selector/harness checks, focused tests, typecheck, and the eligible full suite. Keep test admission and product acceptance distinct. Reassess current plan fit before continuing cc304 migration tasks.

For any GitHub remote command from this linked worktree, use the main checkout `/home/katsumata-m/kshiai` as the shared `secdat` domain and the repository-start prescribed `GH_TOKEN` injection, with a matching dry-run preflight. A local commit is not remote synchronization; compare the pushed remote SHA to local HEAD by readback.

## Limits of this handoff

This is a factual restart record, not an acceptance decision or a claim that the migration is complete. The WIP commit and remote push must be reported as complete only after they happen and their results are independently read back.
