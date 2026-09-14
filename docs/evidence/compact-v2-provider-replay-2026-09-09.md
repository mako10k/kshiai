# Compact V2 real-provider replay — 2026-09-09

## Outcome

The approved bounded replay stopped on the first ordinary-character turn after
the Compact deep-psyche response failed application schema validation. No
request was retried, and the remaining ten planned physical requests were not
sent.

- Implementation under test: `f1ff97735e7bfd42be4c21a0e421bec334052005`
- Harness branch/starting HEAD: `codex/monotony-log-rca` at `154dcb4`
- Provider/model: xAI `grok-4.3`, reasoning `none`
- Execution interval: 2026-09-09 09:04:00–09:04:04 JST
- Physical requests: 2 of at most 12
- Usage: 3,320 input + 222 output = 3,542 tokens
- Conservative usage cost: USD 0.004705
- Reserved before transmission: 17,743 tokens, USD 0.02417875
- Retry, judge, provider fallback, database write, deployment: none

The provider transport succeeded for both physical requests and returned the
expected model with complete usage fields. The application outcomes differed:

1. Deep psyche: rejected with `schema_invalid`.
2. Expression: fulfilled; the accepted current utterance was
   `ミナトの位置をはっきりと捉えた。`

The battle-service continued the already-started turn after retaining the prior
psyche state, so the expression request occurred before the harness could apply
its turn-level stop check. It then stopped before turn 2. This is not a retry or
replacement result.

After preserving the immutable run evidence, the harness was corrected locally
so a thrown psyche application failure arms a stage guard and prevents the
expression transport call. This recurrence-prevention change was typechecked;
it was not used to resend or reinterpret the recorded run.

## Observed failure

The raw deep-psyche response returned the expected object structure but copied
empty strings into all six fields that the Compact schema requires to be
non-empty:

- `anticipatedImpact`
- `observedImpact`
- `anticipatedSocialConsequence.meaning`
- `observedSocialConsequence.meaning`
- `nextApproach`
- `continuityBasis.reason`

The response did provide non-empty `expressionBrief.relationshipMove` and
`expressionBrief.publicAim`, so this was not an empty response or a transport
failure. The validator correctly rejected the six `too_small` values.

## Causal classification

- Immediate rejection mechanism: `grok-4.3` returned empty strings for six
  required Compact appraisal fields; the accepted schema requires each to have
  length at least one.
- Producing-mechanism hypothesis supported by the current evidence: the prompt's JSON
  return example represents those six required fields as `""` placeholders and
  does not state at that return boundary that they must be non-empty. The model
  reproduced those placeholder values while filling other semantic fields.
- Remaining unknown: one observation cannot establish whether the model always
  follows the empty placeholders or which wording change would be sufficient.
- Escape cause: local decoder tests used hand-authored non-empty fixtures and
  therefore established schema handling, not the real model's response to the
  prompt exemplar.

No prompt or schema change and no second paid execution is included in this
evidence. A correction needs its own reviewed local change; another paid replay
would need a new immutable run identity and explicit approval because
`run-state.json` deliberately forbids resending this run.

## Artifacts

- `compact-v2-provider-replay-2026-09-09/execution-contract.json`
- `compact-v2-provider-replay-2026-09-09/prepare-proof.json`
- `compact-v2-provider-replay-2026-09-09/run-state.json`
- `compact-v2-provider-replay-2026-09-09/run-receipt.json`

The raw requests and responses in `run-state.json` contain only synthetic
fixture material. No API key or real user character data is retained.

## Same-model retrospective review

At the owner's explicit request, one separate `grok-4.3` Chat Completions call
was made at 09:45 JST with the exact prior prompt, response, and validator
errors. It used 2,117 input and 469 output tokens, with no retry.

Grok classified the producing cause as a hypothesis. Its leading explanation
was that generation treated the six appraisal strings as optional or
low-priority defaults while completing the outer JSON structure. It rated the
complex nested instruction/JSON-only format as a medium-confidence contributor
and proposed explicitly requiring all six strings to be non-empty immediately
before the JSON shape.

The retrospective answer is not direct access to the earlier generation's
hidden state, and parts of it overstate the evidence: the prior prompt did not
literally say all six strings must be non-empty; `ambientChange` was empty; and
`expressionBrief.observedImpact` was also empty. Its token-truncation alternative
is weakened by the complete JSON response using only 191 of the allowed 1,200
output tokens. It also did not discuss the prompt's empty-string exemplars,
which remain an independently observed producing-mechanism hypothesis.

The complete review request and response are retained in
`compact-v2-provider-replay-2026-09-09/grok-cause-review.json`.

## LLMThink RCA

The command-line LLMThink RCA incorporates the retrospective response as one
bounded evidence item. It identifies the integration root cause as the mismatch
between the empty-string JSON exemplar in the producer prompt and the non-empty
consumer schema, while leaving the earlier model's hidden selection mechanism
unknown. The audited evidence chain and proposed-but-held actions are recorded
in `compact-v2-provider-replay-rca-2026-09-09.md`; its authoritative reasoning
source is `compact-v2-provider-replay-2026-09-09.think`.
