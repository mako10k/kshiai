# ADR-0008: Battle-private character focus state

- Status: Proposed
- Date: 2026-08-13
- Decision owner: Product owner
- Related: ADR-0003; ADR-0004; `docs/character-focus-hypothesis-plan.md`; `docs/character-focus-hypothesis.pert`; `docs/battle-observation-kpis.md`; `docs/dialogue-context-compact-rca.llmthink.dsl`

## Context

The bounded v0.17.4 observation improved aggregate exact dialogue uniqueness,
but one character still produced only three unique lines out of nine and held
one exact line for four of that character's turns. The current compact
expression input includes broad observer-safe result and conversation material,
yet normal combat turns update only deterministic `ReactionStateV1` and rebuild
the expression brief from persisted prologue appraisal. There is no
normal-turn owner for a character's changing focus of attention.

Characters already have a canonical `focus` parameter. It is balance-clamped
and current battle state can change it through effects. Existing perception
code quantizes the character's own current focus into absolute and
base-relative reserve bands. Reusing those bands is preferable to sending raw
numbers to an expression model or inventing a second concentration statistic.

A decision is required before adding private state, changing its persistence,
or allowing the canonical combat parameter to affect expression context.

## Decision drivers

- Let small observer-relative changes become strong expression evidence without
  expanding every prompt with more broad scene prose.
- Preserve character fixation while allowing unsupported attention to decay.
- Distinguish what matters to a character from how effectively they can notice
  and hold it.
- Reuse the existing focus parameter without exposing raw mechanics or making a
  low-focus character produce low-quality prose.
- Keep action, mechanics, psyche reaction, expression, adjudication, and
  narration authority separate.
- Add no routine provider call, retry, phrase ban, or output-level speech rule.
- Bind all new behavior to an immutable battle policy generation.

## Considered options

1. Reorder the current compact JSON so recent exchanges appear last. This is a
   low-cost ablation arm, but it has no temporal owner, decay, or focus effect.
2. Add one LLM attention-planning call before every expression. This can author
   nuance but increases latency and cost and makes private state depend on a new
   failure path.
3. Add a deterministic, battle-private focus state selected from observer-safe
   deltas and modulated by existing focus bands. This is the proposed direction.
4. Reject, rewrite, or retry repeated speech. This optimizes surface wording,
   does not repair missing evidence selection, and is not proposed.

## Decision

The proposed direction is option 3, subject to the owner accepting this ADR and
the experiment protocol. Name the state `CharacterFocusStateV1` to distinguish
it from transformer attention and narrator camera focus.

`CharacterFocusStateV1` is server-private and battle-local. It contains at most
one primary and one secondary focus, bounded salience, the turn on which each
focus began, the last supporting evidence turn, and a bounded switch or hold
reason. A focus references retained observer-relative evidence; it does not
copy prose, assert a new fact, or become canonical world authority.

The deterministic focus transition consumes only:

- the character's prior focus state;
- the character's own `TurnObservationPacket` and perceived recent exchange;
- bounded `ReactionStateV1` projection;
- prior structured continuity choice or protective-hold category, not private
  free-form reasoning;
- the character's existing server-only absolute and base-relative focus bands.

It must not consume narrator text, opponent-private state, unperceived
canonical facts, raw parameter values, action-model output, or another
character's focus state.

The transition decays unsupported prior salience, scores fresh evidence for
novelty and character-relative relevance, applies bounded hysteresis, then
selects or retains focus. A character's own repeated utterance is not fresh
support for that same focus. A perceived counterpart response to it may be.

The existing focus parameter controls attention effectiveness only:

- absolute focus band contributes baseline detection capacity;
- base-relative focus band represents temporary impairment or enhancement;
- effectiveness changes weak-cue detection and optional secondary capacity;
- it does not choose the topic, set truth, force an action, determine
  persistence, or lower linguistic quality.

Expression receives an ID-free `CharacterFocusPacket` immediately beside the
fresh expression instruction. The broad compact input remains available for
identity, safety, and contradiction checks. The focus packet names only the
selected perceived change, its freshness and strength bands, and whether the
focus was held, switched, or decayed. Expression remains the sole author of
public wording.

New battles opt into a versioned focus-policy generation. Existing battles and
legacy states retain current behavior; no focus state is inferred from their
old prose. Missing or invalid focus input produces a deterministic no-focus
packet and no provider fallback.

This Proposed ADR authorizes no implementation, provider replay, staging
deployment, production change, or use of retained user battle data. Those
boundaries remain separate PERT owner gates.

## Consequences

### Positive

- Expression can react to a small fresh cue without treating the whole scene as
  equally salient.
- Unsupported conversational loops lose salience while deliberate fixation can
  remain explicit and inspectable.
- Existing focus changes can affect conversational resolution without leaking
  mechanics or adding a new parameter.
- The transition is replayable, bounded, and testable without an LLM.

### Negative and risks

- One focus state can oversimplify divided or ambiguous attention.
- Incorrect scoring can create rapid focus churn or excessive persistence.
- Coupling a combat parameter to expression can unintentionally reward high
  stats with better writing unless the quality/non-inferiority guard is strict.
- A local packet can over-amplify noise if freshness and evidence ownership are
  not validated.
- New private state and policy generation increase replay and migration scope.

## Compatibility and migration

- Store the policy generation in the immutable battle asset manifest governed
  by ADR-0003.
- Add focus state only to new opt-in battles. Parse older battles without it and
  do not synthesize history.
- Keep public DTOs, opponent inputs, narration inputs, action inputs, and
  canonical mechanics unchanged.
- Begin in deterministic offline and shadow modes. Authoritative expression
  projection is a later opt-in candidate after replay acceptance.
- A rollback disables the new projection for newly created battles; already
  bound battles keep their frozen policy unless a separate migration ADR is
  accepted.

## Verification

- Same bound state, focus bands, and perceived evidence produce the same state
  and receipt.
- Hidden or opponent-private facts cannot enter focus candidates or expression.
- Repeated self speech alone never refreshes focus evidence.
- Unsupported focus decays; a structured protective hold may remain without
  inventing freshness.
- Weak perceived cues are detected more often at higher effective focus, while
  strong-cue grounding and prose quality do not degrade at lower focus.
- Focus changes do not alter actions, mechanics, world state, winner, rating,
  narration authority, provider-call count, or retry behavior.
- A/B swap, replay, focus gain/loss, missing input, and legacy-state fixtures
  pass under the frozen policy generation.
- Blinded provider replay and separately authorized staging observation meet
  the thresholds in the experiment plan before any adoption decision.

## Implementation references

- Add implementation commits and evidence only after this ADR is Accepted.

