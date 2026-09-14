# ADR-0025: Separate Compact expression state and utterance history

- Status: Accepted
- Date: 2026-09-08
- Decision owner: Product owner
- Related: `docs/dialogue-expression-realization-requirement-v3.md`;
  `docs/dialogue-expression-realization-design.md`;
  `docs/dialogue-expression-realization.pert`; ADR-0004; ADR-0008
- Authority: `0025-expression-state-and-utterance-actuals.think`

## Context

Compact expression already receives psyche fields and recent dialogue in
separate objects. The separation is incomplete across the whole character
pipeline: Compact deep psyche still receives `lastSpeech` inside its previous
semantic state, expression output is named generic `speech`, the JSON result is
read through an arbitrary record, and accepted text is written back into
`CharacterAgentState.lastSpeech`.

Equal text is not a defect. Every valid current provider result is a new
occurrence regardless of whether the character repeats an earlier line.

## Decision drivers

- Keep completed utterances out of semantic state.
- Name the current output unambiguously without banning repetition.
- Reuse the existing battle revision boundary for at-most-once commitment.
- Avoid new lifecycle entities, identifiers, ledgers, or runtime classifiers.
- Preserve observer privacy, narrator separation, provider count, and old
  battle compatibility.
- Keep changed boundaries closed and free of type escapes.

## Considered options

1. Rename `speech` only. Rejected because `lastSpeech` remains mixed into
   Compact deep-psyche state.
2. Add expression opportunities, receipts, identifiers, and provenance checks.
   Rejected because no such reuse path was observed and the existing battle
   revision already owns at-most-once commitment.
3. Separate semantic state and completed history at both Compact boundaries,
   rename the current output, and reuse the existing save boundary. Proposed.
4. Reject repeated text or add a critic. Rejected because repetition is valid
   and the extra provider path does not correct state ownership.

## Decision

The selected direction is option 3.

OWNER_ACCEPTANCE: on 2026-09-08, after this decision under its branch-local
ADR-0024 identifier and its content-independent repetition handling were
explained, the product owner instructed, "では、一旦これで固めましょう。"
The accepted pre-acceptance `.think` snapshot had SHA-256
`bc9232d5fedb951e3f86420d06a2b32f1c6cb48b4d591c56b5ff2ea7910f1a9e`.

During integration on 2026-09-09, current main was found to already own a
different accepted ADR-0024. This record was therefore allocated ADR-0025. The
approved decision content and acceptance digest are unchanged.

1. Compact deep psyche and expression receive `expressionState` and
   `utteranceHistory` as separate closed fields.
2. `expressionState` contains neither `lastSpeech` nor `conversationHistory`.
3. Compact expression returns `nextUtterance` through a closed result schema.
4. Valid `nextUtterance` is accepted without text comparison or an intention
   label, including when it exactly repeats prior text.
5. Compact acceptance does not write the accepted line back into
   `CharacterAgentState.lastSpeech`.
6. Existing battle revision compare-and-save remains the sole at-most-once
   turn commit boundary.
7. No expression opportunity, realization receipt, new identifier, idempotency
   ledger, or runtime reuse detector is added.
8. Existing battles and non-Compact processing retain their recorded behavior.
9. Changed schemas do not end at `any`, arbitrary records, or `z.unknown()`.

ADR-0025 is Accepted at the owner-approved revision. Acceptance fixes the
architectural direction below; it does not itself instruct implementation,
provider replay, Stage, production, release, or migration.

## Consequences

### Positive

- Prior utterances are visibly historical rather than semantic state or a
  current result candidate.
- A one-line or refrain-based character remains valid without special labels.
- The implementation reuses the existing transaction and concurrency model.
- No IDs or lifecycle records are added to logs, snapshots, or provider input.

### Negative and risks

- Compact and non-Compact contracts differ until legacy behavior is retired.
- Mock and production adapters must change together because both currently use
  `lastSpeech` or `speech` in the affected path.
- A stale compatibility spread could accidentally reintroduce `lastSpeech`;
  focused type and prompt tests must cover the exact boundary.

## Compatibility and migration

- F-BTL-37 and F-BTL-48 remain unchanged.
- F-BTL-13 is clarified for the new Compact contract: `lastSpeech` remains
  readable compatibility data but is not semantic input or new output.
- F-BTL-15 keeps private-state updates and actual expression as separate
  outputs of one turn.
- Existing battle JSON remains readable and existing battles do not switch
  policy in place.
- No relational database migration or identifier migration is required.

## Verification

- Assert that both Compact inputs separate `expressionState` and
  `utteranceHistory`.
- Assert that neither semantic-state object contains `lastSpeech` or
  `conversationHistory`.
- Decode `nextUtterance` with a closed schema and accept exact repeated text.
- Assert that Compact acceptance does not update `lastSpeech`.
- Keep the existing stale battle revision regression green; add no second
  idempotency test system.
- Prove side privacy, narrator non-feedback, old-policy compatibility, and
  unchanged successful provider-call count.
- Run focused tests, full tests, typecheck, build, LLMThink audit, and PERT
  checks before implementation review.

## Implementation references

- Requirement and design only. No implementation is authorized or recorded.
