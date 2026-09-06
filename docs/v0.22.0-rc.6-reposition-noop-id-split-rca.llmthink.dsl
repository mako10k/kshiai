domain KshiaiV0220Rc6RepositionNoopIdSplitRca:
  description |
    Hypothesis-first RCA for post-v0.22.0-rc.6 matches that still look
    like movement-only. The recorded case is production battle
    btl_162854a54de03aa54d93918d1b0feae1 after Promote of
    v0.22.0-rc.6. Cloud Run logging was unavailable in this session
    (gcloud reauthentication failed); the operational log is the
    persisted turnRecords, world snapshot, perception frames, and a
    local replay of planRepositionTransition on those IDs.

problem RCA:
  |
    Why did a new spacingSchemaVersion=1 battle on rc.6 execute 36
    reposition events, finish turn_limit 12 at HP 109/109 with zero
    damage, and still leave pairRelations at separate_area with
    updatedTurn 0? Is this the same discarded-hop theater as rc.5,
    one-step walking that is too slow, target_unlocalized substitution
    over-firing, or a planner that never emits a hop?

premise SAFETY:
  |
    Do not add a provider call, retry, fallback, phrase ban, extra
    analysis LLM, CSAM/narration mix-in, or a replacement observation
    as diagnosis. Do not peel ADR-0021 rollback candidates as the
    first repair. Do not treat prompt-only "stop walking" copy, or
    fast-forward to band, as the diagnosis of this match.

premise H1:
  |
    Hypothesis H1: continuation still drops worldState, so this is
    the same rc.5 theatrical hop with a new event text.

premise H2:
  |
    Hypothesis H2: applyBattleWorldTransition rejects planned hops,
    so operations exist but the snapshot stays at revision 0.

premise H3:
  |
    Hypothesis H3: one adjacent hop is too slow for a 4-area linear
    arena, so 12 public turns of movement is the intended ADR-0020
    walk and the fix is to fast-forward to the reach band.

premise H4:
  |
    Hypothesis H4: battlefield topology is missing or blocked, so
    nextHop cannot find a neighbor.

premise H5:
  |
    Hypothesis H5: world spawn remaps authored areas onto a new
    area.1..N namespace from sorted semantic labels, while
    planRepositionTransition looks up input.state.battlefield.topology
    which still uses authored IDs. The two graphs share no vertex,
    so every hop is a noop.

premise H6:
  |
    Hypothesis H6: the model prefers reposition over striking, so
    requested intents are reposition.

premise H7:
  |
    Hypothesis H7: mapping target_unlocalized onto reposition is the
    producing lock, because perception currentAccess stays none even
    when a hop could land.

premise H8:
  |
    Hypothesis H8: 膠着打破 forces a strike in the event stream but
    revalidation still substitutes, so the stalemate breaker is a
    theatrical lie rather than an engine override.

premise H9:
  |
    Hypothesis H9: keepEngineWorldPlacement or semantic derive
    reverted a landed hop back to spawn.

evidence E_BATTLE:
  |
    Production battle btl_162854a54de03aa54d93918d1b0feae1, created
    2026-09-06T07:33:28Z after v0.22.0-rc.6 Promote, finished
    turn_limit 12, winner b, HP 109/109, spacingSchemaVersion 1.
    turnRecords 37. Executed wait 36 and reposition 36. Requested
    wait 36, skill 1, basic_attack 35. Outcomes accepted 36 and
    substituted 36. Substitution reasons are target_unlocalized 36
    and out_of_range 0. Event types include reposition 36, wait 36,
    utterance 26, damage 0. Every reposition summary is
    "<name> は間合いを変えようとしたが、動ける場所がなかった。"
    (マコト 24, 純真のミオ 12).

evidence E_FINAL_WORLD:
  |
    Final worldState.revision is 0. pairRelations is one row
    character.a/character.b, distance separate_area, sight blocked,
    sound partial, updatedTurn 0. character.a placement scene area.3,
    character.b scene area.2. latestWorldTransition status applied,
    fromRevision 0, toRevision 0, operations empty.

evidence E_CANONICAL:
  |
    turnRecord canonicalTransition.world statuses: absent 1,
    skipped 24, applied 12. Applied rows still have empty operations
    and fromRevision=toRevision=0. No set_placement or
    set_pair_relation was retained on any beat.

evidence E_TOPOLOGY:
  |
    Frozen battlefield "山奥の知る人ぞ知るラブホテル" has four
    authored areas: area.soft-tatami-flooring,
    area.low-lit-corridors, area.sound-proof-walls,
    area.private-open-air-baths. entryAreas a=soft-tatami-flooring,
    b=private-open-air-baths. topology has six open edges along that
    linear chain. World areas are a different namespace:
    area.1="low-lit corridors", area.2="private open-air baths",
    area.3="soft tatami flooring", area.4="sound-proof walls".
    Overlap of world area IDs with authored IDs is empty.
    Semantic locations still hold the display names
    "soft tatami flooring" and "private open-air baths".

evidence E_RC5_CONTRAST:
  |
    rc.5 battle btl_2788b1aba227a7ecd768b75270676423 used authored
    IDs area.1/area.2/area.3, which accidentally equaled the world
    remapping. Overlap was complete, planner emitted join-at-far,
    and continuation then discarded the hop. That match's perception
    ended currentAccess clear. This rc.6 match has no ID overlap and
    never emits a hop operation.

evidence E_PLANNER:
  |
    planRepositionTransition reads actor.placement.areaId from world
    and neighbors from battlefield.topology. adjacentAreas skips
    only movement==="blocked". Empty neighbor set returns
    repositionNoop with the recorded summary. Source:
    packages/shared/src/reposition-transition.ts.
    executeAction passes topology: input.state.battlefield?.topology
    and emits planned.event when operations.length===0. The
    apply-failure text is a different sentence
    ("間合いを変えられなかった。"). Source:
    packages/shared/src/battle-engine.ts.

evidence E_SPAWN:
  |
    createBattleState passes battlefieldAreaNames.get(entryAreas.*)
    i.e. the area display name, into semantic initialArea.
    createBattleWorldState then buildAreaMapping: unique semantic
    scene labels, sorted, assigned area.${index+1}. Authored IDs are
    not retained. Source: packages/shared/src/battle-engine.ts and
    battle-world.ts. stableBattlefieldId keeps LLM slug IDs such as
    area.soft-tatami-flooring when they already look like IDs.

evidence E_REPLAY:
  |
    Local replay of planRepositionTransition on the recorded world
    IDs plus authored topology returns summaryKind noop and the
    exact production sentence. The same planner with placements
    rewritten onto authored entry IDs returns area_hop to
    area.low-lit-corridors with pair still separate_area. One
    aligned hop is legal; the recorded match never took it.

evidence E_PERCEPTION:
  |
    Final perceptionFrameA/B turn 12, revision 0, counterpart
    currentAccess none, identityKnowledge identified, perceivedAs
    "…だと知っているが、現在は知覚できない", percepts empty.
    That is inaccessibleCounterpartSlot. World projection treats
    separate_area or sight blocked as unavailable. Source:
    packages/shared/src/perception-projection.ts.
    targetWorldFailure returns target_unlocalized before the world
    range check when currentAccess is not coarse or clear. Source:
    packages/shared/src/action-feasibility.ts.

evidence E_REQUEST:
  |
    Requested kinds on the recorded battle are wait, skill, and
    basic_attack. Reposition appears only as the substituted
    executed kind.

evidence E_STALEMATE:
  |
    Status event "膠着打破 — 両者は間合いを捨て、強制的に打ち合いへ
    踏み込む。" appears on public turns 1 through 12, 34 times.
    forceOffense only swaps the policy fallback to basic_attack
    when supervisor.passiveTurns>=2; revalidateCharacterAction still
    runs and substitutes. Source: packages/shared/src/battle-engine.ts.

evidence E_LOGS:
  |
    gcloud logging read against kshiai-api for this battle id failed
    in-session (reauthentication required). No Cloud Run stderr was
    available. The durable operational log is battles.state_json
    turnRecords plus the finished world and perception snapshots.

decision D1 based_on H1, E_BATTLE, E_FINAL_WORLD, E_CANONICAL, E_RC5_CONTRAST, E_LOGS:
  |
    H1 is rejected. rc.5 theater narrated join-at-far while dropping
    world. This match narrates the planner noop and never emits
    operations. latestWorldTransition applied empty ops 0→0 is not
    a dropped hop.

decision D2 based_on H2, E_PLANNER, E_CANONICAL, E_BATTLE:
  |
    H2 is rejected. Apply-failure uses a different summary. The
    recorded text is repositionNoop. Canonical ops are empty rather
    than rejected.

decision D3 based_on H3, E_REPLAY, E_TOPOLOGY, E_BATTLE, E_FINAL_WORLD:
  |
    H3 is rejected as the producing mechanism of this match. The
    arena is a 4-area chain, and an aligned hop is one step toward
    the counterpart. 36 identical noops with updatedTurn 0 is not a
    slow walk down that chain. Fast-forward to band remains a
    separate product ADR.

decision D4 based_on H4, E_TOPOLOGY, E_PLANNER:
  |
    H4 is rejected. Topology is present and open. The hop fails
    because world vertices are not the topology vertices.

decision D5 based_on H5, E_TOPOLOGY, E_SPAWN, E_PLANNER, E_REPLAY, E_BATTLE:
  |
    H5 is supported and is the producing mechanism. Spawn writes
    area.3 vs area.2. Topology names slug IDs. Neighbor lookup is
    empty. Planner returns noop. executeAction records that event
    without applying. World revision stays 0 for 12 public turns.

decision D6 based_on H6, E_REQUEST, E_BATTLE:
  |
    H6 is rejected. Bound intents are counterpart strikes and waits.
    Reposition is the engine substitute.

decision D7 based_on H7, E_PERCEPTION, E_BATTLE, E_REPLAY:
  |
    H7 is a follow-on latch, not the first loss. Perception none is
    the correct projection of spawn separate_area plus blocked
    sight, so target_unlocalized substitution is doing the ADR-0020
    job: turn an unlocalized strike into a hop. The hop then noops.
    Do not peel ADR-0021 candidate 2 until hops can land. After ID
    alignment, watch whether currentAccess stays none once the pair
    shares an area.

decision D8 based_on H8, E_STALEMATE, E_BATTLE:
  |
    H8 is supported as a contributing theatrical lie. 膠着打破
    fires throughout the match and still leaves substituted
    reposition noops. It does not bypass feasibility and did not
    create the ID split.

decision D9 based_on H9, E_CANONICAL, E_FINAL_WORLD:
  |
    H9 is rejected. There was no landed hop for derive or
    keepEngineWorldPlacement to revert. Empty applied ops cannot
    be an overwrite of a mutation.

decision FIX based_on RCA, D5, D7, D8, D3, SAFETY:
  |
    Repair the area ID contract, do not peel substitution and do
    not fast-forward as the diagnosis of
    btl_162854a54de03aa54d93918d1b0feae1. World area IDs must be
    the authored battlefield.areas[].id values. Fighters spawn on
    entryAreas IDs, not on sorted display-name aliases.
    planRepositionTransition must see the same vertices as
    battlefield.topology. Add a regression that a slug-id
    4-area battlefield hops instead of noop. After hops land,
    re-check perception access and 膠着打破; those are secondary.
    ADR-0021 continuation persistence stays; this match never
    produced a hop to persist.
