# Corrected Compact V2 provider replay — approval candidate

## Outcome

The approved run started at 2026-09-09 15:55:56 JST and stopped at 15:55:59
JST after its first deep-psyche application result. Exactly one physical request
was sent. It used 1,870 input and 316 output tokens (2,186 total); its reserved
amount was 10,711 tokens and USD 0.01488875.

The xAI transport succeeded and returned `grok-4.3`, but the application schema
rejected `delta.dialogueThread.unresolvedMove` because the response used `null`
where `DialogueThreadStateSchema` requires a string. This issue is outside the
ADR-0026 appraisal/expression repair eligibility boundary, so no repair request
was sent. The expression guard then prevented the expression request. No later
turn or scenario was sent, and the run must not be retried, resumed, or resent.

The immutable state is retained in
`compact-v2-provider-replay-repair-2026-09-09/run-state.json`. A run receipt is
absent because the application did not complete.

## Purpose

This is a new, bounded xAI replay candidate for the Compact V2 implementation
corrected under Accepted ADR-0026. It does not resume or resend the immutable
failed run `compact-v2-provider-replay-2026-09-09-v1`.

## Frozen execution contract

- Run ID: `compact-v2-provider-replay-repair-2026-09-09-v1`
- Corrected implementation: `dfe1c34bcd0d9f4110a0d3b4ca06822fe0db69d7`
- Decision basis: Accepted ADR-0025 and ADR-0026
- Provider/model/API: xAI `grok-4.3`, Chat Completions, reasoning `none`
- Scope: two synthetic in-memory scenarios, three turns each
- Physical requests: at most 18, serial
  - 6 initial deep-psyche requests
  - at most 6 one-shot semantic-closure repairs
  - 6 expression requests
- Input ceiling: 20,000 bytes per request
- Output ceilings: 1,200 tokens for psyche and repair; 400 for expression
- Reserved token ceiling: 300,000
- Monetary ceiling: USD 0.50
- Retry, recursive repair, provider fallback, judge, database write, deployment,
  release, and battle creation: prohibited
- Contract digest:
  `447475632a2dc3daed050fe84c86039ea5d868ba22cb6537dcf12671ab47f7e0`

Execution is fail-closed. Any provider, model, usage, schema, semantic-closure,
application, ceiling, or evidence-persistence failure stops the run. An existing
`run-state.json` prevents retry, resume, or ambiguous recovery.

## Network-zero preparation evidence

Preparation exercised the worst-case permitted path by forcing one eligible
deep-psyche rejection and one successful bounded repair on every turn. It made
zero network requests and produced:

- 18 prepared calls with contract version 2
- 168,636 reserved tokens
- USD 0.231795 reserved cost
- 9,415 bytes maximum input size
- 6 accepted application turns

The machine-readable contract and proof are retained in
`compact-v2-provider-replay-repair-2026-09-09/execution-contract.json` and
`compact-v2-provider-replay-repair-2026-09-09/prepare-proof.json`.

## Authority boundary

Approval of this candidate authorizes only one execution of the exact run ID and
contract digest above. It does not authorize a push, PR, merge, release, Stage or
production deployment, production promotion, or persistent observation battle.
Those remain later, separate decisions after the replay evidence is reviewed.
