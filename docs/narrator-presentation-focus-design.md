# Narrator presentation-focus experiment design

- Status: Accepted for local implementation and bounded synthetic evaluation
- Date: 2026-08-13
- Decision owner: Product owner
- Governing architecture: [ADR-0006](adr/0006-terminal-snapshot-narration-delivery.md)
- Product direction: [Character focus and narrator presentation](character-focus-and-narrator-presentation-direction.md)
- Plan: [narrator-presentation-focus.pert](narrator-presentation-focus.pert)

## Objective

Test the smallest narrator-only version of the presentation-focus hypothesis:
can one deterministic, committed, public result selected immediately beside the
narrator instruction improve impact/release legibility without adding facts,
changing character context, or adding a routine provider call?

This experiment does not test audible warnings, action-name calls, reactions to
heard speech, pre-resolution anticipation, or character focus.

## Architectural fit

ADR-0006 already makes one combat narration request from an immutable committed
receipt and stores only a terminal presentation snapshot. The candidate changes
only the ephemeral request prepared for that existing call.

```text
NarrationTurnView
  -> existing NarrationTurnBrief
  -> deterministic PresentationFocusV1 (optional experimental projection)
  -> existing narrateTurn call
```

The selector reads only the ID-free, raw-free `NarrationCausalProjection`
already admitted to the narrator. It never reads canonical IDs, raw parameter
values, private character state, narrator history prose, static battlefield
background, or unstructured action descriptions when ranking candidates.

## Experimental activation

`narrateTurn` receives an optional internal mode:

```ts
presentationFocusMode?: "impact_release_v1";
```

The ordinary battle service does not set it. Therefore implementation and fixed
evaluation do not change current battle output. The candidate mode is used only
by explicit synthetic evaluation until a separate adoption decision.

The control and candidate share the same `NarrationTurnView`, style, model,
temperature, and output schema:

- control: current brief and current prompt;
- candidate: current brief plus `presentationFocus` and its bounded instruction.

## Projection contract

The projection contains exactly one primary item or is absent. It is a copied
view-safe fact, not an interpretation or a new event.

```ts
type NarrationPresentationFocusV1 = {
  schemaVersion: 1;
  phase: "impact" | "release";
  primary:
    | MechanicalConsequence
    | ActionResolution
    | SemanticChange
    | CausalEvent;
};
```

Candidate sources are limited to:

1. attributed mechanical consequence;
2. failed, partial, or substituted action resolution;
3. attributed or explicitly unattributed semantic change kind;
4. structured causal event.

The first version deliberately excludes:

- `currentState` and stable battlefield facts, because they are not changes;
- `continuingConditions`, because the current projection lacks a before/after
  distinction;
- unattributed `observedConsequences`, because they lack a safe target label;
- free-form `resolvedEvents` summaries from ranking;
- secondary focus.

## Deterministic priority

Selection is stable and input-order preserving after score comparison.

1. incapacitation or overkill mechanical result;
2. extreme/heavy mechanical result;
3. failed, substituted, or partial resolution;
4. solid/light/trace mechanical result;
5. semantic presence, location, condition, scene, visibility, identity, or
   other change in that order;
6. structured damage, heal, free-action, situation, status, parameter, defend,
   rest, wait, reflect, info, or utterance event.

`rest`, `wait`, and `reflect` select phase `release`; every other admitted
candidate selects `impact`. A successful action with no structured result does
not create a focus.

## Prompt contract

When present, `presentationFocus` is the narrator's single presentation
responsibility:

- make the selected committed result legible before optional surrounding
  detail;
- use the rest of the brief only for attribution, contradiction, continuity,
  and style;
- do not turn release into a new action, motive, relationship fact, or future
  commitment;
- do not infer a cause for explicitly unattributed change;
- do not repeat the selected fact merely to satisfy the instruction;
- do not add character speech.

The complete brief remains authoritative. Presentation focus cannot override or
expand it.

## Deterministic verification

- same input produces the same focus;
- exactly zero or one primary item is emitted;
- no ID, raw value, private field, static fact, or free-form ranking input enters
  the focus;
- higher-priority committed changes win independent of unrelated field order;
- release is limited to committed rest/wait/reflect evidence;
- absent experimental mode produces the previous request shape and prompt;
- mock and ordinary battle-service paths make no additional provider call and
  do not change public/canonical output.

## Bounded synthetic evaluation

Use paired fixed narrator views covering decisive mechanical change, recovery,
failed/substituted action, semantic environment change, competing committed
changes, quiet release, no structured change, and perspective-limited evidence.

The initial pilot may use at most:

- 8 fixed scenarios;
- 2 arms;
- 1 sample per arm in the initial pilot;
- 16 logical calls and 20 physical HTTP attempts;
- 200,000 total tokens under a conservative UTF-8-byte preflight bound;
- USD 0.25 estimated cost;
- xAI `grok-4.3` with `reasoning_effort: none`;
- no provider fallback and no content retry.

This is an exploratory pilot, not adoption acceptance. Raw arm identity is
hidden in the review packet. The packet and deterministic metrics are retained;
reviewer class and semantic reconciliation require an explicit owner decision
before a product-effect claim.

## Pilot metrics

Integrity guards:

- unsupported canonical fact: zero;
- private or hidden fact: zero;
- causal-order contradiction: zero;
- invented character speech: zero;
- ordinary battle output diff: zero.

Directional presentation measures:

- selected-primary grounding;
- impact success/failure/cost legibility;
- release adds bounded meaning without inventing development;
- semantic-template repetition;
- exact repetition;
- total narrator length and empty output.

The one-sample pilot can detect exact duplicates across the whole output set but
cannot estimate within-scenario stochastic repetition. A second sample is a
separate follow-up decision, not an automatic continuation of this run.

No threshold is permitted to be retuned after outputs are generated. The pilot
may justify a separately frozen scored experiment; it cannot authorize staging,
release, deployment, or production use.
