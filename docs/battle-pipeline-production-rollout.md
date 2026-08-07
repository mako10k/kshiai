# Battle pipeline thin production slice

Date: 2026-08-07 (Asia/Tokyo)

Status: Planned from `main` commit
`4c7ea5ccec31814a5fa38f1b9ea616ca50e764fe`. This document and its PERT plan
do not authorize a release, production observation, traffic change, or
effectful activation.

Execution order and authority live in
[`battle-pipeline-production-rollout.pert`](battle-pipeline-production-rollout.pert).

## Goal and ordering

Raise user-visible battle value quickly by making each narrated turn easier to
trace from a chosen action through the engine-approved consequence. Implement
the complete thin slice first behind an off-by-default boundary. Observe it in
staging and production shadow only after the implementation and local
acceptance gates pass.

The target is not a perfect general world simulator. The target is one small,
production-shaped pipeline that improves causal grounding without replacing
the existing battle engine or persistence model.

```text
existing BattleState / worldState / semanticState
    -> bounded purpose-specific turn context
    -> existing engine and service owners
    -> bounded committed turn receipt
    -> existing narrator call
```

## Thin slice

### Included

1. A bounded `BattleTurnContextSlice` derived from current `main` state for the
   existing decision, adjudication, and narration owners. Every field has a
   purpose, size limit, visibility rule, and legacy default.
2. A bounded `BattleTurnReceipt` that connects requested and effective actions,
   committed events, mechanical effects, accepted world/semantic changes,
   observer-visible consequences, and unresolved current-turn consistency
   markers.
3. Deterministic validation which rejects unknown references, protected-field
   writes, unsupported causal claims, and visibility leaks. Unknown or invalid
   input falls back to the existing `main` behavior.
4. One versioned server-side mode: `off`, `shadow`, or
   `narration_guarded`. `off` is the default and emergency state.
5. Consumer wiring that first uses the receipt only to ground the existing
   narrator request. It must not add a normal-turn LLM call or let narration
   change actions, mechanics, state, winner, rating, or character cognition.
6. Aggregate operational counters for construction success, rejection reason,
   fallback, latency, and bounded size. No prose, identity, stable entity ID,
   prompt, completion, battle ID, or per-turn hash is durable telemetry.

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

The first four PERT tasks freeze the contract, implement the shared core, wire
the ordinary runtime with mode `off`, and pass local acceptance. Until all four
are complete, do not deploy the slice for staging or production observation.

Local acceptance requires:

- exact legacy parity with mode `off`;
- no extra provider, repository, persistence, or external calls in `off` or
  deterministic `shadow` construction;
- bounded schemas and deterministic serialization;
- side-swap, legacy-state, malformed-input, timeout, privacy, and
  protected-field tests;
- full tests, typecheck, build, and PERT validation.

## Observation after implementation

Staging observation uses synthetic and disposable authenticated battles. It
tests failure injection, receipt coverage, fallback, privacy, latency, and
rollback without production user data.

Production shadow requires a separate release/operations authorization. It
keeps existing outcomes and narrator inputs authoritative, holds at least 24
hours and 100 eligible turns, and requires:

- zero extra domain writes and zero user-visible changes;
- zero privacy or authority violations;
- receipt construction/fallback errors below 1%;
- p95 turn-latency regression within both 10% and 20 ms;
- bounded telemetry cardinality and no unexpected provider calls.

Passing shadow evidence authorizes only an owner decision. It does not activate
the receipt as narrator input.

## First user-value activation

After an explicit owner approval, `narration_guarded` may be enabled for a
small reversible cohort. It supplies the receipt to the existing narrator call
and changes no mechanical authority. Acceptance compares blinded baseline and
candidate turns for causal clarity, concrete progress, repetition, unsupported
claims, privacy, latency, and cost. The contract task freezes the exact sample
and threshold before implementation starts.

Any factual invention, identity leak, mechanical divergence, unexpected call,
or rollback failure returns the mode to `off`. Expansion is a separate recorded
decision. Mechanical authority is outside this slice.

## PoC result retention

The completed exploratory work remains preserved on remote branch
`poc/battle-pipeline-projection` at
`28fb5bab9c22232a684a5f32f37c615ccbc547f5`. Local and remote SHA equality was
read back on 2026-08-07.

Useful reference findings are:

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
general world correctness, or safe mechanical activation. This plan remains
executable if the PoC branch is unavailable: requirements and current `main`
contracts define the implementation; PoC artifacts may only supply reviewed
test cases or design cautions.

Do not merge the PoC branch wholesale. Any reused idea or code must be reduced
to the thin-slice contract, reviewed against current `main`, and validated as
new production work.

## Macro boundary

Closing this slice returns portfolio execution to the parent plan. A successful
narration-grounding slice does not automatically authorize the deferred
pipeline concepts. A failed value gate returns to the current `main` path and
records what was learned; it does not trigger another open-ended PoC.
