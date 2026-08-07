# Battle pipeline hypothesis-first production slice

Date: 2026-08-07 (Asia/Tokyo)

Status: Planned from `main` commit
`4c7ea5ccec31814a5fa38f1b9ea616ca50e764fe`. This document and its PERT plan
do not authorize a release, production observation, traffic change, or
effectful activation.

Execution order and authority live in
[`battle-pipeline-production-rollout.pert`](battle-pipeline-production-rollout.pert).

## Goal, decision hierarchy, and ordering

The primary goal is to implement and try the central battle-pipeline
hypotheses. The observation backlog is not the source of the implementation
scope.

Use this decision order:

1. Prefer ideas that form an axis of the pipeline hypothesis.
2. Among those axial ideas, implement the slice that can be patched into the
   current `main` with the smallest authority and persistence change.
3. Keep the first implementation conceptually complete but deliberately thin;
   it need not be the final generalized architecture.
4. Try and observe the implemented pipeline only after that vertical slice is
   connected.
5. Use open observation items as evaluation lenses. If the hypothesis slice
   improves an item, record that result. If the phenomenon continues, retain
   it for a later targeted fix. An observation does not preempt the hypothesis
   implementation by itself.

The target is not a perfect general world simulator. The first target is one
small, production-shaped path that proves the useful pipeline shape on current
`main` and raises causal grounding in the existing user experience.

```text
existing BattleState / worldState / semanticState
    -> bounded purpose-specific turn context
    -> existing engine and service owners
    -> bounded committed turn receipt
    -> existing narrator call
```

## Hypothesis priority and first slice

| Hypothesis idea | Axial importance | Patchability on current `main` | Decision for this cycle |
|---|---|---|---|
| Actual-turn source authoring and compact purpose-specific projection | High | High: pure shared code and existing turn boundaries can be reused | Implement first |
| Proposal-to-adjudication-to-committed-result causal receipt | High | High: existing requested/effective actions, events, and effects already provide anchors | Implement in the same vertical slice |
| One guarded consumer of the committed projection/receipt | High for user value | High: the existing narrator call is presentation-only | Use narration as the first consumer |
| Adaptive expanded adjudication | High in the broader hypothesis | Medium/low: the PoC used pre-authored detail and live grounding is unproved | Try after the first slice |
| Active world-process/environment transition engine | High in the broader hypothesis | Low: it changes proposal, adjudication, and effect ownership together | Keep as a next-axis candidate |
| General consistency detection/repair and independent canonical persistence | Supporting, not the first user-value axis | Low and migration-heavy | Defer until a tried slice shows the need |

This table, rather than the observation backlog, controls implementation
priority. It may be revised when implementation or trial evidence changes
patchability or axial value.

## First vertical slice

### Included

1. A minimal actual-turn source-authoring path that captures explicit values at
   their current owner stages and derives compact, purpose-specific context for
   the existing decision, adjudication, and narration owners. Only invariants
   needed by this slice are defined; a complete future contract is not a
   prerequisite.
2. A bounded causal turn receipt that connects requested and effective actions,
   committed events, mechanical effects, accepted world/semantic changes,
   observer-visible consequences, and unresolved current-turn consistency
   markers.
3. Deterministic validation which rejects unknown references, protected-field
   writes, unsupported causal claims, and visibility leaks. Unknown or invalid
   input falls back to the existing `main` behavior.
4. One reversible server-side boundary with at least `off` and
   `narration_guarded`; `shadow` may be retained when it materially accelerates
   comparison, but is not a prerequisite to trying the implemented concept.
5. Consumer wiring that first uses the receipt only to ground the existing
   narrator request. It must not add a normal-turn LLM call or let narration
   change actions, mechanics, state, winner, rating, or character cognition.
6. The minimum diagnostics needed to compare baseline and candidate behavior
   during the trial. Broader operational observability is added only when trial
   evidence justifies it. No prose, identity, prompt, or completion is durable
   telemetry.

### Explicitly deferred

- independent canonical-graph persistence or a database migration;
- whole-world consistency proofs or general-purpose repair;
- adaptive multi-step adjudication and recursive active world processes;
- new mechanical write authority;
- additional normal-turn LLM calls;
- bulk import of PoC evaluators, fixtures, evidence, or alternative runtime
  modules;
- character-decision effects, classifier training, model changes, and provider
  order changes.

These are separate future decisions. Deferral is intentional scope control,
not a claim that the concepts have no value.

## Current-main authority map

- Existing `BattleState`, `worldState`, validated `semanticState`, battle
  engine, and repositories remain authoritative.
- Character agents continue to propose one action from observer-safe inputs;
  the engine validates and resolves it.
- Existing semantic reconciliation remains the only semantic mutation owner.
- The narrator remains presentation-only and consumes only committed facts and
  the selected observer-safe view.
- XAI remains primary and OpenAI remains the ordered operational fallback.

The thin slice is an adapter and receipt boundary around these owners. It does
not create a second source of truth.

## Implementation before observation

The first PERT tasks implement source authoring/projection, connect the causal
receipt, wire the first consumer, and pass a bounded local acceptance. Contract
work is folded into those tasks as minimum executable invariants; it is not a
separate assurance-first phase. Until the vertical slice is connected, do not
start staging or guarded production trials.

Local acceptance requires:

- exact legacy parity with mode `off`;
- no extra provider, repository, persistence, or external calls in `off` or
  deterministic `shadow` construction;
- bounded schemas for the first slice and deterministic fallback;
- focused regression tests for authority, malformed input, privacy, and the
  existing control path;
- full tests, typecheck, build, and PERT validation.

## Trial and observation after implementation

Staging trials use synthetic and disposable authenticated battles. They compare
the actual pipeline path with the baseline, exercise the first consumer, and
collect enough failure, latency, and quality evidence to revise the slice.

Any production trial requires separate release/operations authorization. Its
cohort and hold time are chosen from the staging evidence rather than frozen
before implementation. A shadow trial requires zero user-visible changes; a
guarded narration trial requires zero mechanical changes and a bounded visible
cohort. Both require:

- zero extra domain writes;
- zero privacy or authority violations;
- bounded receipt construction/fallback errors and latency regression under the
  trial-specific limits;
- bounded telemetry cardinality and no unexpected provider calls.

An off/shadow trial authorizes only an owner decision. A guarded narration
trial remains reversible and cannot change mechanical authority.

## First user-value activation

After an explicit owner approval, `narration_guarded` may be enabled for a
small reversible cohort. It supplies the receipt to the existing narrator call
and changes no mechanical authority. Acceptance compares baseline and
candidate turns for causal clarity, concrete progress, repetition, unsupported
claims, privacy, latency, and cost. The trial design is fixed immediately
before the trial from the implemented behavior and staging evidence, not as a
precondition for implementation.

The open observation backlog is checked here as a secondary scorecard. It does
not dictate receipt fields or create an immediate patch obligation. A naturally
improved item may be closed with evidence; a continuing item remains open for a
later focused change.

Any factual invention, identity leak, mechanical divergence, unexpected call,
or rollback failure returns the mode to `off`. Expansion is a separate recorded
decision. Mechanical authority is outside this slice.

## PoC result retention

The completed exploratory work remains preserved on remote branch
`poc/battle-pipeline-projection` at
`28fb5bab9c22232a684a5f32f37c615ccbc547f5`. Local and remote SHA equality was
read back on 2026-08-07.

Useful hypothesis findings are:

- purpose-scoped projections can stay compact while retaining tested decisive
  dependencies;
- causal-first repair and explicit consistency issues are safer than silent
  whole-state rewrites;
- deterministic validation must retain final mechanical authority;
- bounded receipts, fallback, privacy, and non-interference deserve first-class
  tests;
- an ordinary-turn source-authoring seam can be assembled without changing the
  control result in the frozen synthetic suite.

The PoC did not establish production latency, cost, live user preference,
general world correctness, or safe mechanical activation. Those limits govern
claims, but they do not demote the hypothesis ideas to optional background.
The first slice deliberately implements the most axial, patchable subset on
current `main`; PoC code is reused only after reduction and current-main review.

Do not merge the PoC branch wholesale. Any reused idea or code must be reduced
to the first vertical slice, reviewed against current `main`, and validated as
new production work.

## Macro boundary

Closing this slice selects the next axial hypothesis from implementation and
trial evidence. The expected next candidates are adaptive adjudication and the
environment/world-process path. Observation backlog items may influence the
choice only when they still reproduce; they do not replace this hypothesis
sequence with an unrelated patch queue.
