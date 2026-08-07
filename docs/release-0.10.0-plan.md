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
- [ ] Release PR versions every workspace and lockfile as `0.10.0`, adds dated
  changelog notes, passes the four required checks, and merges to `main`.
- [ ] Annotated `v0.10.0` resolves to that exact merged release commit.
- [ ] `Stage release` creates immutable backend and Worker artifacts and passes
  deployment, authentication, SSE, R2, administrator-binding, and migration
  smokes.
- [ ] `Promote release` moves those exact staged artifacts to 100 percent,
  passes production smokes, and publishes the GitHub Release.
- [ ] `Observe persistent E2E battle` reuses both dedicated accounts and all
  fixed fixtures, retains a new cross-account battle, and verifies its pipeline
  DAG and narrator brief against the public narration.

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
- The current `v0.9.0` backend revision `kshiai-api-00036-yew` and Worker
  `7bb7bc30-d34a-4517-bed5-2b9ff0a29371` remain rollback targets.
