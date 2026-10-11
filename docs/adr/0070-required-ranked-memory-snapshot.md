# ADR-0070: Require a ranked memory snapshot in each consciousness decision

- Status: Accepted
- Revision: 1
- Authority: [canonical decision](0070-required-ranked-memory-snapshot.think)
- Date: 2026-10-11
- Decision owner: Repository owner
- Related: ADR-0067, ADR-0069; docs/unified-consciousness.pert task memorySnapshot; docs/unified-consciousness-contract-v1.md C1/C2/C6/C7

## Context

Application v0.24.0-rc.8 completed its fixed Stage battle, but all 36 consciousness decisions omitted memory updates. The owner accepted the proposed replacement: every decision outputs the next ranked memory array, using strings "1" through "5" to retain or reorder previous entries. Owner instruction: 「では、それで試しましょう。」

## Decision drivers

- Make reviewing retained intentions and attention part of every decision.
- Express retention, reordering, deletion and new text with one small array.
- Preserve historical saved decisions and atomic world/memory commits.

## Considered options

1. Keep optional insert/remove operations: already unused in the observed battle.
2. Require full text every time: simple but repeats retained text and changes identity.
3. Require a next-state array with old-rank references: selected for simplicity and reduced repeated output.

## Decision

Accept revision1. Introduce consciousness policy v3, consciousness prompt v3 and consciousness output format v2, retaining pipeline unified-consciousness-v1 and battle binding format v6. Each new-format response requires `memory: string[]`, maximum five entries. Array position determines the next priority. Exact strings "1" through "5" refer to the immutable input memory at that rank; resolve all references against that same input, never against partially updated output. References preserve entry IDs and text. Reject nonexistent or duplicate references. Other strings contain 1–400 Unicode code points and receive deterministic decision/position IDs. Entries omitted from the array are deleted. `[]` explicitly clears memory. Digits "1" through "5" are reserved, not literal new content. Do not interpret or correct text semantically. Action and speech remain optional; no memoryOperations in output format v2. Missing or invalid memory rejects the entire response; no content retry, repair or fallback.

Review memory after choosing the action/speech for each consciousness decision, including initial tick and silence/no-action decisions. This adds no separate end-of-turn LLM call. Prepared results remain private; commit memory with the existing fenced world transaction. Preserve policy v2 retry and failed-action feedback limits unchanged in policy v3.

## Consequences

### Positive

- Every valid new-format decision explicitly chooses what to retain.
- Rank references avoid retransmitting unchanged text.

### Negative and risks

- Required output does not guarantee useful memory; repeated empty arrays remain valid.
- Rank mistakes cause technical failure, and new text consumes the existing 1,000-token output budget.

## Compatibility and migration

ADR-0067 is superseded only for memory output semantics on the new opt-in policy v3; historical policies v1/v2, output format v1 and prompts v1/v2 retain their behavior. No database migration, historical battle conversion or public memory exposure. Trial uses explicit policy v3 creation; public default remains policy v2 until live acceptance. This instruction authorizes implementation and offline tests. Paid trials require the concrete fixture and separate bounded approval under ADR-0067 C8; this ADR does not grant new paid-run or production-cutover authority.

## Verification

Test old-rank swaps, mixed new/retained entries, deletion/clear, duplicate/missing references, Unicode bounds, required output, schema/policy mismatch, atomic rejection, replay and next-input propagation. Preserve historical prompt bytes. Run official governed tests, build and typecheck after individual source-authority review. Offline tests do not prove actual LLM memory use or savings.

## Implementation references

- Canonical task: docs/unified-consciousness.pert task memorySnapshot.
- Baseline live battle: btl_879a7f53a2e46266e0970549da8baa1d, Stage38114752919; application v0.24.0-rc.8 release evidence.
