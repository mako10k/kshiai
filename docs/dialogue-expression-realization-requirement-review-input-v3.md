# Dialogue expression state and history requirement review input v3

- Lifecycle stage: Completed / owner accepted
- Candidate: `docs/dialogue-expression-realization-requirement-v3.md`
- Candidate checksum (SHA-256):
  `b5c7f96f1e2d73d2bed4f3356f703942bed4c3c68414e7f06889c56dbad4c265`
- Owner route after first review: `REVIEW`
- Owner route evidence: on 2026-09-08 the product owner selected `REVIEW`
  after the exact candidate was explained.
- Step 3 report: `docs/dialogue-expression-realization-requirement-review-v3.md`
- Acceptance record:
  `docs/dialogue-expression-realization-requirement-acceptance-v3.md`

## Source provenance and prior authority

- The product request separates semantic character state from completed
  utterance history while preserving characters that intentionally repeat the
  same line.
- `docs/requirements.md` remains the normative baseline. The candidate
  clarifies the new Compact disposition of F-BTL-13 and F-BTL-15.
- Accepted ADR-0024 fixes the architecture for separate `expressionState` and
  `utteranceHistory`, closed `nextUtterance`, content-independent acceptance,
  the existing battle revision commit boundary, and no new reuse classifier or
  lifecycle identity.
- F-BTL-37, F-BTL-48, ADR-0004, and ADR-0008 are preserved. Existing battles,
  policy bindings, identifiers, and historical snapshots are not renamed or
  migrated.

## In scope

- Closed, separate Compact semantic-state and completed-history inputs for deep
  psyche and outward expression.
- Closed `nextUtterance` output for the current expression call.
- Exact repetition, paraphrase, and different wording following the same
  acceptance path.
- Existing battle revision compare-and-save as the sole at-most-once turn
  commitment boundary.
- Removal of new Compact `lastSpeech` semantic input and state output.
- Observer privacy, narrator non-feedback, old-policy compatibility, unchanged
  successful-path provider count, and removal of arbitrary-record type escapes
  on the changed boundary.

## Out of scope

- Text-equality rejection, phrase bans, semantic-similarity gating, repetition
  intent classification, quality scoring, or forced wording diversity.
- Expression opportunities, realization receipts, new provider-operation or
  utterance-event IDs, secondary idempotency ledgers, or runtime reuse
  detectors.
- Automatic provider retry, critic calls, prior-line fallback, mock-text
  substitution, or cross-provider fallback.
- Paid replay, Stage activation, production promotion, release, or migration of
  an existing battle.

## Acceptance criteria to review

1. Compact deep-psyche and expression inputs contain separate
   `expressionState` and `utteranceHistory` fields.
2. Semantic state contains neither `lastSpeech` nor `conversationHistory`.
3. Provider output is decoded from `nextUtterance` through a closed schema.
4. Equal and different prior text follow the same acceptance behavior without
   retry, critic, fallback, or an intent label.
5. New Compact acceptance does not write the accepted text into `lastSpeech`.
6. The existing battle revision boundary still rejects a stale save, with no
   second idempotency mechanism.
7. Provider input preserves observer privacy and excludes narrator-rendered
   prose from utterance history.
8. Existing battle snapshots retain their recorded behavior.
9. Successful-path provider operation count is unchanged.
10. Changed shared and backend boundaries contain no `any`, arbitrary-record,
    or `z.unknown()` terminal contract.

## Unknowns and owner decision

- No implementation unknown currently changes the stated requirement. An
  independent review may identify contradictions or evidence gaps, but cannot
  add optional behavior to the candidate.
- The selected first-review route was `REVIEW`. After Step 3, the owner made
  acceptance conditional on correcting E1. The design fixed the existing
  immutable snapshot `schemaVersion` as the V1/V2 contract selector, and the
  unchanged candidate was accepted.

## Proposed independent-review questions

1. Does any clause still make correctness depend on text inequality,
   normalization, similarity, or a declared reason for repetition?
2. Do `expressionState`, `utteranceHistory`, and `nextUtterance` have distinct,
   closed ownership without a second copy of completed speech in semantic
   state?
3. Does the candidate preserve canonical utterance authority, existing battle
   revision commitment, observer privacy, narrator separation, immutable
   old-battle behavior, and provider-count boundaries?
4. Does any clause reintroduce an opportunity, receipt, identifier, ledger,
   runtime reuse detector, retry, critic, or fallback excluded by ADR-0024?
5. Does any proposed requirement silently authorize implementation, provider
   calls, Stage, production, release, or migration?
