# Release 0.11.1 plan — action-kind-specific proposal shapes

Date: 2026-08-07
Feature PR: #50, squash SHA `23787beca8c3cc5f7fb6d54ddc4f1a6db6bfd138`
Target: `v0.11.1`
Release PR: #51, squash SHA `dda132f121dfac5aa5cbde9fb4dfcf5331e34936`

## Scope

Release the smallest follow-up selected by the v0.11.0 production observation:

1. present `nextAction` as six explicit action-kind-specific JSON variants;
2. keep free-action explanation and subject fields out of standard actions;
3. preserve strict server validation, raw proposal receipts, accepted state and
   speech, mechanical authority, and narrator freedom; and
4. rerun the persistent E2E battle against the v0.11.0 baseline of 15
   `schema_invalid` proposals among 15 invoked lanes.

## Release gates

- [x] Feature PR #50 passed `validate`, `security`, `backend-image`, and `worker`.
- [x] Local changes passed 323 tests, root/deployment typecheck, production
  build, diff checks, and both PERT checks.
- [x] Feature squash-merged into `main` at `23787bec`.
- [x] Release PR #51 versions every workspace and lockfile as `0.11.1`, adds dated
  changelog notes, passes the four required checks, and merges to `main`.
- [x] Annotated `v0.11.1` resolves to the exact merged release commit, and
  `node scripts/verify-release.mjs v0.11.1` passes against the tag.
- [x] `Stage release` run 31167883195 creates and verifies backend revision
  `kshiai-api-00043-xen`, digest
  `sha256:77e21ea05126626c6dd7507cad442a27a6a7996b0ef491c98e8f2a3d64dca0b1`,
  and Worker version `7f195b84-927b-4af2-8352-09739d9ed1be` from the tagged
  source.
- [x] `Promote release` run 31168338300 moves those exact successful Stage
  artifacts to 100 percent, passes production smokes, and publishes the
  GitHub Release.
- [x] `Observe persistent E2E battle` run 31168486354 retains cross-account
  battle `btl_72bbc0ce65b40cc7ee290931` and reads back the complete proposal
  validation distribution from its pipeline traces.

## Operational boundary

- The prompt alignment is always enabled. There is no cohort split or runtime
  feature flag for the current single-user product.
- There is no database migration, new secret, environment-variable change,
  provider-order change, server-validator relaxation, or narrator-policy change.
- Invalid proposals remain visible and mechanically inert. A model deviation
  still produces a bounded server-owned rejection receipt.
- The prior v0.11.0 backend revision `kshiai-api-00041-huf` and Worker
  `cee5a0bd-7825-4ffb-a0d0-4f8821104074` remain rollback targets.

## Observation decision

Compare fulfilled provider lanes, accepted/rejected/omitted proposal receipts,
rejection reasons, accepted action kinds, resolved action diversity, latency,
and downstream narration. A lower `schema_invalid` rate is evidence for the
prompt contract; it is not by itself evidence that environment world-process
or expanded adjudication is complete. Keep narrator-only wording work pending.

The production result removes the immediate schema-shape obstruction:

- v0.11.0: 15 fulfilled proposals, 15 `schema_invalid`, zero accepted;
- v0.11.1: 21 fulfilled proposals, 20 accepted, one rejected as
  `unavailable_instrument`, and one terminal lane skipped;
- all 20 resolved combat actions were accepted, spanning `wait`,
  `free_action`, `basic_attack`, `skill`, and `defend`; and
- the turn-8 water-pipe event was publicly resolved while both semantic and
  world transitions were skipped, selecting environment world-process ahead
  of expanded adjudication for the next axial slice.

This comparison does not schedule a narrator-only patch. Narration remains a
downstream observation surface for the selected pipeline work.
