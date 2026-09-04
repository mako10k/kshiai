domain KshiaiDialogueActivationAuthorityAudit:
  description "Root-cause analysis of effective dialogue activation ownership and plan drift"

problem P1:
  |
    Compact dialogue code, deployment override support, persisted operator
    settings, immutable battle snapshots, and several overlapping PERT plans
    each describe part of activation. Their recorded lifecycle states disagree,
    so implementation presence can be mistaken for current activation or
    completed observation acceptance.

evidence E_CURRENT_MAIN:
  |
    The GitHub API and release v0.21.7 independently bind current main to
    4d446e4e4459114dab9ac87ba2589040814224b4. The audit branch is
    a9ea6acebc9382b0b00c92e769e826461bb3d002 and is 13 commits ahead and 16
    commits behind that current main. Code conclusions use the verified main
    revision. Source: docs/evidence/dialogue-activation-authority-audit-2026-09-03.md.

evidence E_CODE_PRECEDENCE:
  |
    At current main, new-battle creation reads the persisted dialogue singleton,
    applies a non-null deployment override, snapshots the effective values, and
    writes a dialogue-pipeline asset generation. A missing singleton resolves to
    the runtime legacy default. Ongoing battles use their snapshot; legacy
    battles without one fall back to the current singleton without reapplying
    the deployment override. Sources: backend/src/services/battle-service.ts,
    backend/src/repositories/dialogue-pipeline-settings.ts, and
    packages/shared/src/dialogue-pipeline.ts at 4d446e4.

evidence E_RECEIPT_GAP:
  |
    The battle manifest binds the effective snapshot, its revision, generation
    ID, and content digest. It does not bind an enum identifying default,
    persisted administrator setting, or deployment override as the authority
    source, and it does not bind the deployment revision that supplied an
    override. Source: packages/shared/src/battle.ts and
    backend/src/services/battle-service.ts at 4d446e4.

evidence E_DEPLOYED_ARTIFACT:
  |
    Release v0.21.7 binds commit 4d446e4, backend image digest
    sha256:430891fec8dfdefcf298ecfd59ddcf257aac982418788e8589494cde700170ad,
    Cloud Run revision kshiai-api-00116-doz, and Worker version
    d76ee358-8a3d-425a-8d07-a528233f6c08. Stage run 31943443643 selected override
    none and removed DIALOGUE_CONTEXT_PROJECTION_OVERRIDE; Promote run
    31943743584 routed the exact staged revision.

evidence E_LIVE_READBACK:
  |
    A bounded read-only production database transaction returned persisted
    dialogue-pipeline:global mode legacy at revision 5. Retained battle
    btl_ab2a5d9e1c161517ed019e0d5e3e4e83 binds legacy revision 5 to generation
    dialogue-pipeline:global:g1:b1bef75b445834cc and digest
    b1bef75b445834cc52d7ed770254a6ff1f8a9287b622c2ba4c7e247f91645650,
    with no focus rule and with a retained pipeline trace. No secret, user
    identity, prompt, or private battle content was retained.

evidence E_LIVE_UNKNOWN:
  |
    Direct Cloud Run service description could not run because the existing
    local gcloud session required interactive reauthentication. No login or
    account mutation was attempted. The health endpoint does not expose mode or
    focus state. The exact current live service revision, deployment override,
    and focus shadow enum therefore remain independently unobserved.

evidence E_DCL_IMPLEMENTED:
  |
    Current main contains the compact projection, thread separation, typed
    appraisal, staged override, matchup-memory separation, fallback cleanup,
    reappraisal implementation, and their regression tests. The relevant merged
    implementation commits are 9fe542f, 1215836, 5ba5201, 291b739, bf207e6,
    afe2eda, 15f7845, and efb3e7f.

evidence E_DCL_PLAN_DRIFT:
  |
    docs/dialogue-context-loop-fix.pert still labels DCL_IMPLEMENT active.
    Its later acceptance stages require a final immutable candidate, six fresh
    Stage battles, explicit production approval, and three protected production
    observations. The available rollout evidence does not establish those later
    final-candidate sets.

evidence E_FOCUS_PLAN_DRIFT:
  |
    docs/character-focus-hypothesis.pert presents CF_IMPLEMENT_OPT_IN_CANDIDATE
    after the completed replay, but
    docs/character-focus-replay-rca.llmthink.dsl decision FIX_DIRECTION says not
    to select B, C, or D from that replay and requires a revised experiment.

evidence E_PLAN_TOPOLOGY:
  |
    Global, dialogue-projection, dialogue-loop, character-focus, and recovery
    PERT documents carry overlapping lifecycle claims without a shared
    current-main evidence binding or a propagation owner. The recovery handoff
    remained on a branch that diverged while main accepted unrelated ADR-0015,
    ADR-0016, and ADR-0017, invalidating the handoff's planned ADR-0016 identity.

decision D_EFFECTIVE_STATE based_on E_CODE_PRECEDENCE, E_DEPLOYED_ARTIFACT, E_LIVE_READBACK, E_LIVE_UNKNOWN:
  |
    The release-bound v0.21.7 path resolves a new battle to legacy: the release
    removed its override and the currently persisted singleton is legacy
    revision 5. This is a high-confidence inference for an unmodified v0.21.7
    revision, not an independently observed current-live conclusion. Existing
    battles remain governed by their own snapshot, and an unsnapshotted legacy
    battle follows the compatibility fallback.
  annotation rationale:
    "high for the release-bound path; current live revision remains unknown"

decision D_DCL_RECONCILIATION based_on E_DCL_IMPLEMENTED, E_DCL_PLAN_DRIFT, D_EFFECTIVE_STATE:
  |
    DCL implementation is achieved and DCL_IMPLEMENT should be done. Normal
    compact activation and the later Stage and production observation acceptance
    remain unmet. Historical candidate deployment does not collapse those
    separate lifecycle claims.

decision D_ROOT_CAUSE based_on P1, E_PLAN_TOPOLOGY, E_DCL_PLAN_DRIFT, E_FOCUS_PLAN_DRIFT:
  |
    The plan drift was created by split lifecycle ownership: overlapping PERT
    documents and a branch-local handoff each retained their own frontier, while
    implementation, release, and later causal decisions advanced on main without
    a single current-main-bound reconciliation operation propagating outcomes to
    every affected plan and ADR identity. This mechanism produced stale active
    work, a causally invalid next focus task, and an ADR number collision.
  annotation rationale:
    "high"

decision D_CONTRIBUTING_CAUSE based_on E_RECEIPT_GAP, E_LIVE_UNKNOWN, D_ROOT_CAUSE:
  |
    The missing authority-source and deployment-revision fields in the battle
    receipt amplify ambiguity: a retained snapshot proves the effective value
    but cannot distinguish normal administrator authority from a revision-local
    override. This provenance gap contributes to activation uncertainty but did
    not create the stale PERT states.

decision D_ESCAPE_CAUSE based_on D_ROOT_CAUSE, E_PLAN_TOPOLOGY:
  |
    PERT document and DAG validation check grammar, topology, and scheduling,
    not correspondence with repository commits, release artifacts, runtime
    settings, or later RCA decisions. No current-main reconciliation gate caught
    the split-owner drift before the handoff was resumed. This is the escape
    cause, not the root cause.

decision D_CORRECTIVE_DIRECTION based_on D_ROOT_CAUSE, D_CONTRIBUTING_CAUSE, D_ESCAPE_CAUSE, D_DCL_RECONCILIATION:
  |
    Record DAF_AUDIT and DCL_IMPLEMENT as done, preserve activation and
    observation as separate unfinished states, and replace the colliding ADR
    pointer with Proposed ADR-0018 at the audited current-main basis. Before any
    wiring, the owner must explicitly accept or revise one normal authority, the
    Stage-only override boundary, and an immutable receipt carrying effective
    mode, source enum, settings revision and content identity, plus deployment
    identity when an override supplies the value. Recheck the ADR namespace and
    port the artifacts onto current main before integration.

decision D_RECURRENCE_PREVENTION based_on D_ROOT_CAUSE, D_ESCAPE_CAUSE:
  |
    Future lifecycle reconciliation must begin from verified current main and
    compare every plan that asserts the same implementation, activation,
    observation, or adoption frontier. It must update only independently proven
    states, preserve unmet gates, cite immutable evidence, and revalidate ADR
    identities before owner review. Structural PERT validation remains necessary
    but is never evidence that those external lifecycle claims are current.

pending P_CURRENT_LIVE_SERVICE:
  |
    The exact current live Cloud Run revision, deployment override enum, and
    focus shadow enum await a separately available read-only service descriptor
    or a new battle receipt that records their authority source.

pending P_OWNER_DECISION:
  |
    Proposed ADR-0018 has not been accepted. No code wiring, administrator
    setting change, Stage dispatch, provider call, Promote, or production change
    is authorized by this audit.
