# ADR-0001: Turn initiative and simultaneous resolution

- Status: Proposed
- Date: 2026-08-12
- Decision owner: Product owner
- Related: GitHub Issue #98; `docs/issue-98-battle-pipeline-plan.md`; `docs/issue-98-causal-contract.md`; PERT task `T_REFACTOR_BUCKET_EXECUTION`

## Context

The existing `initiative-window-v1` rules place combatants whose effective initiative differs by at most one point into one atomic temporal bucket. Both actions read the turn-start snapshot and commit together. Larger differences create sequential buckets, allowing the later bucket to read the earlier committed mechanics.

Issue #98 changes the battle pipeline toward an explicit causal sequence in which a later character can observe an earlier character's committed, observable result before deciding. Retaining an ordinary simultaneous bucket creates two interaction models: some turns form a causal sequence, while near-equal initiative turns remain parallel. It also preserves mutual incapacitation behavior, but prevents either character from reacting to the other's action during that turn.

The initial implementation plan retained simultaneous resolution to preserve current mechanics and A/B symmetry. Subsequent product review questioned whether that compatibility choice conflicts with the intended character-driven causal flow. This choice must therefore be explicit before the restartable bucket engine is completed.

## Decision drivers

- Every ordinary action should have a comprehensible cause-and-observation order.
- Side labels must not create a systematic initiative advantage.
- Retry and replay must reproduce the same order without fresh randomness.
- Existing battles and turn records must remain readable without inventing missing ordering facts.
- Mutual incapacitation, counters, delayed effects, and death-triggered behavior need explicit semantics rather than accidental processing order.
- The administrator pipeline view must explain why each actor acted with the information available at that point.

## Considered options

1. Retain the current near-equal simultaneous atomic bucket. This maximizes mechanical compatibility and preserves existing mutual incapacitation tests, but leaves a parallel exception in the causal pipeline.
2. Make every ordinary turn sequential and use a persisted deterministic tie-break rule. This provides one causal model, but changes near-equal and mutual-incapacitation behavior and requires a fair ordering policy.
3. Let both characters decide from the same snapshot but resolve their actions sequentially. This gives a total mechanical order without permitting a later reaction, and risks presenting resolution order as if it were decision-time causality.

## Decision

Proposed direction: choose option 2 and remove implicit simultaneous resolution for ordinary character actions.

This is not yet accepted. The owner must separately select the deterministic tie-break policy. Candidate policies include a battle-persisted initiative token that alternates on ties, or a battle seed and turn-derived order stored in the turn checkpoint. A fixed Side A priority is not acceptable because it violates side-label symmetry.

Explicit rules may still create atomic or simultaneous effects when simultaneity is part of the rule itself. Counterattacks, delayed effects, death triggers, and mutual incapacitation must be modeled as named mechanics with their own provenance rather than by placing ordinary actions in one implicit bucket.

## Consequences

### Positive

- Every ordinary later actor can receive an observer-safe projection of earlier committed facts.
- Character decisions, speech, mechanics, and administrator visualization share one causal order.
- Retry checkpoints have one active decision and commit boundary at a time.
- Simultaneous-looking outcomes become explicit, source-linked mechanics.

### Negative and risks

- Near-equal initiative and mutual-incapacitation outcomes can differ from existing battles.
- A deterministic and fair tie-break policy becomes persisted domain state.
- Existing atomic-bucket tests and `initiative-window-v1` documentation must change together.
- More durable commits and observer projections may increase service latency and persistence load.

## Compatibility and migration

- Existing turn records retain their recorded `initiative-window-v1` temporal plan and continue to display simultaneous buckets.
- New rules require a new temporal ruleset identifier; historical records must not be reinterpreted under it.
- Active legacy battles need an explicit policy snapshot or compatibility path before the new ruleset is enabled.
- `BattleState.causalExecution`, turn receipts, internal observability DTOs, and retry keys must carry the selected deterministic order.
- Release, deployment, and production observation remain separately authorized.

## Verification

- A/B-swapped fixtures produce equivalent outcomes after also swapping the persisted tie-break state.
- Retry and resume preserve the selected order without rerolling or invoking an LLM twice.
- The later actor receives only observable facts committed by the earlier action.
- Legacy simultaneous records remain readable and are labeled with their original ruleset.
- Explicit counter, delayed-effect, and death-trigger fixtures reproduce any retained simultaneous-looking outcomes.
- The administrator pipeline view shows the persisted ordering reason and each decision's input boundary.

## Implementation references

- Existing compatibility implementation: commits `eae8008`, `291013d`, and `bec37bd`.
- Existing checkpoint and visualization groundwork: commits `a0a000d` and `d6f1e1b`.
