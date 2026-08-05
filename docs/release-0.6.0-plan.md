# Release 0.6.0 plan — battle authority and fairness

Date: 2026-08-05
Feature PR: #24, squash SHA `45684d3674c4261277fd0d0c158f945f7ce6e410`
Target: `v0.6.0`

## Scope

Release the completed [`battle-fit-gap.pert`](battle-fit-gap.pert) pipeline:

1. presentation-only narration and character-authored actual speech;
2. profile-grounded, observer-relative initial and continuous perception;
3. coarse canonical world constraints, feasible actions, and causal effects;
4. side-neutral simultaneous or speed-ordered temporal resolution;
5. canonical turn-limit adjudication before presentation;
6. aligned prologue, turn, terminal, aftermath, and legacy migration contracts.

The complete fixed-fixture, boundary, fallback, and live-XAI record is
[`battle-fit-gap-acceptance.md`](battle-fit-gap-acceptance.md). Repository
cleanup and retained WIP are recorded in
[`battle-fit-gap-cleanup.md`](battle-fit-gap-cleanup.md).

## Release gates

- [x] Feature PR #24 passed `validate`, `security`, `backend-image`, and `worker`.
- [x] `T_ACCEPT` passed 268 repository tests, typecheck, build, llmthink, PERT,
  and live XAI primary evaluation.
- [x] `T_CLEANUP` aligned local main with exact origin/main, removed two proven
  obsolete local branches, and retained two ambiguous stashes.
- [ ] Release PR versions every workspace and lockfile as `0.6.0`, adds dated
  changelog notes, and passes the four required checks.
- [ ] Annotated `v0.6.0` tag resolves to the exact merged release commit.
- [ ] `Stage release` succeeds and records immutable backend revision and Worker
  version evidence.
- [ ] The protected `production` environment is approved separately.
- [ ] `Promote release` promotes the exact staged artifacts, passes smoke, and
  publishes the GitHub Release.

## Operational boundary

- No SQL migration, backfill, authentication, callback, secret, provider-order,
  or infrastructure change.
- Optional battle-state JSON additions remain readable by the prior revision.
- Legacy adaptation is deterministic read/next-save behavior and does not rewrite
  historical public narration.
- Staging may build and deploy no-traffic artifacts. Production traffic changes
  only in the separately approved promotion workflow.
