# Release 0.12.0 plan — environment proposal to canonical world process

Date: 2026-08-07
Feature PR: #52, squash SHA `f12a32c94d51596c6376c67d733f00cce11e69ea`
Target: `v0.12.0`

## Scope

Release the next axial slice selected by the retained v0.11.1 observation:

1. reduce supervisor happenings to non-authoritative surface proposals;
2. send each proposal beside the current canonical world into the existing
   post-resolution semantic reconciliation call;
3. retain an explicit accepted, rejected, or skipped environment receipt;
4. emit a public situation event and following-turn situation values only after
   semantic and world transitions accept a grounded non-character entity
   presence, location, or active-state change; and
5. expose proposal, decision, resolved event, source, and effect links in the
   separate internal DAG.

## Release gates

- [x] Feature PR #52 passed `validate`, `security`, `backend-image`, and `worker`.
- [x] Local changes passed all 326 tests, root/deployment typecheck, production
  build, diff checks, and PERT analysis.
- [x] Feature squash-merged into `main` at `f12a32c`.
- [x] Release PR #53 versions every workspace and lockfile as `0.12.0`, adds
  dated changelog notes, passes the four required checks, and merges to `main`
  at `70d82eb84a284e3b1d60a01b4e6d727bac30e32e`.
- [x] Annotated `v0.12.0` resolves to the exact merged release commit, and
  `node scripts/verify-release.mjs v0.12.0` passes against the tag.
- [x] `Stage release` run 31171217758 creates and verifies backend revision
  `kshiai-api-00045-dez`, image digest
  `sha256:cf880d55d2c5e3e8aea864bca40b1be3ae261716b69474aedbfa066d5ef0b493`,
  and Worker version `dbc162ce-3b30-47dc-9370-f12a787f5f98`.
- [x] `Promote release` run 31171572264 moves those exact successful Stage
  artifacts to 100 percent, passes production smokes, and publishes the GitHub
  Release.
- [x] `Observe persistent E2E battle` run 31171739984 retains cross-account
  battle `btl_fdad569f54082b7981f9704f` and its 18 turn records, 17 canonical
  transitions, and eight environment receipts. The bounded second attempt run
  31172362244 stopped before battle creation on provider HTTP 402, so it adds no
  battle or pipeline sample and was not retried.

## Operational boundary

- The world-process path is always enabled. There is no cohort split or runtime
  feature flag for the current single-user product.
- Supervisor output no longer reaches same-turn combat mechanics. No proposal
  can directly assign damage, healing, disruption, winner state, or an
  unexplained combat bonus.
- Rejected, invalid, and unavailable proposals emit no proposal-derived public
  fact, sensory evidence, canonical environment operation, or following-turn
  situation value. Their proposal and disposition remain internal evidence.
- The slice reuses the reviewed combined semantic/sensory call and adds no
  provider request, migration, secret, environment variable, provider-order
  change, narrator guard/repair, general world engine, or expanded action
  adjudication.
- The current v0.11.1 backend revision `kshiai-api-00043-xen` and Worker
  `7f195b84-927b-4af2-8352-09739d9ed1be` remain rollback targets.

## Observation decision

For every observed environment proposal, compare receipt status/reason,
proposal source ID, resolved event, semantic and world revision changes, effect
keys, following-turn situation use, direct HP changes, and narrator input/output.
Score `OBS-20260807-02`, `OBS-20260807-03`, and `OBS-20260807-06` against the
same retained turn. A rejected/skipped proposal must create no resolved fact; an
accepted proposal must cross canonical state before any later effect. Leave
standalone narrator wording/repetition work pending unless the pipeline slice
itself supplies the needed input.

## Production observation result

- All eight observed supervisor proposals have an explicit receipt. Seven are
  `decision_rejected`; one is `no_canonical_change` after the model called a
  street-lamp change durable but emitted no qualifying operation. No accepted
  receipt was observed.
- Every rejected proposal has an empty `sourceEventIds` and `effectKeys`, a null
  `resolvedEvent`, no proposal-derived public situation event, and no semantic
  or world revision increase. HP losses on turns 3, 7, 10, and 16 remain linked
  to combat damage events rather than to the rejected environment proposals.
- This verifies the rejection safety boundary for `OBS-20260807-02` and prevents
  the rejected-path publication seen in `OBS-20260807-06`. It does not verify
  the accepted proposal -> canonical transition -> following-turn effect path.
- The next priority stays inside the environment pipeline: align supervisor
  proposal authoring and world reconciliation around a representable durable
  transition. Adaptive expanded adjudication remains the next alternative.
  Non-critical narrator symptoms remain pending; this release supplied no
  accepted canonical environment input with which to re-evaluate them.
