# ADR-0071: Use required ranked memory for new public battles

- Status: Accepted
- Revision: 1
- Date: 2026-10-11
- Decision owner: Repository owner
- Authority: [canonical decision](0071-ranked-memory-production-default.think)
- Related: ADR-0070 revision1; docs/unified-consciousness.pert tasks releaseMemory/stageMemory/promoteMemory; PR #183

## Context

Consciousness output format v2 requires a next-memory array and supports frozen old-rank references. PR #183 passes all four required CI checks and 1,530 local governed tests. Two owner-approved real gpt-6-luna calls created two memories, then retained rank1 and updated the other entry. The first local-key HTTP401 remains failed evidence. This probe is not full-battle acceptance. The owner now explicitly requests production deployment of the memory-using implementation and permits the minimum necessary production connections, tests and paid use.

## Decision drivers

- Make required memory review the actual new-public-battle behavior.
- Preserve immutable historical battles and verify real full-battle execution before promotion.
- Bound paid validation and promote exact accepted artifacts.

## Considered options

1. Leave policy v3 opt-in: does not deliver the owner's production goal.
2. Convert existing battles: violates saved bindings and is unnecessary.
3. Select policy v3 for new public battles only: selected.

## Decision

Accept revision1. New authenticated public battle creation binds consciousness policy v3, consciousness prompt v3 and consciousness output format v2 under battle binding format v6. Retain pipeline unified-consciousness-v1. ADR-0070 memory semantics are unchanged, including mandatory memory with empty allowed, max5, frozen old-rank references and fail-closed invalid responses. No new LLM call, output repair or fallback. Existing battles retain their saved policy/prompt/output.

The owner's current goal supplies execution authority for minimum paid testing and production promotion. Run one fixed Stage battle, maximum38 advances and200 physical provider attempts, character-generation smoke disabled, known429 retries only within existing policy/caps. No automatic repeat of an unchanged failed run. Cost remains unpriced without a verified price table. Preserve failures and correct confirmed defects under existing authority before any new bounded corrective run. Require successful exact-source CI, successful Stage, closed usage accounting, terminal battle and completed narration; inspect actual memory outputs and next-input carry-forward. Promote the exact Stage backend digest/revision and Worker version through protected production review, then verify traffic, public health and authenticated smoke.

## Consequences

### Positive

- Production new battles actually review and carry ranked private memory.
- Historical execution remains bound and testable.

### Negative and risks

- Required output does not guarantee useful content; a fixed battle is bounded acceptance, not broad quality or savings proof.
- Invalid memory causes technical failure; retain original evidence rather than rewriting responses.

## Compatibility and migration

Partially supersede ADR-0070 only for its opt-in/public-default and later paid/cutover authority boundary. Its memory contract remains authoritative. No schema migration, secret rotation, environment change or historical battle conversion. Previous application v0.24.0-rc.8 cannot parse new policy v3/output format v2 battles; rollback is compatible with the additive database schema but those new battles require a compatible application. Private memory stays outside public DTOs/narration input and release evidence.

## Verification

HTTP creation regression asserts exact policy v3/prompt v3/output format v2 and private runtime isolation. Preserve all existing immutable generation/history/privacy assertions. Review/reseal affected authority individually; run governed full tests, typecheck, build/static and ADR checks. Inspect Stage runtime decisions for required memory and nonempty next-input carry-forward, closed provider ledger and all narration complete. Verify successful protected promotion and independent production readback.

## Implementation references

- PR #183: https://github.com/mako10k/kshiai/pull/183
- Real-model probe: https://github.com/mako10k/kshiai/pull/183#issuecomment-6106374943
