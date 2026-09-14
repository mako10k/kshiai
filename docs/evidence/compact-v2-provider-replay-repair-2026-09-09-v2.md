# Second corrected Compact V2 provider replay — approval candidate

## Outcome

The approved run completed successfully from 2026-09-09 16:44:25 to 16:44:48
JST. All 12 physical requests succeeded with xAI `grok-4.3`: six deep-psyche
requests and six expression requests. No application repair was needed.

- Usage: 22,050 input + 2,359 output = 24,409 tokens
- Estimated usage cost: USD 0.03346
- Reserved before transmission: 117,541 tokens, USD 0.15892625
- Accepted turns: 6 of 6
- Psyche application status: fulfilled on every turn
- Expression application status: fulfilled on every turn
- Utterance history: advanced exactly once on every turn

The ordinary scenario produced three current expressions. The repeat-capable
scenario produced `ここは譲らない` on all three turns, and every identical
utterance was accepted through the same normal path. No prior-line fallback,
text comparison, retry, critic, or reuse detector was exercised.

The immutable execution state and receipt are retained in
`compact-v2-provider-replay-repair-2026-09-09-v2/run-state.json` and
`compact-v2-provider-replay-repair-2026-09-09-v2/run-receipt.json`.

## Purpose

This candidate verifies the existing strict Compact V2 contract after clarifying
that `dialogueThread.unresolvedMove` is a string and uses `""` when no unresolved
move exists. It does not expand ADR-0026 repair eligibility and does not resume
or resend `compact-v2-provider-replay-repair-2026-09-09-v1`.

## Frozen execution contract

- Run ID: `compact-v2-provider-replay-repair-2026-09-09-v2`
- Implementation: `3c383ed1b4185a3bcc78c62981a628ea2b24a270`
- Provider/model/API: xAI `grok-4.3`, Chat Completions, reasoning `none`
- Scope: two synthetic in-memory scenarios, three turns each
- Physical requests: at most 18, serial
- Input ceiling: 20,000 bytes per request
- Output ceilings: 1,200 tokens for psyche and repair; 400 for expression
- Reserved token ceiling: 300,000
- Monetary ceiling: USD 0.50
- Retry, recursive repair, provider fallback, judge, database write, deployment,
  release, and battle creation: prohibited
- Contract digest:
  `7bc4f2ef9e8c04a733c491737667a6d7542ab924de5615a67bf61ade413a56a0`

Execution is fail-closed. Any provider, model, usage, schema, semantic-closure,
application, ceiling, or evidence-persistence failure stops the run. An existing
`run-state.json` prevents retry, resume, or ambiguous recovery.

## Network-zero preparation evidence

The preparation forced the maximum one-shot repair path for all six turns and
made zero network requests:

- 18 prepared calls with contract version 2
- 169,188 reserved tokens
- USD 0.232485 reserved cost
- 9,507 bytes maximum input size
- 6 accepted application turns

Machine-readable evidence is retained in
`compact-v2-provider-replay-repair-2026-09-09-v2/execution-contract.json` and
`compact-v2-provider-replay-repair-2026-09-09-v2/prepare-proof.json`.

## Authority boundary

Approval authorizes only one execution of the exact run ID and contract digest
above. It does not authorize push, PR, merge, release, Stage or production
deployment, production promotion, or a persistent observation battle.
