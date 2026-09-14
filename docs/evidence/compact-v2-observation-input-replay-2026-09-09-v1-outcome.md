# Compact V2 observation-input provider replay — outcome

## Disposition

The approved run `compact-v2-observation-input-replay-2026-09-09-v1` was
executed once and stopped fail-closed. The overall run status is **failed**.
It must not be retried, resumed, or resent under the existing approval.

- Frozen implementation: `fe9a7da48425f4bfa75b0da40073e6b600136cb8`
- Contract digest:
  `2ecafe1a51843fc2b0667a7f075037bcd355644da162079b3c4698617d115399`
- Started: `2026-09-09T10:18:42.356Z`
- Stopped: `2026-09-09T10:19:08.231Z`
- Provider/model: xAI `grok-4.3`
- Physical requests: 12 of the permitted 18, all serial
- Request labels: six psyche, one bounded psyche repair, five expression
- Provider request status: 12 succeeded
- Actual usage: 21,913 input tokens and 2,437 output tokens
- Price-snapshot estimate: USD 0.03348375
- Reserved usage before stop: 118,001 tokens and USD 0.16050125

The retained machine-readable request, response, usage, and application-stop
evidence is `compact-v2-observation-input-replay-2026-09-09-v1/run-state.json`.

## Observed partial result

The ordinary scenario completed all three expression calls. Each utterance
used a distinct fresh observation from its turn:

1. `足元の水面だけが揺れたね。`
2. `ミナトが半歩下がって、手元を見たね。`
3. `ミナトがこちらへ向き直ったね。遠くで鐘が鳴った。`

This is direct evidence that the corrected observer input can produce
turn-specific utterances in this synthetic ordinary scenario. It is not a
complete replay result and does not establish production improvement.

The repeat-capable scenario completed its first two expression calls with the
same permitted line, `ここは譲らない。`, while deep psyche selected
`reiterate`. This preserves evidence that exact repetition itself remains
valid.

## Failure

On the repeat-capable scenario's third psyche call, the model returned
`expressionBrief` under `delta` rather than at the required top level. The
initial application error was:

`expressionBrief: invalid_type (Required)`

The one permitted semantic-repair call then returned appraisal-shaped fields
inside `replacement.expressionBrief`. The replacement failed with:

- `replacement.expressionBrief.sourceThread: invalid_type`
- `replacement.expressionBrief.focus: invalid_type`
- `replacement.expressionBrief: unrecognized_keys`

The application therefore rejected psyche, skipped the sixth expression call,
and stopped the run. No fallback, judge, retry, resume, resend, deployment, or
persistent battle creation occurred.

## Evidence classification

- Confirmed: ordinary turn-specific observation text reached three distinct
  generated utterances in the completed synthetic slice.
- Confirmed: deliberate exact repetition remained accepted for two completed
  turns.
- Confirmed: the bounded repair did not recover the third repeat-capable psyche
  response.
- Unknown: whether the observation correction improves complete battles or
  production dialogue. The approved run did not complete.
- Preliminary source-cause candidate: the repair prompt requires a complete
  `expressionBrief` but does not state that object's field names and types. The
  retained response is consistent with that ambiguity, but this run alone does
  not establish model causality or authorize a correction.

