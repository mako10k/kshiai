# Battle Pipeline Active World Process PoC

## Status

- Task: `T_WORLD_POC`
- State: built and construction-validated
- Date: 2026-08-06
- Estimate: 2p
- Forecast velocity: 4.078125p/day
- Forecast duration: approximately 0.49 day
- Authority: projection input and shadow patch output only
- Evaluation: supported by the frozen protocol (`T_WORLD_EVAL` completed)

This prototype tests whether deterministic environmental processes can propose
effects in the same temporal window as character actions without gaining
canonical commit authority. It does not run from the battle service.

## Boundary

```text
ConsistencySlice(purpose=world_process)
  + active process records
  + character proposal claims
  + at most one bounded concretization
    -> rule-based world proposals
    -> shared-window conflict detection
    -> completed shadow patch / requires adjudication / rejected
```

The input is an existing server-only projection contract. The output patch is
the existing `ShadowCanonicalPatch`; it is schema-validated but never applied.
`canonicalCommitPerformed` is always false.

## Frozen rules

| Process | Trigger | Proposed effect |
|---|---|---|
| fire | `fire.state=active` | `area.fire=burning` |
| collapse | `collapse.state=active` | `structure.state=collapsed` |
| fall | `fall.state=active` | `actor.posture=fallen` |
| spread | `spread.state=active` | `area.smoke=spreading` |
| support loss | `support.state=lost` | `structure.stability=unstable` |

Every proposal retains process, source, trigger fact, target, rule, effect, and
temporal-window references. The rule and target must be present in the supplied
projection. Missing triggers, inactive processes, missing rules, and out-of-
scope targets fail closed.

## Shared temporal window

Character and world proposals expose explicit exclusive claim references. When
two proposals overlap in turn and phase and claim the same state slot, neither
is selected by character side, array position, or provider order. The world
receipt becomes `requires_adjudication` and no patch is emitted.

Different turns or phases remain independent. Timeline sorting exists only for
stable serialization and is not a priority rule.

## Shadow patch

An uncontested process produces assertions, optional prior-fact retractions,
and causal links from both the process and trigger facts. It uses world/
validated-world-transition provenance, but remains `mode: shadow` and does not
change `BattleState`, the canonical graph, or storage.

## Semantic concretization

At most one concretization can be supplied to the PoC call. It is accepted only
when:

- the base trigger fact exists in the projection and has no known value;
- the fact belongs to the same process trigger set;
- every evidence reference is present in the projection;
- the known fact is refined in place rather than replaced.

A known value cannot be rewritten. No XAI call was needed for construction;
the single ambiguous fixture supplies a frozen concretization explicitly.

## Construction scenarios

Six tests cover:

- fire, collapse, fall, spread, and support-loss proposals and patches;
- trigger and process causal links;
- character/process same-window conflict without side priority;
- different-window independence;
- one unknown-to-known concretization;
- rejection of missing rules, out-of-scope targets, and external evidence;
- rejection of known-state rewrites, inactive processes, and missing triggers;
- source immutability, zero LLM calls, and zero canonical commits.

These construction tests were followed by the separately frozen evaluation in
[battle-pipeline-world-process-evaluation.md](battle-pipeline-world-process-evaluation.md).
Its bounded result is `supported`: every hard invariant and deterministic,
semantic-proxy, and cost threshold passed. That result applies only to the
frozen shadow mechanism and does not authorize runtime integration.

## Limitations

- Rules are deliberately small fixtures, not a general world simulation DSL.
- A process reads one frozen projection snapshot; effects do not recursively
  trigger another process inside the same call.
- Same-window conflicts are routed onward rather than resolved here.
- The PoC does not generate active-process records from arbitrary prose.
- Concretization is pre-authored and does not measure production LLM quality,
  tokens, or latency.
- No backend service, runtime prompt, provider order, persistence, release, or
  deployment behavior is changed.
