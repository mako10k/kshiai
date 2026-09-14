# Compact V2 observation-input provider replay v2 — approval candidate

## Purpose

This candidate repeats the same bounded synthetic observation-input comparison
only under a new run ID after correcting the repair-schema defect exposed by
the failed v1 run. It does not retry, resume, or resend v1.

The ordinary scenario tests whether fresh counterpart and ambient observations
produce turn-specific utterances. The repeat-capable scenario verifies that
intentional exact repetition remains valid. The run does not test Stage,
production, or persistent battles.

## Corrections under test

- Observer-safe evidence and event provenance use the correction already
  prepared for v1.
- Typed psyche and expression inputs remain typed inside the replay harness;
  JSON parsing remains only at the external response-string boundary.
- The independent bounded-repair prompt now contains complete
  `speechAppraisal` and `expressionBrief` replacement shapes.
- Missing-expressionBrief repair and prompt-contract regressions pass without
  `as never`, double casts, or non-null assertions in the touched test file.

The implementation is fixed at
`2a92cc853b63b0339981df78feaa97a595af99ea`.

## Frozen execution contract

- Run ID: `compact-v2-observation-input-replay-2026-09-09-v2`
- Failed predecessor: `compact-v2-observation-input-replay-2026-09-09-v1`
- Provider/model/API: xAI `grok-4.3`, Chat Completions, reasoning `none`
- Scope: two synthetic in-memory scenarios, three turns each
- Physical requests: at most 18, serial
- Input ceiling: 20,000 bytes per request
- Output ceilings: 1,200 tokens for psyche and repair; 400 for expression
- Reserved token ceiling: 300,000
- Monetary ceiling: USD 0.50
- Retry, resume, resend, recursive repair, provider fallback, judge, database
  write, deployment, release, and battle creation: prohibited
- Contract digest:
  `af6158962f818c3611525ec23840d28cc1af87be62606cae4bee1fa3af130cae`

Execution is fail-closed. Any provider, model, usage, schema, semantic-closure,
application, ceiling, or evidence-persistence failure stops the run. An
existing `run-state.json` prevents retry, resume, or ambiguous recovery.

## Network-zero preparation evidence

Preparation forced the maximum one-shot repair path for all six turns. Two
successive preparations produced byte-identical artifacts and made zero
network requests:

- 18 prepared calls: six psyche, six bounded psyche repair, six expression
- 175,528 reserved tokens
- USD 0.24041 reserved cost
- 9,586 bytes maximum input size
- Six locally accepted application turns
- Every ordinary turn contained fresh counterpart or ambient evidence linked
  to its exact `event.ordinary.<turn>` ID

Machine-readable evidence is retained in
`compact-v2-observation-input-replay-2026-09-09-v2/execution-contract.json` and
`compact-v2-observation-input-replay-2026-09-09-v2/prepare-proof.json`.

## Authority boundary

The owner explicitly approved v2 and instructed execution. That one execution
succeeded on 2026-09-09 with 12 requests and all six turns accepted. Approval is
consumed. See `compact-v2-observation-input-replay-2026-09-09-v2-outcome.md`.
Stage and production deployment remain outside this execution authority.
