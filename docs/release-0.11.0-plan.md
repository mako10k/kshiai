# Release 0.11.0 plan — character action-proposal boundary

Date: 2026-08-07
Feature PR: #48, squash SHA `671afdba8ee7219e883ff81641b565575d5c30f6`
Target: `v0.11.0`

## Scope

Release the smallest observable character action-proposal boundary:

1. retain the bounded model proposal before server validation;
2. keep valid character continuity and speech when only that proposal fails;
3. record whether the proposal was accepted or why it was rejected;
4. expose proposal, receipt, and accepted action as distinct internal DAG
   stages; and
5. run the persistent cross-account E2E battle and compare the result with the
   v0.10.0 baseline of 22 rejected side-turn provider results out of 30.

## Release gates

- [x] Feature PR #48 passed `validate`, `security`, `backend-image`, and `worker`.
- [x] Feature changes passed 322 tests, root and deployment typecheck,
  production build, diff checks, and both PERT checks before merge.
- [x] Feature squash-merged into `main` at `671afdba`.
- [x] Release PR #49 versions every workspace and lockfile as `0.11.0`, adds dated
  changelog notes, passes the four required checks, and merges to `main`.
- [x] Annotated `v0.11.0` resolves to release commit `54c9d19c`, and
  `node scripts/verify-release.mjs v0.11.0` passes against the tag.
- [x] `Stage release` run 31165178053 attempt 2 created backend revision
  `kshiai-api-00041-huf` and Worker version
  `cee5a0bd-7825-4ffb-a0d0-4f8821104074`
  from the tagged commit and passes migration, origin, health, authentication,
  administrator-binding, R2, and SSE smokes.
- [x] `Promote release` run 31166109223 moved those exact staged artifacts to
  100 percent,
  passes production smokes, and publishes the GitHub Release.
- [x] `Observe persistent E2E battle` run 31166408488 reused the two dedicated accounts and
  fixed fixtures, retains one new battle and observation, and reads back the
  proposal validation distribution from the new pipeline traces.

## Operational boundary

- There is no database migration, account-role change, provider-order change,
  new secret, or new environment variable.
- The action-proposal boundary is always enabled. There is no cohort split or
  runtime feature flag for the current single-user product.
- Invalid proposals remain observable but cannot become battle mechanics. The
  prior state is still used when no valid following-turn action is accepted.
- Stored candidates are depth-, entry-, array-, key-, and string-bounded model
  JSON. Provider credentials, transport headers, and chain-of-thought are not
  persisted.
- The narrator call and narrator output policy are unchanged. Any narrator
  improvement in the E2E result is incidental to the pipeline input becoming
  more complete.
- The current `v0.10.0` backend revision `kshiai-api-00038-xed` and Worker
  `8268dc74-9526-4f16-80a0-3a9cc6349ac3` remain rollback targets.

## Observation decision

After production promotion, use the persistent E2E evidence to select the next
pipeline axis. Compare fulfilled provider results, accepted/rejected/omitted
proposal receipts, rejection reasons, action diversity, causal grounding,
latency, privacy, and downstream narration. Record surviving phenomena without
an interrupting narrator-only patch, then choose environment/world-process work
or expanded adjudication from that evidence.

## Release and observation evidence

- Stage attempt 1 stopped before Worker-version creation on Cloudflare API
  error `10013`; backend revision `kshiai-api-00040-yev` remained at 0 percent.
  One failed-job rerun was issued only after the unchanged production target and
  the partial resources were read back.
- Successful Stage attempt 2 rebuilt the same tagged source as digest
  `sha256:3c0f63d3d230643f358732a4fdff38495a9ff8a6223e9a46e2ed14f11919445f`.
  This differs from attempt 1 and shows that a failed-job rerun rebuilds and
  retags the backend rather than reusing an already-built digest. Promote was
  bound only to the successful attempt's exact revision and Worker version.
- Production readback shows `kshiai-api-00041-huf` at 100 percent with that
  digest. Release `v0.11.0` was published at `2026-08-07T09:33:09Z`.
- Persistent E2E battle `btl_442a384a57ea0952f0d215d4` finished at turn 7
  and retained observation `github-31166408488-1`. All 15 invoked character
  lanes were provider-fulfilled with accepted state and speech, versus 22
  provider rejections among 29 invoked lanes in v0.10.0.
- All 15 v0.11.0 proposals were rejected as `schema_invalid`; accepted actions
  remained 0. This selects a bounded action-kind-specific proposal-shape
  alignment and another E2E trial ahead of the environment/adjudication choice.
