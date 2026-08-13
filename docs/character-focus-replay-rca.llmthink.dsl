domain KshiaiCharacterFocusReplayRca:
  description "Root-cause analysis of the 2026-08-13 character-focus blinded replay"

problem RCA1:
  |
    The blinded replay did not meet the causal acceptance thresholds for the
    character-focus hypothesis. Arm C did not improve fresh-evidence grounding
    or semantic response enough over A, unsupported novelty and no-change
    restraint failed, and weak-cue sharp-versus-strained calibration was zero.
    The analysis must distinguish a false product hypothesis from an experiment
    that did not create or identify the intended attention contrast.

evidence OBS1:
  |
    The reconciled scores in
    docs/evidence/character-focus-replay-2026-08-13/ablation-summary.md are:
    A grounding 91.7 percent, semantic response 79.2 percent, unsupported
    novelty 27.8 percent, no-change restraint 58.3 percent; B 87.5, 79.2,
    38.9, and 66.7 percent; C 91.7, 87.5, 36.1, and 58.3 percent; D 95.8,
    87.5, 27.8, and 75.0 percent. Weak-cue sharp-minus-strained uptake was
    0.0 percent. C had 36 of 36 exact-unique outputs and repeat run one, but
    the semantic causal thresholds still failed.

evidence OBS2:
  |
    buildCharacterFocusAblationRequests constructs compactInput once per
    scenario. Every arm receives its complete turnObservation and the same
    psyche and expressionBrief. Arms B through D only append characterFocus
    and a foreground instruction. When D strained selects no primary, the
    exact weak cue remains plainly available in turnObservation. The prompt
    says broad compact input remains authoritative, so the model has no hard
    expression-selection boundary that makes a missed cue unavailable.

evidence OBS3:
  |
    Focus calibration is not a within-scenario counterfactual. Weak strained
    is S01 with Nagi and a subtle counterpart gesture, while weak sharp is S03
    with Tomori and a self result plus S05 with Hibana and an ambient change.
    Strong sharp and strong strained likewise use different scenarios and
    profiles. Cue type, character, scenario, and effectiveness therefore vary
    together, so their aggregate difference cannot identify an effectiveness
    effect.

evidence OBS4:
  |
    Most replay cases are isolated expression snapshots with one small, direct
    cue and little competing context. Arm A already grounds 22 of 24 eligible
    outputs. This is unlike the proposed low-salience broad battle context and
    leaves only two A failures against a threshold requiring at least a
    20-point improvement. With the same 24-item denominator, even a perfect C
    can improve grounding by only 8.3 points, so that threshold is
    mathematically unreachable. A's 19 of 24 semantic score makes the analogous
    20-point threshold pass only at a perfect 24 of 24. The fixture set therefore
    has a control ceiling and does not materially stress attention allocation.

evidence OBS5:
  |
    Persistent state receives few genuine opportunities to matter. Most
    scenarios have one fresh cue and no prior focus trajectory. Only a small
    subset exercises retention, hold, or decay. C exceeds B by 4.2 points in
    grounding and 8.3 points in semantic response, but this sparse single-turn
    design cannot distinguish state persistence from prompt or sampling noise.

evidence OBS6:
  |
    In S07 and S11, B has no focus while C and D foreground a retained prior
    counterpart result with freshness decaying or held. The foreground prompt
    only defines null primary as no new event; it does not say that held or
    decaying evidence is historical attention rather than a current change.
    Outputs then describe current movement, wind, or continued stillness. This
    makes the no-change failure consistent with ambiguous time semantics in
    the projection contract.

evidence OBS7:
  |
    The foreground instruction asks the line to materially respond to the
    selected change without separating literal observation, permitted
    character interpretation, and hypothesis. Reviewers found examples where
    an interval closing became footsteps, a weapon leaving a hand became a
    drop sound, placement, intent, or trembling, and gaze became duration or
    motive. Unsupported novelty rises from A's 27.8 percent to B's 38.9 and
    C's 36.1 percent, consistent with response pressure outrunning evidence.

evidence OBS8:
  |
    S10 gives D a clear counterpart approach as primary and a distant pebble
    change as secondary. Some outputs emphasize or embellish the secondary
    cue and miss the primary approach. Optional secondary capacity therefore
    adds a competing attractor without an enforceable primary-response rule.

evidence OBS9:
  |
    The story-oriented review reports that natural and character-consistent
    lines can still be dull paraphrases with little anticipation of the next
    move. Exact uniqueness misses recurring semantic templates such as footing,
    sand, heaviness, and presence. The present KPI set does not directly measure
    dramatic progression, character-specific transformation of evidence, or
    semantic-template repetition.

evidence OBS10:
  |
    The prepared record called for two human reviewers and prohibited an LLM
    judge, but that reviewer-class condition had been proposed by Codex and was
    never explicitly accepted by the product owner. After the owner explicitly
    requested two characterized LLM sub-agent reviewers, the amendment recorded
    the real authority and deterministic reconciliation. The generated outputs
    and thresholds were not changed.

decision RC1_IDENTIFICATION based_on RCA1, OBS1, OBS2, OBS3:
  |
    The zero weak-cue calibration does not falsify concentration-modulated
    attention. The replay neither isolated effectiveness within the same input
    nor prevented a supposedly unselected cue from remaining salient elsewhere
    in the prompt. Its primary root cause is an invalid causal contrast between
    the hypothesized attention mechanism and the tested prompt variants.

decision RC2_POWER based_on RC1_IDENTIFICATION, OBS4, OBS5:
  |
    The experiment also has insufficient task difficulty and longitudinal
    exposure. The observed control ceiling makes the grounding uplift threshold
    impossible and the semantic uplift threshold require a perfect treatment
    score, while single-turn cases underexpose the value of persisted focus. C's
    surface-diversity result is a useful signal, not evidence that persistent
    attention caused semantic improvement.

decision RC3_PROJECTION_CONTRACT based_on OBS6, OBS7, OBS8:
  |
    The adverse quality results have a separate proximate cause in the
    expression projection contract. It promotes historical and secondary cues
    without explicit temporal and evidential modality, while demanding a
    material response. This encourages present-tense continuation, causal or
    sensory embellishment, and displacement of the primary cue. It does not
    show that private focus state itself is harmful.

decision RC4_KPI_COVERAGE based_on OBS1, OBS9:
  |
    Existing safety, grounding, restraint, consistency, naturalness, and exact
    repetition KPIs are necessary but do not test the product claim that small
    changes produce interesting and character-specific dramatic movement.
    Passing them alone would not establish that the dialogue became engaging.

decision RC5_REVIEW_AUTHORITY based_on OBS10:
  |
    The reviewer incident is an acceptance-governance defect, not a model-result
    cause. A proposed evaluator class was written as though it were a mutual
    contract without an explicit owner decision. The amendment correctly
    supersedes it, but future freezes must name the approver and the explicit
    decision before execution.

decision ROOT_CAUSE based_on RC1_IDENTIFICATION, RC2_POWER, RC3_PROJECTION_CONTRACT, RC4_KPI_COVERAGE, RC5_REVIEW_AUTHORITY:
  |
    The failed replay primarily diagnoses experiment construction, not a failed
    character-attention hypothesis. The intended low-salience-versus-foreground
    contrast leaked through turnObservation and effectiveness was confounded
    with scenario and character. Secondary causes are a ceilinged, mostly
    single-turn corpus and an expression contract that blurs current fact,
    retained attention, interpretation, and optional secondary evidence. KPI
    coverage and review authority are process gaps that limit acceptance but do
    not explain the generated semantic outcomes.

decision FIX_DIRECTION based_on ROOT_CAUSE:
  |
    Do not select B, C, or D for implementation from this replay. Revise the
    experiment first. Use paired counterfactuals where the same frozen scenario,
    character, evidence, and sampling plan run under sharp and strained bands.
    Make expression-selectable evidence an actual projection boundary: broad
    context may guard identity, safety, and contradiction, but an unselected
    weak cue must not remain as equally salient prose available for expression.
    Add distractor-rich cases with a preflighted non-ceiling control and
    multi-turn sequences where focus is retained, switched, decayed, and held.

decision PROJECTION_FIX_DIRECTION based_on ROOT_CAUSE:
  |
    Type each projected item as current observation, historical attention,
    allowed interpretation, or question-only hypothesis. Held and decaying
    items must never imply current continuation without fresh support. Require
    the primary item to anchor any factual response before a secondary item may
    contribute, and initially test without secondary capacity to isolate the
    primary effect. Permit surprise through intention, choice, or a question
    rather than invented world facts.

decision VALIDATION_DIRECTION based_on FIX_DIRECTION, PROJECTION_FIX_DIRECTION, RC4_KPI_COVERAGE, RC5_REVIEW_AUTHORITY:
  |
    Freeze a pilot corpus separately from the scored corpus, verify the intended
    selectable-evidence contrast mechanically, then score paired uptake and
    persistence effects. Retain the existing safety and grounding KPIs and add
    next-move anticipation, character-specific transformation, and within-scene
    semantic-template repetition. Record the owner-approved reviewer class,
    rubric, reconciliation, and thresholds before generation. A revised replay
    still authorizes neither product wiring, staging, release, nor production.
