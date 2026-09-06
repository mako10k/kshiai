domain KshiaiRepositionAppropriateRangePlanAudit:
  description |
    Hypothesis-first audit of the proposed plan to add a reposition action,
    appropriate-range bands, and failure-driven correction. The recorded
    defect is production v0.22.0-rc.4 battle
    btl_03de9bec1693c9fffce4335cc5ba84b5 and the same-card matches that
    finished with wait/defend substitution and frozen speech.

problem PLAN:
  |
    Does the proposed plan repair the recorded spacing lock without a new
    provider call, without overloading free_action, and without violating
    bound-asset, sequential-turn, or observer-safe contracts?

premise SAFETY:
  |
    Do not add a provider route, retry, fallback provider, phrase ban,
    extra analysis LLM, or a live CSAM/narration mix-in as part of this
    repair.

premise H1:
  |
    Hypothesis H1: a dedicated deterministic reposition action is the
    correct primitive because free_action positioning is unfinished and
    costs an adjudication LLM.

premise H2:
  |
    Hypothesis H2: prompt-only failure analysis is sufficient, because
    availableActions already drops out-of-range attacks so the model will
    stop requesting them.

premise H3:
  |
    Hypothesis H3: engine substitution of an illegal counterpart action
    to reposition is load-bearing, because the recorded loop requests
    basic_attack then executes defend, and lastActionResult describes the
    substituted defend.

premise H4:
  |
    Hypothesis H4: substituting line_of_sight_blocked to reposition is
    the same repair as out_of_range, because opening or closing always
    restores sight.

premise H5:
  |
    Hypothesis H5: one adjacent-area hop or one in-area rank change per
    beat is enough for the recorded 3-area arena inside one public turn.

premise H6:
  |
    Hypothesis H6: deploying the new substitution globally is safe for
    in-flight battles, because ActionKind is additive and old JSON still
    parses.

premise H7:
  |
    Hypothesis H7: character-definition action norms and later-bucket
    fallbacks will automatically admit reposition without an explicit
    allow-list change.

evidence E_BATTLE:
  |
    Production revision kshiai-api-00121-cik battle
    btl_03de9bec1693c9fffce4335cc5ba84b5 finished turn_limit 12, HP 109/109,
    maxHit 0%, winner b. Executed actions were wait 36 and defend 36.
    Requested counterpart strikes were substituted for target_unlocalized
    or out_of_range. pairRelations stayed separate_area, sight blocked,
    updatedTurn 0. Actors remained in area.3 and area.1. Speech unique
    lines were ellipsis, Mio's frozen affirmation, and a late sunlight line.

evidence E_SAME_CARD:
  |
    The two earlier post-promote Makoto/Mio battles and the pre-promote
    same-card battle repeated wait/defend/zero-hit. The cat match also
    stayed separate_area with blocked sight; free_action was attempted
    24 times with 5 accepted and 19 rejected.

evidence E_SAME_AREA_COUNTEREXAMPLE:
  |
    Stage battle btl_a90676928c9b47d618cc4812ccaf52ce spawned both actors
    in area.1 with pair distance near and sight clear. skill and
    basic_attack were accepted, HP reached 90/0, and speech varied per
    turn. Compact dialogue was bound; spacing was not the failing layer.

evidence E_WORLD_INIT:
  |
    docs/battle-world-model.md section 3: different areas initialize as
    separate_area, sight blocked, sound partial. Same structured area
    initializes as near with clear sight and sound. set_placement and
    set_pair_relation already exist on BattleWorldOperation.

evidence E_FREE_ACTION_GAP:
  |
    docs/battle-free-action-objectives.md lists pair relation and area
    state change paths as remaining work, not the accepted vertical
    slice. A free_action turn still spends a dedicated adjudication LLM.
    ActionKind has no move or reposition member.

evidence E_FILTER:
  |
    buildObserverSafeAvailableActions drops infeasible counterpart
    actions. revalidateCharacterAction substitutes rest/defend/wait.
    targetWorldFailure returns target_unlocalized when counterpart
    access is not coarse or clear, and out_of_range when pair distance
    is separate_area, out_of_scene, or beyond max reach.
    Source: packages/shared/src/action-feasibility.ts.

evidence E_REQUESTED_ATTACK:
  |
    The recorded battle stored resolution.requested.kind basic_attack or
    skill on beats that then executed defend. The bound intent was a
    counterpart strike, not wait. Terminal lastActionResult described
    the substituted defend posture, not the miss cause.

evidence E_DECISION_PATH:
  |
    later-bucket decideCharacterAction validates against availableActions
    then falls back with deterministicLaterBucketFallback, which prefers
    listed basic_attack else a non-wait non-reflect listed action.
    Expression nextAction is wait. sceneBeat reserved queues were empty
    on the finished snapshot. Source: backend/src/services/battle-service.ts.

evidence E_NO_MIN_REACH:
  |
    ActionFeasibilityConstraints has reach as a maximum only.
    There is no minReach. Default inferred basic_attack and skill
    constraints use reach same_area.
    Source: packages/shared/src/character.ts and action-feasibility.ts.

evidence E_NORMS:
  |
    When compilerInputsV2.actionNorms exist, availableActions are the
    intersection of feasibility output and evaluateCharacterActionNormsV2.
    An unknown kind is not automatically legal. lastAction parsing in
    buildCharacterDecisionContext enumerates wait/defend/rest/reflect/
    basic_attack/skill only.

evidence E_ADR:
  |
    ADR-0001 makes ordinary actions sequential. ADR-0003 binds asset
    revisions at battle creation. ADR-0016 consumes reserved actions
    across intra-turn beats and calls decideCharacterAction only on
    reservation miss or server reject. ADR-0017 keeps K=3 beats inside
    a public turn. ADR-0015+ require a Proposed .think/.md pair and
    owner acceptance before implementation.

decision D1 based_on H1, E_FREE_ACTION_GAP, E_WORLD_INIT, SAFETY:
  |
    H1 is supported. Reposition must be a deterministic engine action
    that emits set_placement and/or set_pair_relation. free_action stays
    the improvised object/posture path and is not the spacing primitive.

decision D2 based_on H2, E_FILTER, E_REQUESTED_ATTACK, E_DECISION_PATH:
  |
    H2 is rejected. Prompt-only repair is not sufficient. The recorded
    intents were counterpart strikes that executed as defend, and the
    agent lastActionResult described the substitute. The plan must treat
    engine substitution to reposition as the primary correction. It must
    also verify with a snapshot test whether basic_attack was listed in
    availableActions despite separate_area, because E_FILTER and
    E_REQUESTED_ATTACK currently disagree.

decision D3 based_on H3, E_REQUESTED_ATTACK, E_BATTLE:
  |
    H3 is supported. If the model still requests an illegal counterpart
    action, substitute reposition toward that action's band, not defend.
    Feed observer-safe cause and spacing into the existing decision
    frame without a new provider route.

decision D4 based_on H4, E_FILTER, E_WORLD_INIT:
  |
    H4 is rejected. line_of_sight_blocked can come from cover, exposure,
    or actor vision, not only separate_area init. Reposition substitution
    applies to out_of_range and target_unlocalized. Sight-blocked from
    objects stays its own reason unless the pair is also out of band.

decision D5 based_on H5, E_BATTLE, E_ADR:
  |
    H5 is only partly supported. The recorded arena is two hops.
    Beat 1 is reserved wait, leaving two hops in the same public turn,
    which can share an area at far. same_area melee then becomes legal
    next beat or next public turn. The plan must not promise in-band
    melee inside the same public turn as the first wait, and must still
    shrink in-area rank after joining.

decision D6 based_on H6, E_ADR, E_BATTLE:
  |
    H6 is rejected. Additive JSON parse is not enough. New substitution
    changes resolution semantics of in-flight battles. Bind a battle-owned
    spacing rule snapshot at creation. Older battles keep rest/defend/wait
    substitution.

decision D7 based_on H7, E_NORMS, E_DECISION_PATH:
  |
    H7 is rejected. Reposition must be added to ActionKind, lastAction
    naming, later-bucket fallback preference when spacing.relation is
    not in_band, and action-norm candidate mapping. Otherwise norms or
    fallbacks will keep picking defend.

decision FIX based_on PLAN, D1, D2, D3, D4, D5, D6, D7, SAFETY:
  |
    Keep dedicated reposition, appropriate min/max reach band, no new
    LLM route, and engine substitution for out_of_range and
    target_unlocalized. Amend the plan: do not fold generic LOS into
    reposition; bind spacing rules at battle creation; treat
    substitution as primary and prompts as secondary; add a snapshot
    test for why requested basic_attack existed; update norms/fallback/
    lastAction enumerations; state the two-hop plus wait-beat timing
    honestly. Implementation waits for Accepted ADR-0020.
