# Compact V2 deep-psyche rejection RCA — 2026-09-09

## Conclusion

The integration root cause is the mismatch between the value contract shown to
the producer model and the value contract enforced by the consumer schema.
The prompt's concrete JSON return example shows all six required appraisal
strings as `""`, while the application schema rejects each of them unless it has
at least one character. The real `grok-4.3` response reproduced those six empty
values and was rejected.

This establishes the source defect in the integration contract. It does not
establish the model's hidden internal reason for selecting the empty values.
The later Grok review is corroborating evidence for a likely prompt-following or
priority effect, but Grok itself labelled that conclusion a hypothesis and made
several factual mistakes in its review.

## Evidence chain

### Claims

- **C-RCA-001 📜 High — immediate mechanism:** validation failed because the
  response contained empty strings in six fields whose schema has `min(1)`.
- **C-RCA-002 📜 High — integration root cause:** the producer-facing return
  example and consumer schema express incompatible concrete value constraints.
- **C-RCA-003 🧠 Medium — likely production path:** the empty exemplars caused or
  materially biased this sample toward empty defaults.
- **C-RCA-004 📜 High — escape cause:** existing local fixtures started with
  valid non-empty values, so they did not test prompt/provider/schema alignment.
- **C-RCA-005 🎲 Low — model-internal cause:** why the earlier sampling process
  selected the placeholders rather than following the prose semantics remains
  unknown.

### Evidence

- **E-RCA-001 📜:**
  `packages/shared/src/battle.ts:963-978` applies `min(1)` to the six fields.
- **E-RCA-002 📜:**
  `backend/src/llm/openai-compatible.ts:2706-2708` asks for semantic appraisals,
  then displays the same required strings as empty values in the JSON example.
- **E-RCA-003 📜:**
  `compact-v2-provider-replay-2026-09-09/run-state.json:28-38` preserves the
  complete response, six empty required strings, and 191/1,200 output-token use.
- **E-RCA-004 📜:** the input at `run-state.json:25-26` contains a non-empty
  `counterpartResult`; the response uses that thread in `expressionBrief.focus`
  and fills two intentions, so the whole semantic task was not skipped.
- **E-RCA-005 🧠:**
  `compact-v2-provider-replay-2026-09-09/grok-cause-review.json:30-47` says the
  six strings were probably treated as optional or low priority, suggests an
  explicit non-empty instruction, and labels the RCA status `hypothesis`.
- **E-RCA-006 📜:** that review incorrectly says the prompt explicitly required
  all six values to be non-empty, says `ambientChange` supplied evidence although
  it was empty, and says all expressionBrief fields were filled although
  `observedImpact` was empty. It also omits the empty-string exemplar.
- **E-RCA-007 📜:**
  `packages/shared/src/compact-psyche-decode.test.ts:9-40` constructs a
  hand-authored, already-valid non-empty fixture; the tests do not observe a
  provider response to this prompt.

### Reasoning

- **R-RCA-001 🧠:** E-RCA-001 through E-RCA-003 directly establish both sides of
  the incompatible interface and the resulting rejection. Therefore C-RCA-001
  and C-RCA-002 do not depend on Grok's retrospective opinion.
- **R-RCA-002 🧠:** E-RCA-004 makes lack of usable observation an insufficient
  explanation, while the complete 191-token JSON makes truncation implausible.
- **R-RCA-003 🧠:** E-RCA-005 is consistent with C-RCA-003, but E-RCA-006 and the
  absence of access to prior hidden state prevent promoting it to direct proof.
- **R-RCA-004 🧠:** E-RCA-007 explains why the defect escaped tests, but did not
  create the contradictory producer/consumer contract.

## RCA classification

- **Root cause:** prompt/schema contract mismatch. The output example permits or
  demonstrates empty required values that the receiving schema rejects.
- **Contributing cause:** the dense nested instruction and pre-existing empty
  state may have increased the chance of copying defaults. This is not proven.
- **Escape cause:** tests validated hand-authored good objects rather than the
  real prompt-to-model-to-schema boundary.
- **Ruled out as primary causes for this sample:** provider transport failure,
  model mismatch, malformed JSON, missing usage, missing observation input, and
  output truncation.
- **Remaining unknown:** the earlier model's internal selection mechanism and
  whether one wording change alone will generalize across samples.

## Proposed actions

- **A-RCA-001 — proposed/held:** state immediately before the return shape that
  all six strings must be non-empty and grounded in the current observation.
- **A-RCA-002 — proposed/held:** replace `""` placeholders with semantic
  metavariables or a complete valid example; do not weaken the accepted schema.
- **A-RCA-003 — proposed/held:** add a prompt/schema contract regression that
  detects invalid exemplars, followed by local validation.
- **A-RCA-004 — proposed/held:** if real-provider confirmation is later approved,
  use a new immutable run identity; do not resend the preserved run.

No corrective action and no additional provider request was executed as part of
this RCA. The audited command-line reasoning source is
`compact-v2-provider-replay-2026-09-09.think`.

## Accepted implementation follow-up

After this RCA was completed, ADR-0026 was accepted separately. Its local
implementation completes A-RCA-001 through A-RCA-003 and adds one bounded
semantic-closure repair with full merged-result validation. A-RCA-004 remains
held: no new provider replay, deployment, or release was performed.

## LLMThink audit

Command-line `llmthink dsl audit` completed with `fatal=0`, `error=0`,
`warning=0`, and `info=0`. The thought remains a draft evidence artifact; the
audit validates its dependency structure, not the truth of external facts.
