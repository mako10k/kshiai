domain KshiaiContinuationWorldDropRootRca:
  description |
    Follow-on RCA: why v0.17.0 bucket continuation discarded engine world
    mutations, and why adding worldState to the schema alone would leave
    the same class of defect.

problem RCA:
  |
    What producing contract dropped worldState from the durable bucket
    checkpoint, and what similar engine-owned mutations will still vanish
    if we only append this one field?

premise SAFETY:
  |
    Do not add a provider call, retry, fallback, phrase ban, extra LLM,
    or a live observation as diagnosis. Do not treat a one-field schema
    append as the root repair.

premise H1:
  |
    Hypothesis H1: reposition simply forgot to put worldState on an
    otherwise complete live snapshot. The drop is an ADR-0020 omission.

premise H2:
  |
    Hypothesis H2: BattleTurnEngineContinuation is an allow-list of
    v0.17 combatant mechanics (HP, actions, events, pendingEffects).
    New engine-owned fields are omitted by construction until someone
    remembers to add them.

premise H3:
  |
    Hypothesis H3: the causal pipeline assigned world writes to the
    post-bucket semantic/world reconciler, so engine hops were never
    in the checkpoint's job.

premise H4:
  |
    Hypothesis H4: returning state: input.state on bucket stop is the
    freeze-BattleState-until-finalize rule. Continuation is the only
    live snapshot, and BattleState is not a running engine image.

premise H5:
  |
    Hypothesis H5: bucket-resume tests compare combatants and events
    against a monolithic resolveTurn of HP actions, so a dropped world
    mutation cannot fail CI.

evidence E_CONTINUATION_INTRO:
  |
    BattleTurnEngineContinuationSchema and return state: input.state
    landed in f2199dc Prepare v0.17.0 release (#99), the causal pipeline
    release. The schema listed sideA/sideB, situation, finishers,
    actions, events, mechanicalEvidence, pendingEffects, and
    defensiveInstrumentMultipliers. worldState was absent.

evidence E_PIPELINE:
  |
    docs/current-battle-pipeline.md (2026-08-12): first engine bucket
    persists causalBucketCommit and engineContinuation; later bucket
    resolves without replaying the predecessor; semantic/world
    reconciliation runs after free-action, then the server updates
    semanticState and worldState. Engine continuation is drawn as
    mechanics. World is drawn as the post-bucket canonical step.

evidence E_CONTRACT:
  |
    docs/issue-98-causal-contract.md Phase-1 producer table: engine
    owns combat state, temporal result, and mechanical evidence.
    semantic/world reconciler owns validated state and observer facts,
    with first-bucket observation timing called out as explicit.
    first_bucket_committed next operation is "apply selected
    semantic/world observation boundary once".

evidence E_WORLD_DOC:
  |
    docs/battle-world-model.md: worldState is server-owned mechanical
    fact, not LLM prose. semanticState is the verified reconciler.
    The document forbids LLM text from writing world directly, but the
    implemented write path is still derive-from-semantic then apply.

evidence E_ADR0020:
  |
    ADR-0020 puts set_placement and set_pair_relation inside the
    accepted reposition action, i.e. inside executeAction, which runs
    during a bucket. That is a new producer for worldState on the
    engine edge that v0.17.0 did not checkpoint.

evidence E_RETURN:
  |
    resolveTurn on prepareOnly/deferFinalize/stopAfterNextBucket
    returns state: input.state even after mutating local worldState,
    sideA, and sideB. Combatant mutations survive only because they
    are copied onto the continuation and later materialized.
    World mutations had no such copy. Source:
    packages/shared/src/battle-engine.ts.

evidence E_TEST:
  |
    packages/shared/src/battle-engine.test.ts resumes a basic_attack
    then defend across buckets and deepEquals resumed.state to
    monolithic.state. Those actions change combatants, not pair
    distance. No test asserts a bucket-stop world revision, placement,
    or pair updatedTurn.

evidence E_SIMILAR:
  |
    pendingEffects is on the continuation because delayed mechanical
    effects were in the v0.17 HP path. latestWorldTransition,
    semanticState, and any future executeAction world op
    (object concretize, area hop from another kind, engine-owned
    exposure) are not. Free-action world application currently runs
    after the bucket loop on engineResolved.state, which is still
    the pre-turn BattleState when buckets stop early.

decision D1 based_on H1, E_CONTINUATION_INTRO, E_ADR0020:
  |
    H1 is rejected as the root. ADR-0020 omitted the field, but the
    checkpoint was already incomplete for engine world before
    reposition existed. Reposition revealed the hole; it did not
    create the contract.

decision D2 based_on H2, E_CONTINUATION_INTRO, E_RETURN, E_SIMILAR:
  |
    H2 is supported. Continuation is an allow-list, not a live engine
    snapshot. Survival of a mutation depends on whether its field was
    named in 2026-08-12. That is the class of similar defects.

decision D3 based_on H3, E_PIPELINE, E_CONTRACT, E_WORLD_DOC, E_ADR0020:
  |
    H3 is supported and is the authority contradiction. v0.17.0 made
    world a reconciler output after buckets. ADR-0020 made world an
    engine action effect during a bucket. battle-world-model.md says
    the server owns world, but the pipeline still lets semantic
    derive write it afterwards. Three documents, three producers,
    one field.

decision D4 based_on H4, E_RETURN, E_PIPELINE:
  |
    H4 is supported as the mechanism of the drop. Bucket stop freezes
    BattleState. Only continuation fields are live. World was mutated
    in a local let and then thrown away with the stack frame.

decision D5 based_on H5, E_TEST:
  |
    H5 is supported. CI cannot catch the class because the resume
    oracle uses actions that do not write world.

decision FIX based_on RCA, D2, D3, D4, D5, SAFETY:
  |
    Do not stop at appending worldState. Name the engine-owned live
    fields that must survive a bucket stop (combatants, finishers,
    pendingEffects, situation, worldState, latestWorldTransition, and
    any later executeAction mutation). Continuation must carry that
    set, or carry a single engine-live snapshot instead of a growing
    allow-list. materialize and finalize must restore the whole set.
    Semantic derive must not overwrite engine-owned fighter placement
    or pair. Add a resume test whose action writes world and asserts
    revision, placement, and pair after the next bucket. Future
    engine mutations fail that contract, not a forgotten field name.
