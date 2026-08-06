# Battle Pipeline Adaptive Adjudication PoC

## Status

- Task: `T_ADAPTIVE_POC`
- State: built and construction-validated
- Date: 2026-08-06
- Estimate: 3p
- Forecast velocity: 3.15625p/day
- Forecast duration: approximately 0.95 day
- Authority: shadow receipts only; no canonical commit or runtime integration
- Evaluation: pending (`T_ADAPTIVE_EVAL` remains separate)

This prototype tests whether proposals can stay coarse by default and expand
only when a frozen, explicit reason makes intermediate execution or local world
detail outcome-relevant. It does not replace the existing battle engine or
free-action commit path.

## Shadow boundary

```text
frozen proposal + bounded facts + existing control/coarse result
    -> Level 0 fast / Level 1 coarse / Level 2 expanded router
    -> optional character-authored plan and unknown-world refinement
    -> longest valid prefix execution
    -> shadow receipt only
```

`packages/shared/src/battle-adaptive-adjudication.ts` defines strict schemas and
the deterministic `adjudicateAdaptiveBattleProposals` PoC. Inputs are cloned,
all outputs carry `canonicalCommitPerformed: false`, and the module has no
backend service, provider, database, or battle-turn wiring.

## Adaptive levels

### Level 0: fast

Basic attack, skill, movement, defense, release, and already-defined world
processes stay on the fast path when no expansion reason exists. The PoC copies
an explicit existing-control receipt exactly; it does not recalculate or modify
the engine result.

### Level 1: coarse

Non-fast proposals can use a bounded coarse receipt when facts are sufficient
and no detail trigger exists. Missing or oversized receipts fail closed to a
weaker fallback rather than inventing an outcome.

### Level 2: expanded

The only accepted expansion triggers are:

- intermediate state affects the outcome;
- a partial stopping point matters;
- simultaneous exclusive claims conflict;
- unknown world state affects the result;
- an irreversible effect is proposed;
- a rule is ambiguous;
- a cost depends on the execution stage.

The proposal must state whether character-plan detail, world detail, or both are
needed. Expansion without an explicit reason is schema-invalid.

## Character plan authority

The adjudicator does not synthesize tactics or steps. A Level 2 character plan
must be supplied explicitly with `origin: "character_expansion"` and must:

- match the coarse proposal reference;
- cite the proposal's observation, psychology, and experience basis;
- keep asserted subjects and objects inside the supplied interaction scope;
- refer only to available facts or facts asserted by an earlier planned step;
- stay within step and effect budgets;
- bind every execution cost to its owning step.

Out-of-scope effects, missing basis coverage, unknown precondition references,
and oversized plans degrade without executing any step.

## Longest valid prefix and costs

Expanded plans execute in listed order. Before each step, the PoC checks abort
conditions, simultaneous exclusive claims, and fact preconditions. Execution
stops at the first false or unknown precondition or contested claim.

Effects and costs from completed steps remain in the shadow receipt. Effects
and costs from the failed step and later steps are absent. This makes exposure,
posture, movement, resources, ammunition, cooldown, durability, noise, action
opportunity, and new cognition execution-derived rather than discretionary
punishment.

When two same-window plans claim the same exclusive reference, both preserve
their already completed prefixes and stop before the contested step. The PoC
does not choose a side without an additional timing or rule basis.

## World refinement

`refineAdaptiveWorldFacts` accepts only same-slot refinement of an explicitly
`unknown` base fact. It rejects:

- refinement of an already known base fact;
- a different subject, predicate, or object slot;
- an out-of-scope subject or object;
- a value conflicting with a known fact in the same slot;
- a refined fact that remains unknown;
- non-world-expansion provenance.

Accepted refinements appear in the shadow receipt and do not retract or commit
canonical facts.

## Budget degradation

The PoC bounds proposal count, facts, coarse adjudications, planning expansions,
world expansions, plan steps, and receipt effects. These are deterministic PoC
slots, not provider calls; `externalLlmCalls` is always zero.

When a required detail path is missing, invalid, or over budget, the router
selects the strongest safe supplied fallback in this order:

```text
intermediate -> weak -> generated unknown
```

A supplied intermediate or weak claim is skipped if it conflicts with a known
fact. The generated final fallback asserts only that the adjudication outcome
is unknown.

## Construction scenarios

`packages/shared/src/battle-adaptive-adjudication.test.ts` freezes construction
examples for:

- exact Level 0 control passthrough with zero expansion;
- direct Level 1 coarse resolution;
- Level 2 longest-prefix stopping and completed-step cost retention;
- rejection of a precondition that depends on a later step;
- simultaneous exclusive-claim stopping for A and B;
- unknown-to-known world refinement and known-fact rewrite rejection;
- world-detail use without canonical authority;
- intermediate, weak, and unknown budget degradation;
- rejection of an adjudicator-invented out-of-scope tactic;
- rejection of detail missing psychology and experience grounding;
- fact-budget exhaustion.

These are construction tests, not effectiveness evidence. `T_ADAPTIVE_EVAL`
must separately freeze repeated cases and measure plausibility, expansion
trigger precision/recall, prefix correctness, causal completeness, calls,
tokens, latency, and degradation behavior against the unchanged engine control.

## XAI decision

No XAI request was made. Routing, prefix execution, fact refinement, scope,
budget, and cost attribution are structured deterministic construction claims.
The later evaluation may use XAI for bounded blinded semantic comparison if it
is needed, but structured hard invariants remain code-scored.

## Limitations

- The PoC consumes pre-authored control/coarse receipts, character plans, and
  world refinements; it does not generate them with an LLM.
- Branch targets are schema-validated, but the construction executor follows
  the frozen linear step order and does not select a branch.
- Simultaneous conflicts conservatively stop every claimant; initiative or
  domain rules are not invented to choose a winner.
- Virtual step facts exist only during one shadow execution and are not patches.
- The PoC does not measure narrative or final-outcome plausibility.
- No production state, prompt, provider order, persistence, release, or
  deployment behavior is changed.
