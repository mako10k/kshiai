# Release 0.10.0 plan — agent pipeline DAG and narrator input brief

Date: 2026-08-07
Feature PR: #44, squash SHA `d89acf933d4da1e6cf83897afcdd7f948f7cf711`
Target: `v0.10.0`

## Scope

Release the smallest observable narrator-input improvement:

1. retain bounded Site A and Site B character-agent context, provider output,
   and accepted next-turn intent or current-turn speech for future turns;
2. retain narrator input, provider disposition and output, and public output;
3. render those stages as a per-turn DAG on the existing separate internal
   observation screen; and
4. replace the narrator model's overlapping full view with a role-labelled
   brief that separates resolved results, current state, and static background.

## Release gates

- [x] Feature PR #44 passed `validate`, `security`, `backend-image`, and `worker`.
- [x] Feature changes passed 320 tests, root and deployment typecheck, production
  build, diff checks, and both PERT checks before merge.
- [x] Feature squash-merged into `main` at `d89acf9`.
- [x] Release PR #45 versions every workspace and lockfile as `0.10.0`, adds
  dated changelog notes, passes the four required checks, and merges to `main`
  at `8a35ee0057dfd397b4449291b4f9ce0b6e320383`.
- [x] Annotated `v0.10.0` resolves to that exact merged release commit, and
  `node scripts/verify-release.mjs v0.10.0` passes against the tag.
- [x] `Stage release` run
  [31160973729](https://github.com/mako10k/kshiai/actions/runs/31160973729)
  creates backend image digest
  `sha256:05435c44d3a1d2abf30a6a5234dda6245e31b88f7b11a262aa067b3241d9c75f`,
  revision `kshiai-api-00038-xed`, and Worker version
  `8268dc74-9526-4f16-80a0-3a9cc6349ac3`, then passes deployment,
  authentication, SSE, R2, administrator-binding, and migration smokes.
- [x] `Promote release` run
  [31161359156](https://github.com/mako10k/kshiai/actions/runs/31161359156)
  moves those exact staged artifacts to 100 percent, passes production smokes,
  and publishes the
  [GitHub Release](https://github.com/mako10k/kshiai/releases/tag/v0.10.0).
- [x] `Observe persistent E2E battle` run
  [31161541235](https://github.com/mako10k/kshiai/actions/runs/31161541235)
  reuses both dedicated accounts and all fixed fixtures, retains cross-account
  battle `btl_19dcf0ea770b6263943c2703`, and reads back all 15 pipeline traces,
  the 14 narrator inputs and outputs, and 14 canonical transitions.

## Operational boundary

- There is no database migration, account-role change, provider change, new
  secret, or new environment variable.
- The normal battle UI is unchanged. The trace remains on the separately routed
  internal observation screen with the existing realm and role gates.
- Stored trace values use bounded application contracts; provider credentials,
  transport headers, raw HTTP envelopes, and hidden chain-of-thought are absent.
- The narrator keeps its existing single call and remains free to choose wording
  and emphasis. There is no new output claim guard, rejection, repair, retry, or
  mechanical authority.
- The prior `v0.9.0` backend revision `kshiai-api-00036-yew` and Worker
  `7bb7bc30-d34a-4517-bed5-2b9ff0a29371` remain rollback targets.

## Production observation

- Production readback reports revision `kshiai-api-00038-xed` at 100 percent;
  `/internal/observations` returns 200 and its unauthenticated API returns 401.
- The retained E2E battle finished at turn 14 with side B winning by
  incapacitation. Test-realm cross-account sharing passed and no general-realm
  fixture leakage was observed.
- Every turn retains Site A and Site B bounded input, provider status/output,
  and accepted output. Turns 1 through 14 also retain the narrator's exact
  role-labelled input brief, provider output, and public output.
- The trial's surviving phenomena are recorded as `OBS-20260807-01`,
  `OBS-20260807-03`, and `OBS-20260807-04` in
  [`battle-fit-gap-backlog.md`](battle-fit-gap-backlog.md). They did not trigger
  an interrupting guard or output-repair patch.
