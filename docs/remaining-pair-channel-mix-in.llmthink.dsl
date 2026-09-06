domain KshiaiRemainingPairChannelMixin:
  description |
    Follow-on to ADR-0022: remaining mix-in is pair.sight and
    pair.sound stored and read as a unique mutual channel.

problem MIXIN:
  |
    After engine revalidation stopped reading observer frames, where
    do unique world and two-person cognition still consent, and what
    must this slice stop reading?

premise SAFETY:
  |
    Do not add a provider call, retry, fallback, phrase ban, extra
    LLM, or CSAM mix-in. Do not delete pairRelations, distance, or
    orientations. Do not drop stored sight/sound keys from old JSON.
    Do not fast-forward hops. Mental-effect routing stays open.

premise H1:
  |
    Hypothesis H1: remaining mix-in is engine LOS, visual
    projection, and utterance hearing reading pair.sight/sound as
    unique mutual cognition.

premise H2:
  |
    Hypothesis H2: mechanical distance and body facing on the pair
    row are also cognition and must leave unique world now.

premise H3:
  |
    Hypothesis H3: this slice must delete sight and sound from the
    pair schema or the mix-in remains.

premise H4:
  |
    Hypothesis H4: physical LOS is organ vision, exposure, and
    object-derived actor vision. Observer visual/hearing access is
    projected from those unique facts plus placements, facing,
    illumination, and area noise. separate_area remains a unique
    placement fact, not a cognitive channel.

evidence E_ADR0022:
  |
    ADR-0022 Accepted: unique world versus two frames; engine must
    not read currentAccess; pair.sight/sound are not the two
    frames; relocating occlusion was later work. Owner now asked
    to tidy the remaining mix-in.

evidence E_READS:
  |
    targetWorldFailure uses pair.sight for line_of_sight_blocked.
    buildWorldCounterpartSlot uses pair.sight blocked/partial.
    utterance hearing uses pair.sound blocked/partial.
    Source: action-feasibility.ts, perception-projection.ts,
    utterance-perception.ts.

evidence E_WRITES:
  |
    createBattleWorldState and planRepositionTransition fill
    sight/sound from same-area vs not. In-area hops copy or clear
    the previous sight as if a hop restored seeing.
    Source: battle-world.ts, reposition-transition.ts.

evidence E_UNIQUE:
  |
    Organ vision/hearing, exposure, illumination, area noise, and
    object visionEffect/hearingEffect already exist on entities and
    areas. deriveBattleActorCausality folds object sensory effects
    into effectiveActorState. Battlefield topology edges have their
    own sight/sound as area geometry, not person-to-person
    cognition.

decision D1 based_on H1, E_READS, E_ADR0022:
  |
    H1 is supported. Stop reading pair.sight and pair.sound in
    engine LOS, visual counterpart projection, and utterance
    hearing.

decision D2 based_on H2, E_UNIQUE, SAFETY:
  |
    H2 is rejected. Distance is a mechanical band between two
    placements. Facing is objectively knowable. They stay on unique
    world.

decision D3 based_on H3, E_WRITES, SAFETY:
  |
    H3 is rejected as this slice. Old JSON and set_pair_relation
    still carry sight/sound. Keep the keys as a derived
    compatibility fill from presence and same-area. They are not
    authority. Deleting the keys is a later parse migration.

decision D4 based_on H4, E_UNIQUE, D1:
  |
    H4 is supported. Physical LOS uses organ vision including
    causality-derived vision, and exposure. Observer visual none
    comes from absence, separate_area, out_of_scene, hidden or
    invisible, or blocked/absent vision. Hearing uses organ
    hearing, distance, area noise, and utterance properties.

decision FIX based_on MIXIN, D1, D2, D3, D4, SAFETY:
  |
    Accept ADR-0023. Stop authority reads of pair.sight/sound.
    Fill those keys only as derived cache. Keep distance and
    facing. Do not delete the fields. Do not fast-forward hops.
