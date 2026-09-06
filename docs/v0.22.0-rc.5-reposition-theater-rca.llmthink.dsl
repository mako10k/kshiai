domain KshiaiV0220Rc5RepositionTheaterRca:
  description |
    Hypothesis-first RCA for post-v0.22.0-rc.5 matches that appear to
    spend the whole clock walking. The recorded case is production
    battle btl_2788b1aba227a7ecd768b75270676423 after Promote of
    Cloud Run kshiai-api-00123-wis.

problem RCA:
  |
    Why did a new spacingSchemaVersion=1 battle execute 38 reposition
    events, finish turn_limit 12 at HP 109/109 with zero damage, and
    still leave pairRelations at separate_area with updatedTurn 0?
    Is the product defect "one hop per beat is too slow", or did the
    world never accept the hop?

premise SAFETY:
  |
    Do not add a provider call, retry, fallback, phrase ban, extra
    analysis LLM, CSAM/narration mix-in, or a replacement observation
    as diagnosis. Do not treat prompt-only "stop walking" copy as the
    repair. Do not raise lizard baselines to hide new code.

premise H1:
  |
    Hypothesis H1: one adjacent hop or one in-area rank per action is
    too slow for a 3-area arena, so 12 public turns of movement is the
    intended ADR-0020 outcome and the fix is to fast-forward to the
    reach band in one action.

premise H2:
  |
    Hypothesis H2: simultaneous later beats make both fighters hop
    toward each other's start area, they swap, and they remain
    separate_area for the whole match.

premise H3:
  |
    Hypothesis H3: planRepositionTransition emits a join-at-far event
    but applyBattleWorldTransition rejects the operations, so the
    narrative hop is theatrical even inside one resolveTurn call.

premise H4:
  |
    Hypothesis H4: scene-beat bucket continuation drops worldState.
    Each beat plans from the spawn world, so every hop is "join the
    opponent's current field at far" and the persisted snapshot never
    leaves revision 0.

premise H5:
  |
    Hypothesis H5: even if the engine hop landed, end-of-beat semantic
    derive overwrites character.a/b placement and the fighter pair
    from stale semantic locations, restoring separate_area.

premise H6:
  |
    Hypothesis H6: battlefield topology is missing or does not connect
    the spawn areas, so hops are noops and the event text is a lie.

premise H7:
  |
    Hypothesis H7: the model prefers reposition over striking, so
    requested intents are reposition even after the pair is in band.

evidence E_BATTLE:
  |
    Production battle btl_2788b1aba227a7ecd768b75270676423, created
    2026-09-06T00:38:01Z on v0.22.0-rc.5, finished turn_limit 12,
    winner b, HP 109/109, spacingSchemaVersion 1. turnRecords 37.
    Executed wait 34 and reposition 38. Requested wait 34, skill 1,
    basic_attack 37. Outcomes accepted 34 and substituted 38.
    Substitution reasons target_unlocalized 17 and out_of_range 21.
    Event types include reposition 38, wait 34, utterance 26, damage 0.
    Every reposition summary is
    "相手のいる場へ踏み込み、遠い間合いを取った。"

evidence E_FINAL_WORLD:
  |
    Final worldState.revision is 0. pairRelations is one row
    character.a/character.b, distance separate_area, sight blocked,
    sound partial, updatedTurn 0. character.a placement scene area.2,
    character.b scene area.3. latestWorldTransition status applied,
    fromRevision 0, toRevision 0, operations empty.

evidence E_CANONICAL:
  |
    turnRecord canonicalTransition.world statuses: missing 1,
    skipped 24, applied 12. Applied rows still have empty operations
    and fromRevision=toRevision=0. No set_placement or
    set_pair_relation was retained on any beat.

evidence E_TOPOLOGY:
  |
    Frozen battlefield has three areas and four open topology edges:
    area.1 <-> area.2 <-> area.3. entryAreas a=area.1, b=area.3.
    Spawn snapshot places a in area.2 and b in area.3, which are
    adjacent on that topology. One legal hop can share area.3 at far.

evidence E_CONTINUATION:
  |
    BattleTurnEngineContinuationSchema is strict and, before this RCA,
    carried sideA/sideB/situation/events/actions but not worldState.
    resolveTurn on deferFinalize/stopAfterNextBucket returns
    state: input.state. resolveNextBattleTurnBucket returns
    state: input.state for a non-final bucket.
    materializeBattleStateAtBucketBoundary copies combatants and
    situation, not worldState.
    Production uses one bucket per beat via
    resolveNextBattleTurnBucket.
    Source: packages/shared/src/battle.ts and battle-engine.ts.

evidence E_APPLY_ORDER:
  |
    executeAction pushes the planned reposition event, then applies
    operations only if applyBattleWorldTransition returns ok and
    changed. A failed apply still leaves the join-at-far summary on
    the beat. Source: packages/shared/src/battle-engine.ts
    executeAction reposition branch.

evidence E_DERIVE:
  |
    After engine resolve, reconcileSemanticState derives a world
    transition from semantic entity locations and applies it onto
    resolvedState.worldState. For character.a/b it emits set_placement
    when semantic location labels differ, and set_pair_relation to
    near if same area else separate_area. That pair heuristic ignores
    engine in-area ranks (far/medium/contact).
    Source: packages/shared/src/battle-world.ts
    deriveBattleWorldTransitionFromSemanticState and
    backend/src/services/battle-service.ts after bucket loop.

evidence E_BAND:
  |
    Default inferred basic_attack reach is same_area. same_area
    includes far. ADR-0020 and the plan audit already stated that
    two hops plus a reserved wait beat can share an area at far,
    after which a same_area strike is legal on a later beat.
    Source: packages/shared/src/action-feasibility.ts,
    docs/adr/0020-reposition-and-appropriate-range.md.

evidence E_REQUEST:
  |
    Requested kinds on the recorded battle are wait, skill, and
    basic_attack. Reposition appears only as the substituted
    executed kind. The model was not choosing reposition as the
    bound intent.

decision D1 based_on H1, E_BATTLE, E_FINAL_WORLD, E_BAND, E_TOPOLOGY:
  |
    H1 is rejected as the producing mechanism of this match.
    The arena is one adjacent hop from the recorded spawn. A landed
    hop to shared far would put same_area strikes in band on a later
    beat of the same or next public turn. 38 identical join-at-far
    summaries with updatedTurn 0 is not a slow walk down the rank
    ladder.

decision D2 based_on H2, E_FINAL_WORLD, E_BATTLE:
  |
    H2 is rejected as the producing mechanism. A swap would still
    write pair updatedTurn and change at least one placement. The
    finished snapshot is spawn-shaped: area.2 vs area.3,
    separate_area, updatedTurn 0.

decision D3 based_on H3, E_APPLY_ORDER, E_BATTLE, E_CANONICAL:
  |
    H3 is only a contributing lie, not the primary persistence
    failure. The event is pushed before apply success, so a rejected
    apply can narrate a hop. The recorded summaries are specifically
    join-at-far, which is the planned success path, and canonical
    world ops are empty rather than rejected. Treat silent event
    emission as a secondary defect to close.

decision D4 based_on H4, E_CONTINUATION, E_FINAL_WORLD, E_CANONICAL, E_BATTLE:
  |
    H4 is supported and is the producing mechanism. Each beat
    rehydrates from input.state.worldState revision 0, plans a hop
    into the opponent's spawn field, narrates join-at-far, and
    discards the local world clone because continuation and the
    returned BattleState do not carry worldState. That matches 38
    identical summaries, empty canonical ops, and updatedTurn 0.

decision D5 based_on H5, E_DERIVE, E_FINAL_WORLD:
  |
    H5 is supported as a follow-on latch, not the first loss.
    While continuation drops world, semantic derive never sees a
    hopped fighter world, so it cannot be the first eraser.
    After H4 is repaired, the same derive will emit set_placement
    and a separate_area or near pair from stale semantic locations
    unless fighter spacing is treated as engine-owned.

decision D6 based_on H6, E_TOPOLOGY, E_BATTLE:
  |
    H6 is rejected. Topology is present and connects area.2 to
    area.3. The event text is the successful adjacent-join plan,
    not a missing-edge noop.

decision D7 based_on H7, E_REQUEST, E_BATTLE:
  |
    H7 is rejected. The bound intents are counterpart strikes.
    Reposition is the engine substitute for target_unlocalized and
    out_of_range, which stay true because the pair never updates.

decision FIX based_on RCA, D4, D3, D5, D1, SAFETY:
  |
    Repair ADR-0020 implementation, do not replace one-step with a
    time-skip as the diagnosis of this match. Carry worldState and
    latestWorldTransition on BattleTurnEngineContinuation; seed
    resolveTurn from that continuation; materialize them at bucket
    boundaries; return the mutated world on bucket stop. Emit a
    join/rank event only when apply ok and changed. After hops can
    land, keep semantic derive from overwriting character.a/b
    placement and the fighter pair. Fast-forward to band remains a
    separate product ADR; it is not required to explain
    btl_2788b1aba227a7ecd768b75270676423.
