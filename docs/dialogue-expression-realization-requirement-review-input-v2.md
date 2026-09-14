# Dialogue expression realization requirement review input v2

> Historical WIP retained for handoff on 2026-09-08. This is not the current
> requirement or implementation authority. Its lifecycle-ID proposal is excluded
> by accepted requirement v3; use `dialogue-expression-realization-requirement-v3.md`
> and `dialogue-expression-realization-requirement-acceptance-v3.md` instead.

- Lifecycle stage: Step 1 candidate and self-review
- Candidate: `docs/dialogue-expression-realization-requirement-v2.md`
- Candidate checksum (SHA-256):
  `6a9363180ea4428abfb4cb197bc728fefe618822b966d8a1954b077207f94e91`
- Owner route after first review: not selected

## Source provenance and prior authority

- The product request separates durable character state from completed
  utterance actuals while preserving a character that repeats the same line.
- `docs/requirements.md` is the current normative baseline. The candidate
  proposes a new-policy clarification to F-BTL-13 and F-BTL-15.
- F-BTL-37, F-BTL-48, ADR-0004, and ADR-0008 are preserved.
- Existing battle IDs, old battle-policy bindings, and historical snapshots are
  not renamed or migrated by this candidate.

## In scope

- Content-independent identity for each expression occurrence.
- Provenance links among the current opportunity, provider operation, terminal
  receipt, and zero or one utterance event.
- Battle-local short IDs `o001`, `p001`, `r001`, and `u001`, with three or four
  digits, monotonic allocation, no wrap, and no reuse; short policy code
  `er001`.
- Closed schemas, observer privacy, narrator non-feedback, compatibility, and
  unchanged successful-path provider call count.

## Out of scope

- Content diversity as a correctness rule.
- Text-equality rejection, phrase bans, semantic-similarity gating, or an LLM
  intention classifier.
- Implementation, paid replay, Stage activation, production promotion, or
  migration of an existing battle.

## Acceptance criteria to review

1. Equal text from separate current opportunities produces separate events.
2. Different text does not make a reused prior result valid.
3. Recovery of the same persisted provider operation commits at most once.
4. The lifecycle IDs use only the approved short formats and remain unique
   inside one battle.
5. Invalid provenance cannot trigger prior-line, mock-prose, provider, or
   cross-provider fallback.
6. The stated privacy, type, replay, and provider-count boundaries hold.

## Unknowns and owner decision

- The owner must decide whether invalid cross-opportunity provenance should
  terminate with no utterance and no automatic retry, as proposed, or use a
  different explicit failure contract.
- The owner must select one first-review route: `REVISE`,
  `REVIEW_THEN_REVISE`, `REVIEW_THEN_DECIDE`, or `REVIEW`.

## Proposed independent-review questions

1. Does any candidate clause still infer event identity or validity from text
   equality, normalization, semantic similarity, or declared repetition intent?
2. Can any retry, queue recovery, compatibility field, or fallback path bind a
   prior `pNNN`, `rNNN`, or `uNNN` to a new `oNNN`?
3. Are short IDs unambiguous within one battle, fail closed at `9999`, and kept
   distinct from checksums and immutable external identifiers?
4. Does the candidate preserve F-BTL-37, F-BTL-48, ADR-0004, ADR-0008, observer
   privacy, and immutable old-battle behavior?
5. Does any proposed requirement silently authorize implementation, provider
   calls, release, or deployment?
