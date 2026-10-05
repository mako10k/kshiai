# ADR-0052: Isolated long-timeout awareness measurement

- Status: Accepted
- Date: 2026-10-05
- Decision owner: Repository owner
- Related: [ADR0051](0051-observed-llm-usage-accounting.md), [trial preparation](../battle-awareness-real-trial-preparation-2026-10-05.md), speech-continuity-and-fade-recovery.pert

## Context

E-LM-01: Recorded two gpt-6-luna requests timed out at five seconds; reconstructed input is about6100 characters per character. Usage remained unknown. One conscious response completed and one timed out. [Evidence](../evidence/awareness-real-trial-retry-2026-10-05.json).

E-LM-02: Owner instructs 「では、タイムアウトをかなり延ばして実測しなおしましょう。」. This explicitly authorizes a timing experiment and one measured rerun. Numeric durations below are implementation choices within that isolated experiment.

## Decision drivers

- C-LM-01: Observe actual usage and latency with longer waits.
- C-LM-02: Keep SDK, worker, creation, narration and global timing coherent.
- C-LM-03: Preserve ordinary defaults and immutable historical battles.

## Considered options

1. Increase SDK timeout only: other deadlines still reject results.
2. Increase production defaults: affects unrelated battles without evidence.
3. Separate bound measurement policy for an internal isolated trial: selected.

## Decision

Add strict immutable observed policy revision `awareness-v5-measurement-v1`: subconscious60seconds, conscious90seconds, adjudication/creation60seconds, narration60seconds, global600seconds, publication180seconds, terminal drain90seconds. Input targets, output token ceilings,200 physical attempts, concurrency6, no retry/fallback and three-tick trial stop remain unchanged. USD0.50 remains an observation target without certified cost guarantee.

The internal trial explicitly opts in at creation. Ordinary startBattle calls continue binding `awareness-v5-usage-v1`. Creation receipt, manifest and runtime bind the same policy; SDK options and request proof generation use its role limits. Queue publication and terminal checks use the bound policy. Existing battles never reread a mutable override.

Keep actual usage metadata and input size observations; unknown/late/failure distinctions remain. No new prompt storage in the usage ledger. The result is measurement evidence, not production readiness.

## Consequences

### Positive

Observe slower responses with coherent immutable timing; ordinary deadlines remain unchanged.

### Negative and risks

Longer elapsed waits and outstanding work; no guarantee of remote model availability, valid output, complete usage or price. Distinguish HTTP completion from application acceptance.

## Compatibility and migration

Strict revision-correlated exact durations; reject mixed timing tuples. Existing manifests stay valid and retain original policies. No past-battle migration, public request field, deployment or held old cutover amendment. ADR0051 remains Accepted for ordinary accounting.

## Verification

Schema correlation, bound request/SDK timing, equal creation/manifest/runtime binding, narrator publication/terminal deadlines, offline fixed trial before one real isolated run, independent actual usage/state readback with no resend.

## Implementation references

A-LM-01 implements C-LM-01..03 based on E-LM-01..02: shared policy, role request prep, internal harness, existing battle/narration integration. Canonical PERT task: long-timeout-measurement. Detailed allocation: policy schema owns timing variants; factory owns routes; creation owns immutable binding; trial owns one-run observation.
