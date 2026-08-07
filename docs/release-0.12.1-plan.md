# Release 0.12.1 plan — representable environment proposal alignment

Date: 2026-08-07
Feature PR: #54, squash SHA `872ca3ae17350815508cfba44e9fc2988c140aaa`
Target: `v0.12.1`

## Scope

Release the one-point prompt-contract alignment selected by the retained
`v0.12.0` observation:

1. ask the non-authoritative supervisor for a battlefield-grounded cause and a
   persistent result representable as a new environment entity or a real
   location/active-state change;
2. exclude transient-only flicker, reflection, ripples, weather, sound, and
   mood unless they leave such a result;
3. let the existing reconciler use `worldBefore` and battlefield context to
   ground the cause without requiring a pre-committed proposal event; and
4. require an accepted environment decision to carry its matching qualifying
   canonical operation in the same response.

## Release gates

- [x] Feature PR #54 passed `validate`, `security`, `backend-image`, and
  `worker` and merged to `main` at `872ca3a`.
- [x] Local changes passed all 327 tests, root/deployment typecheck, production
  build, diff checks, and PERT analysis.
- [ ] Release PR versions every workspace and lockfile as `0.12.1`, adds dated
  changelog notes, passes the four required checks, and merges to `main`.
- [ ] Annotated `v0.12.1` resolves to the exact merged release commit, and
  `node scripts/verify-release.mjs v0.12.1` passes against the tag.
- [ ] `Stage release` creates and verifies one backend revision and Worker
  version from the tagged source.
- [ ] `Promote release` moves those exact successful Stage artifacts to 100
  percent, passes production smokes, and publishes the GitHub Release.
- [ ] After provider availability is confirmed, one protected persistent E2E
  battle is retained and its environment receipts are read back. Do not resend
  after another ambiguous or provider-availability failure.

## Operational boundary

- The environment world-process remains always enabled with no cohort switch.
- Server validation still rejects `accepted` without a qualifying operation.
  Rejected proposals remain private and produce no canonical fact, public
  event, effect key, or mechanical result.
- The release changes no schema, migration, secret, provider order, provider
  call count, direct environment mechanic, narrator output guard, or adaptive
  adjudication path.
- `v0.12.0` backend revision `kshiai-api-00045-dez`, image digest
  `sha256:cf880d55d2c5e3e8aea864bca40b1be3ae261716b69474aedbfa066d5ef0b493`,
  and Worker `dbc162ce-3b30-47dc-9370-f12a787f5f98` remain rollback targets.

## Observation decision

Compare accepted, `decision_rejected`, and `no_canonical_change` density with
the `v0.12.0` baseline of 0/8 accepted. For each accepted receipt, verify one
qualifying canonical operation, source ID, resolved event, revision increase,
and bounded following-turn effect keys; verify no same-turn HP linkage. Use
`OBS-20260807-02`, `OBS-20260807-06`, and `OBS-20260807-08` as scorecards.
Observe narration only where accepted canonical input naturally changes it;
standalone non-critical narrator work stays pending.
