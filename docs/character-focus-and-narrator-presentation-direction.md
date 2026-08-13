# Character focus and narrator presentation direction

- Status: Product direction recorded; design only
- Date: 2026-08-13
- Decision owner: Product owner
- Related: [ADR-0006](adr/0006-terminal-snapshot-narration-delivery.md),
  [ADR-0008](adr/0008-battle-private-character-focus-state.md),
  [character-focus experiment](character-focus-hypothesis-plan.md),
  [character-focus replay RCA](character-focus-replay-rca.llmthink.dsl)

This document consolidates the discussion after the character-focus replay. It
does not authorize character-focus adoption, implementation, provider calls,
staging, release, deployment, or production observation.

## Executive conclusion

The dialogue-repetition problem and the desired manga/anime-like presentation
should no longer be treated as one responsibility.

```text
simulation truth and character cognition
  -> character-perception projection
  -> character decision and diegetic speech

committed public events
  -> presentation-focus projection
  -> narrator, caption, cut-in, or inner-monologue presentation
  -> audience only
```

Character focus remains an unproven hypothesis for selecting what a character
notices. Narrator presentation is a separate, lower-contamination way to make a
small canonical change feel large to the audience. Presentation output must
never become canonical fact, character perception, private memory, conversation
history, or later action input.

The first candidate direction is therefore narrator-first, post-commit
presentation. Audible action calls and counterpart reactions to those calls are
deferred.

## 1. Starting observation

The working explanation for repeated dialogue was:

1. the scene changes too little from one expression opportunity to the next;
2. the character receives substantially the same grounds for speaking;
3. the model therefore selects substantially the same semantic response and
   often converges on the same wording.

This is stronger than a purely lexical explanation. A phrase ban or rewrite can
change the surface while leaving the scene, evidence, intention, and next move
unchanged.

The initial hypothesis was to keep broad battle context as a low-salience guard
while placing a character-relative change immediately beside expression. A
persistent focus state and the existing concentration/focus parameter would
control which weak cues are noticed or retained, without lowering prose quality.

## 2. What the replay established

The bounded replay did not support adopting any tested focus arm. It also did
not falsify the underlying idea that concentration can affect attention.

Confirmed experiment defects were:

- an unselected weak cue remained plainly available in `turnObservation`, so
  the foreground packet did not create a real evidence-selection boundary;
- sharp and strained effectiveness were compared across different scenarios,
  characters, and evidence types rather than as paired counterfactuals;
- the control grounding score was 22/24, making the planned 20-point grounding
  uplift mathematically unreachable;
- mostly isolated, single-turn fixtures gave persistent state little chance to
  matter;
- held and decaying attention lacked a clear historical-time contract;
- asking for a material response encouraged unsupported sensory, causal, and
  psychological elaboration;
- exact uniqueness and naturalness did not measure whether a line created
  dramatic movement or anticipation.

Consequently:

- no B, C, or D expression arm is selected;
- deterministic shadow state may remain evidence, but it is not product
  authority;
- a future focus experiment must use an actual selectable-evidence boundary,
  paired same-input focus bands, distractors, and multi-turn trajectories;
- the current discussion does not restart that experiment.

## 3. Assessment of action-scene conventions

The proposed conventions are valid as audience-facing narrative grammar even
when they are unrealistic as literal conversation:

1. anticipation: a name, warning, pose, declaration, or visual cue prepares the
   audience for an action;
2. impact and reaction: the result is emphasized again so its force, success,
   cost, and emotional meaning are legible;
3. release: a caption, narrator, or inner voice explains causality, character
   meaning, or a future hook after the immediate peak;
4. presentation time may expand a sub-second world event into several seconds
   of perceived reading or viewing time.

The useful sequence is:

```text
anticipation -> action -> impact -> reaction -> release
```

This is an editing contract for the audience. It is not evidence that every
character literally spoke at every phase, or that world time advanced by the
duration required to read the prose.

## 4. Why full diegetic simulation is deferred

If a character literally shouts a warning or technique name, the utterance can
affect the world. Other characters may hear it, infer intent, interrupt, evade,
or remember it. Correctly supporting that behavior requires at least:

- a committed pre-action speech opportunity;
- ordering and interruption semantics;
- observer-relative audibility;
- action-time or initiative cost;
- counterpart reaction opportunities;
- persistence and retry rules for the combined speech/action transaction.

That is a new simulation feature, not a presentation tweak. It materially
increases orchestration and state-space complexity.

The product owner therefore deferred:

4. audible action warnings or technique calls as real world actions;
5. counterpart reactions caused by hearing those calls.

These must not be approximated by inserting presentation instructions into the
character expression prompt.

## 5. Selected separation of responsibilities

### CharacterFocusProjection

Purpose: select what one character can notice and retain.

Allowed inputs:

- that character's observer-relative perception;
- perceived conversation;
- battle-private reaction and focus state;
- bounded server-only effectiveness bands.

Forbidden inputs:

- narrator prose or presentation directives;
- unperceived canonical facts;
- another character's private cognition;
- future results.

Status: hypothesis only; no expression adoption is authorized by the replay.

### PresentationFocusProjection

Purpose: select which committed public change the audience should feel most
strongly in one narration receipt.

Allowed inputs:

- immutable committed receipt facts;
- public causal links and before/after changes;
- frozen narration style and public participant identity;
- presentation-only continuity derived under ADR-0006.

Forbidden inputs:

- uncommitted proposals or future results;
- private character focus, memory, or hidden perception;
- narrator-authored facts from an earlier output as world evidence;
- any route that writes narrator output back to simulation.

Status: selected direction for the smallest next design and experiment.

## 6. Presentation channels

| Channel | Heard in the world | May affect simulation | Initial priority |
| --- | ---: | ---: | --- |
| Result/aftermath narrator | No | No | First |
| Caption or technique overlay | No | No | Later presentation option |
| Inner monologue | No | No | Later presentation option |
| Audible warning or technique call | Yes | Yes | Deferred |
| Counterpart response to an audible call | Yes | Yes | Deferred |

Even when an inner monologue is derived from private state, its generated prose
is presentation output. It must not be re-ingested as private memory or as a
fact the character has newly learned.

## 7. Time contract

Three time domains must remain distinct:

| Time | Meaning | Authority |
| --- | --- | --- |
| World time | Canonical action and state-transition order | Simulation |
| Presentation time | Reading, camera, pause, caption, and narration duration | Presentation only |
| Narrative time | Retrospective explanation, memory, thematic meaning | Presentation only unless separately committed as cognition |

The initial slice uses only completed canonical receipts, so it can safely
emphasize impact and release. It must not author an apparent pre-action warning
from a prompt that already contains the result.

A genuine anticipation presentation would require a separately frozen,
result-free committed-intent snapshot. The current direction does not authorize
that new boundary. If later selected, it needs an ADR before implementation.

## 8. Minimal narrator-first candidate

The smallest useful candidate reuses the existing narration call and immutable
`NarrationTurnView`. It adds no routine provider call and no character input.

Conceptually:

```text
immutable committed receipt
  -> deterministic public change candidates
  -> one primary PresentationFocus
  -> existing narrator call
  -> one terminal presentation snapshot
```

Initial constraints:

- one primary committed change; no secondary focus;
- impact or release only;
- no phrase validator, content retry, or extra narrator call;
- source event/receipt identity retained internally for audit;
- broad input remains available for contradiction checking, but the prompt
  names the one presentation responsibility explicitly;
- narrator wording cannot create an action, outcome, perception, relationship
  fact, or future commitment;
- terminal output remains in the presentation read model governed by ADR-0006.

This direction deliberately shifts explanatory burden away from characters.
Characters need not repeat the state of the battlefield merely so the audience
can follow it.

## 9. Required evaluation

The next experiment must distinguish correctness from dramatic value.

### Integrity guards

- unsupported canonical fact rate: zero;
- private or unperceived fact leakage: zero;
- causal-order contradiction rate: zero;
- presentation-to-simulation writeback: zero;
- additional routine provider calls: zero;
- action, mechanics, winner, rating, perception, and cognition diffs: zero.

### Presentation KPIs

- primary-change grounding: narration materially presents the selected change;
- impact legibility: the audience can identify success, failure, or cost;
- release value: quiet beats add meaning or a bounded unresolved hook rather
  than restating the event;
- semantic-template repetition: repeated paraphrase structures are measured,
  not only exact strings;
- dramatic progression: the block changes audience expectation about what
  matters next without inventing a future action;
- character-speech burden: explanatory repetition in character dialogue does
  not increase.

Exact uniqueness remains diagnostic, not the primary success claim.

## 10. Decision and open boundaries

### Recorded product direction

- keep simulation truth, character cognition, and presentation separate;
- treat narrator output as audience-only and never re-ingest it;
- explore narrator-first impact/release presentation before adding new
  diegetic speech mechanics;
- defer audible action calls and reactions to them;
- do not adopt a character-focus expression arm from the completed replay.

### Not yet decided

- the exact `PresentationFocus` schema and scoring rule;
- whether the first experiment changes only the narrator prompt or also its
  public output shape;
- whether caption, overlay, and inner-monologue channels need separate assets;
- whether a future committed-intent receipt justifies anticipation narration;
- provider, model, sample size, reviewer class, thresholds, and cost ceiling
  for a new experiment.

If the first candidate only derives a bounded projection from the existing
immutable `NarrationTurnView`, ADR-0006 remains the governing authority. A new
ADR is required before adding a pre-resolution receipt, phase-internal beat
identity, new persistence ownership, or any presentation output that can affect
simulation.

## References

- [Generative Agents](https://arxiv.org/abs/2304.03442): dynamic retrieval of
  observations and memories for believable agents.
- [Inner Monologue](https://arxiv.org/abs/2207.05608): closed-loop environment
  feedback for LLM planning.
- [RECOMP](https://arxiv.org/abs/2310.04408): selective context augmentation,
  including an empty projection when retrieved material is not useful.
- [LongLLMLingua](https://aclanthology.org/2024.acl-long.91/): query-aware
  compression and placement of relevant long-context information.
- [Lost in the Middle](https://arxiv.org/abs/2307.03172): sensitivity to the
  position of relevant information in long contexts.
- [Action starring narratives and events](https://pmc.ncbi.nlm.nih.gov/articles/PMC4689435/):
  anticipation, peak, inference, and release in visual narrative structure.
