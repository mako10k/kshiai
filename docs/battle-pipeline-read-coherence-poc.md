# Battle Pipeline Purpose-scoped Read and Repair PoC

## Status

- Task: `T_READ_POC`
- State: built and construction-validated
- Date: 2026-08-06
- Estimate: 2p
- Forecast velocity: 2.25p/day
- Forecast duration: approximately 0.89 day
- Authority: shadow-only; no canonical commit, persistence, or runtime wiring
- Evaluation: `revise` under the frozen protocol (`T_READ_EVAL` completed)

The bounded result is recorded in
[Battle Pipeline Read Coherence PoC Evaluation](battle-pipeline-read-coherence-evaluation.md).
The shadow boundaries held, but `select` preferred bare recency over stronger
causal evidence in the frozen recency trap. The contract therefore requires a
limited causal-order revision before later phases can continue.

This prototype tests whether a complete purpose-specific Consistency Slice can
be checked cheaply and, when explicitly enabled, preview a bounded repair as an
ordinary `RepairRef` canonical patch. It does not claim that the selected facts
or the previewed result are objectively correct.

## Local read contract

`packages/shared/src/battle-read-coherence.ts` provides
`checkPurposeScopedConsistencySlice`. The check:

- parses a strict Consistency Slice and leaves the input unchanged;
- returns every checked fact reference and in-scope entity reference;
- detects overlapping, incompatible claims for the same canonical slot;
- includes open and deferred issues only when they block the requested purpose
  and intersect the slice;
- ignores resolved, different-purpose, and unrelated issues;
- returns `unchecked` instead of `locally_coherent` when the slice is truncated;
- treats `locally_coherent` as a purpose-local result, never global proof.

The direct-conflict key matches the canonical patch audit: relation predicates
include their object reference in the slot, while other predicates treat the
object reference as part of the claim.

## Bounded repair preview

`proposeShadowConsistencyRepair` supports five explicit strategies:

1. `select` keeps a uniquely stronger fact and retracts the others. Ranking is
   later validity, causal-link strength, then trusted authority. A tie is
   rejected instead of broken arbitrarily.
2. `reinterpret` accepts a caller-supplied replacement only for the same
   conflicted slot.
3. `intermediate_state` replaces the conflict with an explicit intermediate
   marker.
4. `weaken_claim` replaces it with a weaker claim marker.
5. `reset_unknown` replaces it with an explicit unknown marker.

Every proposed change is a strict shadow `CanonicalPatch` whose source is a
`repair:*` reference. Retractions receive `ended` causal links; replacement
facts receive `created` links and retain `repair` provenance and authority. The
ordinary patch auditor must return `no_issue_found` before a proposal can be
previewed.

`runShadowConsistencyRepair` requires `allowShadowRepair: true`, caps attempts,
repair calls, per-run touched facts, and per-conflict facts, and stops when the
rebuilt preview becomes locally coherent. It records zero external LLM calls.
The returned `shadowResolvedIssueRefs` and resolved issue views apply only to
the rebuilt preview; the issue registry and canonical facts are not changed.

## Hard bounds

| Bound | Maximum |
|---|---:|
| Attempts per run | 5 |
| Repair calls per run | 5 |
| Facts in one conflict | 8 |
| Facts touched per run | 16 |
| Attempt receipts | 5 |

Callers may choose smaller limits but cannot enlarge them.

## Automated construction evidence

`packages/shared/src/battle-read-coherence.test.ts` covers:

- exact checked scope and purpose isolation;
- truncated-slice and oversized-conflict fail-closed behavior;
- causal and authority ordered selection;
- all five repair strategies and patch audit success;
- repair-source projection in a rebuilt slice;
- ambiguous selection, incomplete context, and scope-expansion rejection;
- explicit enablement and attempt, call, and touched-fact limits;
- source fact and source slice immutability.

These are construction and regression tests, not effectiveness evidence.
`T_READ_EVAL` must separately measure conflict reduction, coherent-read rate,
incorrect selection, causal regression, unnecessary repair, unknown fallback,
latency, extra LLM calls, and repeated-repair loops.

## Limitations

- The cheap checker detects direct structured slot conflicts. It does not infer
  arbitrary semantic contradictions from prose or world rules.
- `select` uses a frozen partial ordering proxy; later evaluation must count a
  causally weaker retained fact as harm even if the preview becomes coherent.
- `reinterpret` remains caller-authored and is not proof that its replacement
  is true.
- Intermediate, weakened, and unknown values are PoC markers; no runtime
  consumer currently interprets them.
- Shadow issue resolution is preview metadata, not an issue-lifecycle commit.
- Passing construction tests cannot guarantee global consistency or correct
  final battle results.
