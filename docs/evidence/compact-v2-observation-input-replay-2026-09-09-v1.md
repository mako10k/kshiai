# Compact V2 observation-input provider replay — approval candidate

## Purpose

This candidate tests whether the ordinary dialogue changes when its authored
counterpart and ambient changes reach deep psyche through the accepted
observer-safe perception path. It compares against the immutable successful
baseline `compact-v2-provider-replay-repair-2026-09-09-v2`.

The repeat-capable scenario remains in the run to verify that intentional exact
repetition is still accepted. This run does not test the separate endogenous
self-talk hypothesis; that question remains downstream of the observation-input
comparison.

## Correction under test

- Synthetic changes are represented as bounded `PerceptionEvidence`, not only
  as event-summary prose.
- Evidence is projected through `projectObserverPerception` for each observer.
- The same evidence is passed to `advanceCharacterAgents`.
- Packet construction uses the projection's opaque percept-ID derivation, so
  observer-safe phenomena retain their committed event provenance.
- No schema, prompt, privacy, retry, persistence, or provider behavior is
  changed by this candidate.

The implementation is fixed at
`73111aa6bd5784b5c74ab5c1d695a8662ba56468`.

## Frozen execution contract

- Run ID: `compact-v2-observation-input-replay-2026-09-09-v1`
- Predecessor: `compact-v2-provider-replay-repair-2026-09-09-v2`
- Provider/model/API: xAI `grok-4.3`, Chat Completions, reasoning `none`
- Scope: two synthetic in-memory scenarios, three turns each
- Physical requests: at most 18, serial
- Input ceiling: 20,000 bytes per request
- Output ceilings: 1,200 tokens for psyche and repair; 400 for expression
- Reserved token ceiling: 300,000
- Monetary ceiling: USD 0.50
- Retry, recursive repair, provider fallback, judge, database write,
  deployment, release, and battle creation: prohibited
- Contract digest:
  `cd8e87dc7e3191b937d36c1f91282a24c8a1262af27853ed29217ed06a92216f`

Execution is fail-closed. Any provider, model, usage, schema, semantic-closure,
application, ceiling, or evidence-persistence failure stops the run. An existing
`run-state.json` prevents retry, resume, or ambiguous recovery.

## Network-zero preparation evidence

Preparation forced the maximum one-shot repair path for all six turns and made
zero network requests:

- 18 prepared calls: six psyche, six bounded psyche repair, six expression
- 169,800 reserved tokens
- USD 0.23325 reserved cost
- 9,563 bytes maximum input size
- Six locally accepted application turns
- Every ordinary turn contained one or more fresh counterpart or ambient items
  linked to its exact `event.ordinary.<turn>` ID

Machine-readable evidence is retained in
`compact-v2-observation-input-replay-2026-09-09-v1/execution-contract.json` and
`compact-v2-observation-input-replay-2026-09-09-v1/prepare-proof.json`.

## Authority boundary

No provider call has been made for this run. Approval would authorize only one
execution of the exact run ID and contract digest above. It would not authorize
push, PR, merge, release, Stage or production deployment, production promotion,
or a persistent observation battle.
