# Battle pipeline hypothesis-first production slice

Date: 2026-08-07 (Asia/Tokyo)

Status: Planned from `main` commit
`4c7ea5ccec31814a5fa38f1b9ea616ca50e764fe`. This document and its PERT plan
do not authorize a release, production observation, traffic change, or
effectful activation.

Execution order and authority live in
[`battle-pipeline-work.pert`](battle-pipeline-work.pert).
Estimate/actual/velocity history lives separately in
[`battle-pipeline-actuals.md`](battle-pipeline-actuals.md).

## Goal, decision hierarchy, and ordering

The primary goal is to implement and try the central battle-pipeline
hypotheses. The hypothesis defines the candidate axes; repeated production
observation now determines their implementation order. The observation backlog
remains evidence, not an automatic queue of local patches.

Use this decision order:

1. Admit only ideas that form an axis of the pipeline hypothesis or unblock
   trustworthy observation of such an axis.
2. Rank admitted axes from retained production evidence: canonical-authority
   risk first, then pipeline-blocking frequency and reproducibility, then
   cross-stage user value and current-main patchability.
3. Keep non-critical narrator wording, emphasis, repetition, and unsupported
   flavor issues pending until the owner-stage pipeline is more mature. Address
   them in the same slice only when that slice changes their input or authority
   boundary naturally.
4. A narrator issue remains immediate only when narrator output can change
   canonical state, mechanics, winner, private cognition, authorization,
   privacy, availability, or durable data integrity.
5. Among otherwise comparable axial ideas, implement the slice that can be
   patched into the current `main` with the smallest authority and persistence
   change.
6. Keep the implementation conceptually complete but deliberately thin;
   it need not be the final generalized architecture.
7. Try and observe the implemented pipeline only after that vertical slice is
   connected.
8. Use open observation items as evaluation lenses. If the hypothesis slice
   improves an item, record that result. If the phenomenon continues, retain
   it for a later targeted fix. An observation does not preempt the hypothesis
   implementation unless it meets the critical boundary above.

The target is not a perfect general world simulator. The first target is one
small, production-shaped path that proves the useful pipeline shape on current
`main` and raises causal grounding in the existing user experience.

```text
existing owner outputs
    - ResolvedBattleAction.resolution
    - TurnEvent.sourceActionId
    - CommittedMechanicalEvidence
    - accepted semantic patch / world transition
    -> bounded BattleTurnCausalReceipt
    -> ID-free, perspective-safe narration causal projection
    -> existing NarrationTurnView / existing narrator call
```

## Current-main fit and implementation choice

Current `main` already has substantial pieces of the hypothesis:

- character intent is separated from `ResolvedBattleAction.resolution`;
- actions have stable turn-local IDs and events may carry `sourceActionId`;
- the engine emits validated committed mechanical evidence;
- semantic reconciliation reports whether its patch was applied, rejected, or
  skipped;
- `NarrationTurnView` is already an ephemeral, purpose-specific, perspective-
  safe projection for the existing narrator call.

The shortest missing axial connection is therefore not a new general
projection framework or the PoC's five-artifact applicability bundle. It is a
single causal turn slice that assembles the existing owner outputs without
inference and projects the committed chain into the existing narrator view.

## Hypothesis priority and first slice

| Hypothesis idea | Axial importance | Patchability on current `main` | Decision for this cycle |
|---|---|---|---|
| Proposal-to-adjudication-to-committed-result causal slice | High | High: current actions, event links, evidence, and semantic result are available at one service boundary | Implement first |
| Owner-stage source authoring and purpose projection | High as a principle | Mostly present: add only the missing receipt builder and narrator-safe projection | Absorb into the first slice; do not port the five-artifact PoC bundle |
| One guarded consumer of the causal projection | High for user value | High: extend the existing `NarrationTurnView` and reuse its current call | Implement in the same slice |
| Active world-process/environment transition engine | High in the broader hypothesis | Medium: `buildHappening` is an existing seam, but proposal and effect authority must be separated | Prefer as the next-axis candidate after the first trial |
| Adaptive expanded adjudication | High in the broader hypothesis | Medium/low: the PoC used pre-authored detail and live grounding is unproved | Compare with world process after the first trial |
| General consistency detection/repair and independent canonical persistence | Supporting, not the first user-value axis | Low and migration-heavy | Defer until a tried slice shows the need |

This table defines the candidate axes. Their ordering is revised when retained
implementation and trial evidence changes authority risk, pipeline blockage,
patchability, or axial value.

## First vertical slice

### Included

1. A pure shared `BattleTurnCausalReceipt` builder called after semantic
   reconciliation, when the existing action, event, mechanical, semantic, and
   before/after state owners have finished.
2. The receipt copies only explicit owner outputs: requested and effective
   action, resolution outcome/reason, action-linked events, validated committed
   mechanical evidence, semantic result/accepted change, and bounded
   carry-forward state. Missing links remain unknown; prose is not mined to
   reconstruct them.
3. A compact `NarrationCausalProjection` removes control IDs and private facts,
   respects the selected perspective, and exposes the committed cause,
   consequence, and continuing condition to the existing `NarrationTurnView`.
4. Deterministic validation rejects dangling links, uncommitted effects,
   protected fields, and visibility leaks. Invalid construction omits the
   causal projection and follows the existing narrator path.
5. One reversible server-side boundary with at least `off` and
   `narration_guarded`; `shadow` may be retained when it materially accelerates
   comparison, but is not a prerequisite to trying the implemented concept.
6. Consumer wiring that uses the projection only to ground the existing
   narrator request. It must not add a normal-turn LLM call or let narration
   change actions, mechanics, state, winner, rating, or character cognition.
7. The minimum diagnostics needed to compare baseline and candidate behavior
   during the trial. Broader operational observability is added only when trial
   evidence justifies it. No prose, identity, prompt, or completion is durable
   telemetry.

### Explicitly deferred

- independent canonical-graph persistence or a database migration;
- the PoC's general five-artifact applicability/source-authoring bundle;
- a parallel replacement for the existing perception or `NarrationTurnView`;
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

The first three PERT tasks build the causal receipt plus narrator projection,
wire the existing consumer, and pass bounded local acceptance. Source-authoring
and contract work are implementation properties of this slice, not separate
prerequisite phases. Until the slice is connected, do not start staging or
guarded production trials.

Local acceptance requires:

- exact legacy parity with mode `off`;
- no extra provider, repository, persistence, or external calls in `off` or
  deterministic `shadow` construction;
- bounded schemas for the first slice and deterministic fallback;
- focused regression tests for authority, malformed input, privacy, and the
  existing control path;
- full tests, typecheck, build, and PERT validation.

## Point estimates, actuals, and rolling forecast

All task estimates use points. The initial migration uses `1d = 1p` only to
preserve the prior relative estimates. It is a bootstrap conversion, not an
observed claim about delivery speed.

For every task:

1. Keep the estimate in points and commit it before work starts.
2. Record a `work_event start` with an exact fixed-offset timestamp at the
   actual start. Commit this event separately so it remains the baseline.
3. Record suspend/resume events when the task genuinely stops and restarts.
4. Record a `work_event finish` with the exact finish timestamp and, when
   available, active hours and person-hours. Do not rewrite the original point
   estimate to match the result.
5. Append the measured result to `battle-pipeline-actuals.md`, separately from
   the estimate.
6. After every completed task, observe Velocity from the latest one to three
   completed tasks in this slice. Adopt the tool's elapsed-throughput candidate
   when it is available; otherwise retain the current Velocity and record why
   no measured update was possible.
7. Update the PERT `velocity`, rerun DAG analysis, and record the new remaining
   forecast in the actuals ledger. Velocity is a forecast input, not a change to
   completed estimates or scope.

The initial declared Velocity is `1p/1d`. Replace it after the first conformant
start/finish sequence. Historical tasks whose start baseline was not committed
before their finish are excluded rather than reconstructed.

## Trial and observation after implementation

Staging gets a two-point implementation/trial iteration immediately after local
acceptance. It uses synthetic and disposable authenticated battles, compares
the actual path with the baseline, and allows one bounded revision to the
receipt builder, projection, guard, or narrator instruction. It does not expand
into world-process, adaptive adjudication, general repair, or persistence work.

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

The five-artifact source-authoring work proved an ownership and provenance
technique for future adaptive/consistency stages. Current `main` does not
produce those five runtime artifacts and does not need them to connect the
first causal narrator slice, so that bundle is not the first porting target.

The PoC did not establish production latency, cost, live user preference,
general world correctness, or safe mechanical activation. Those limits govern
claims, but they do not demote the hypothesis ideas to optional background.
The first slice deliberately implements the most axial, patchable subset on
current `main`; PoC code is reused only after reduction and current-main review.

Do not merge the PoC branch wholesale. Any reused idea or code must be reduced
to the first vertical slice, reviewed against current `main`, and validated as
new production work.

## Macro boundary

The v0.10.0 persistent E2E trace changes the immediate ordering:

1. Stabilize the character action-proposal boundary first. Twenty-two of 30
   side-turn provider results were rejected, including 21 invalid next actions.
   This is both an action-side pipeline failure and a blocker for trustworthy
   observation of later axes.
2. Re-evaluate the environment/world-process path next. `OBS-20260807-02` and
   the v0.10.0 input conflict behind `OBS-20260807-03` both expose ambiguity
   between an environmental proposal, a resolved event, and accepted canonical
   change.
3. Keep adaptive expanded adjudication as the following alternative, selected
   only after the action-proposal trial is observed.

Standalone non-critical narrator cleanup is pending. If an action, environment,
or adjudication slice naturally supplies better narrator input, its acceptance
may include the corresponding narration observation without creating a
separate narrator patch task.
