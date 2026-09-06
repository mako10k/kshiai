domain KshiaiCanonicalWorldObserverCognition:
  description |
    Hypothesis-first analysis of the owner's principle: canonical
    world is unique and viewpoint-free; two-person cognitive
    relations live in two observer frames; physical effects are
    judged only through canonical state. The recorded mix-in is
    engine revalidation reading perception.currentAccess.

problem MIXIN:
  |
    Does the current battle engine judge physical counterpart
    actions through unique world facts, or does it let observer
    cognition consent with that unique world?

premise SAFETY:
  |
    Do not add a provider call, retry, fallback, phrase ban, extra
    LLM, or CSAM/narration mix-in. Do not delete pairRelations or
    ActionKind reposition in this slice. Do not fast-forward hops.
    Mental-effect routing stays undecided.

premise H1:
  |
    Hypothesis H1: observer-safe candidate listing may use the two
    perception frames. That is not mix-in. The character must not be
    offered a counterpart strike they cannot localize.

premise H2:
  |
    Hypothesis H2: engine revalidation and executeAction currently
    read counterpart.currentAccess as if it were unique world
    localization. That is mix-in. Physical misses must come from
    placements, mechanical distance, organ vision, and exposure.

premise H3:
  |
    Hypothesis H3: pair.sight and pair.sound on worldState are the
    two cognitive relations stored as one unique row. This slice
    must delete those fields or physical adjudication stays mixed.

premise H4:
  |
    Hypothesis H4: body orientation and eye direction may stay in
    unique world because they are objectively knowable. Mechanical
    distance bands between two placements may stay as unique
    physical spacing, not as cognition.

premise H5:
  |
    Hypothesis H5: production
    btl_162854a54de03aa54d93918d1b0feae1 labeled every substituted
    strike target_unlocalized because perception was none, even
    though unique placements existed in two areas. The hop noop
    remains the area-ID split; the reason code is the mix-in.

evidence E_OWNER:
  |
    On 2026-09-06 the product owner stated: canonical state is the
    unique viewpoint-free world; body facing and eye direction may
    live there; two-person relations constituted by perception do
    not; those relations are mutual cognition and may be two
    frames; physical effects are judged through canonical state;
    mental effects may later differ.

evidence E_FEASIBILITY_DOC:
  |
    docs/battle-action-feasibility.md draws observer-safe
    candidates from perception frames and revalidation from
    worldState. The prose then says the engine re-evaluates the
    same rules at execution, which collapsed the two paths.

evidence E_CODE:
  |
    targetWorldFailure returns target_unlocalized when
    perception.counterpart.currentAccess is not coarse or clear,
    before reading pair distance. revalidateCharacterAction spreads
    that perception into assess. executeAction sets hop
    unlocalized from the same access. Source:
    packages/shared/src/action-feasibility.ts and battle-engine.ts.

evidence E_LISTING:
  |
    buildObserverSafeAvailableActions uses perceivedAs labels and
    drops counterpart actions the observer cannot localize. That
    matches H1. Source: action-feasibility.ts and
    docs/battle-action-feasibility.md.

evidence E_BATTLE:
  |
    Production btl_162854a54de03aa54d93918d1b0feae1: requested
    skill/basic_attack, substituted reposition, reason
    target_unlocalized x36, perception currentAccess none,
    placements scene area.3 vs area.2, pair separate_area.
    RCA docs/v0.22.0-rc.6-reposition-noop-id-split-rca.llmthink.dsl.

evidence E_PAIR:
  |
    BattleWorldPairRelation stores one distance, one sight, one
    sound, and two orientations. Init writes sight blocked for
    different areas. Perception projection maps pair.sight and
    separate_area into inaccessibleCounterpartSlot. Engine LOS
    also reads pair.sight. Source: battle-world.ts and
    perception-projection.ts.

decision D1 based_on H1, E_LISTING, E_FEASIBILITY_DOC, E_OWNER:
  |
    H1 is supported. Keep observer-safe listing on the two frames.
    Do not offer a counterpart strike when currentAccess is not
    coarse or clear. Labels stay perceivedAs.

decision D2 based_on H2, E_CODE, E_BATTLE, E_OWNER, SAFETY:
  |
    H2 is supported and is the engine defect of this slice.
    Remove perception from assessCharacterActionFeasibility and
    from executeAction hop correction. Canonical target_unlocalized
    is missing or out-of-scene placement, or actor delirious.
    separate_area and in-area rank misses stay out_of_range.
    ADR-0020 substitution of those two reasons to reposition
    remains.

decision D3 based_on H3, E_PAIR, E_OWNER, SAFETY:
  |
    H3 is rejected as this slice. pair.sight/sound are a smell and
    must not be treated as the two cognitive frames, but deleting
    the fields now would rewrite projection, init, and hops.
    Record relocation of occlusion onto areas or objects as later
    work. Engine must not read currentAccess as if it were
    pair.sight.

decision D4 based_on H4, E_OWNER, E_PAIR:
  |
    H4 is supported. Unique world may hold placements, topology,
    body facing, eye direction, organ vision and hearing,
    exposure, and a mechanical distance band. Those are not
    observer cognition.

decision D5 based_on H5, E_BATTLE, D2:
  |
    H5 is supported. After this repair, the same match's
    requested strikes would revalidate as out_of_range, not
    target_unlocalized, and still substitute reposition. The
    area-ID hop noop is a separate repair.

decision FIX based_on MIXIN, D1, D2, D3, D4, D5, SAFETY:
  |
    Accept ADR-0022. Implement D1 and D2 in the current engine.
    Leave pair.sight/sound in place. Leave mental-effect routing
    open. Do not peel ADR-0021 substitution and do not
    fast-forward hops.
