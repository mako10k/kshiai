# Release 0.6.1 plan — narrator recognition continuity

Date: 2026-08-05
Feature PR: #27, squash SHA `acb3bdadcc19e13b0453d4eea2ed47fd25945b5a`
Target: `v0.6.1`

## Scope

Release the completed narrator-recognition increment from
[`battle-social-narrator-continuity.pert`](battle-social-narrator-continuity.pert):

1. construct battle-scoped relationships, names, and forms of address;
2. keep A-side, B-side, and reader narrator cognition independent and bounded;
3. preserve an identified person while stable subject continuity remains;
4. let the narrator choose display labels and scene-grounded third-party speech
   without changing canonical character speech; and
5. return recognition updates through the existing narrator request only.

## Release gates

- [x] Feature PR #27 passed `validate`, `security`, `backend-image`, and `worker`.
- [x] The feature commit passed 277 repository tests, typecheck, build,
  `llmthink` audit, PERT validation, and `git diff --check` locally.
- [x] Feature and obsolete remote branch cleanup completed through squash merge.
- [ ] Release PR versions every workspace and lockfile as `0.6.1`, adds dated
  changelog notes, and passes the four required checks.
- [ ] Annotated `v0.6.1` resolves to the exact merged release commit.
- [ ] `Stage release` succeeds and records immutable backend revision and Worker
  version evidence.
- [ ] The protected `production` environment is approved separately.
- [ ] `Promote release` promotes the exact staged artifacts, passes smoke, and
  publishes the GitHub Release.

## Operational boundary

- No SQL migration, backfill, authentication, callback, secret, provider-order,
  or infrastructure change.
- Optional battle-state JSON additions remain readable by the prior revision.
- Legacy adaptation is deterministic read/next-save behavior and does not turn
  historical public narration into private cognition.
- Staging may build and deploy no-traffic artifacts. Production traffic changes
  only in the separately approved promotion workflow.
