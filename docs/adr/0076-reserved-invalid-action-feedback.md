# ADR-0076: Reject invalid individual action updates with feedback

- Status: Proposed
- Revision: 1
- Date: 2026-10-12
- Decision owner: Repository owner
- Authority: [canonical decision](0076-reserved-invalid-action-feedback.think)
- Related: ADR0072 revision1; ADR0075 revision1; docs/unified-consciousness.pert

## Context

Application v0.25.0-rc.5 Stage38189337992 committed eight turns, using36physical attempts. The ninth adjudication charged4MP when only1MP remained. The reducer correctly rejected negative resources and atomically left the turn uncommitted. Cumulative attempts across five fixtures are97. Production remains application v0.24.0-rc.9.

## Decision drivers

Preserve strict canonical state while avoiding whole-battle termination for a single infeasible action. Deliver a clear failure reason to subsequent character decisions without another LLM call. Retain historical semantics and invalid raw evidence.

## Considered options

1. Prompt clarification alone: inexpensive but cannot ensure every arithmetic/reference error is avoided.
2. Clamp resources or accept invalid world changes: rejected because intended effects and costs would be silently altered.
3. Versioned per-action rejection and feedback: proposed.

## Proposed decision

Introduce reserved turn policy v5/output v3/prompt v5 for new battles. Keep raw received responses privately. Parse strict whole-trace structure and require exact count, order, reservation identity/side and baseRevision; malformed trace structure still aborts the turn.

For each structurally valid result, attempt its updates against the current working world. If canonical application rejects resources or world operations, reject all updates for that reservation, produce a server-owned failure receipt with an error code and feedback to the acting side, and continue the remaining ordered reservations from the unchanged world. No clamping, invented success or extra LLM call. Advance receipt and world revision metadata exactly once through the existing empty transition, as with other outcomes; physical world fields and resources remain unchanged. Canonical type/reference/resource checks remain authoritative.

When an earlier accepted update defeats/incapacitates an actor, later non-cancelled results become server-owned cancelled receipts with no updates. If a model already returned cancelled with updates, reject it structurally; do not reinterpret corrupted wire shapes. A success with nonempty updates that has no actual canonical effect becomes a failure receipt. Information-only success remains legal under ADR0075.

Persist the effective trace atomically with the world, memory and observer feedback; retain the original raw trace separately. Discard model observations for rejected/cancelled results because they may describe effects that were never applied. The acting side receives a server-owned failure/cancellation reason; other-side and public observations are empty. Narration consumes only effective public consequences, without revealing rejected private intents or costs. Old policies/output contracts retain their existing all-or-nothing rejection rules, and old prompt bytes are unchanged.

Tighten prompt v5 to explicitly fail unaffordable skills, never charge below zero, and simulate balances after each accepted reservation. The server remains the final integrity check. Existing policy v4 soft/hard timing, four normal calls,36turns and physical ceilings remain.

This is a proposal, not current implementation authority. Owner acceptance is pending. Proposed paid acceptance scope after repair: one additional fixed battle, max38advances/164physical attempts, cumulative261maximum preserved after97used; unpriced. No automatic rerun or character generation. Successful Stage precedes the already authorized production switch.

## Consequences

A rejected reservation produces usable feedback instead of stopping the battle. Later model results may have been reasoned from a rejected effect; canonical validation continues, but tactical quality is not guaranteed. Failed raw output is retained for audit. Strict malformed-input rejection remains necessary.

## Compatibility and migration

No database migration or historical rebinding. Bind new policy/output/prompt together and validate persisted effective traces under their frozen version. Preserve all five failed fixtures. Do not replay unknown sends or rewrite prior evidence.

## Verification

Regression tests cover insufficient MP (1 minus4), all-or-nothing per-reservation effects, subsequent order and base revision, private feedback and public narration, invalid references, no-op effects, defeat cancellation, malformed whole trace, old-policy strict behavior, exact raw evidence preservation and four-call execution. Full governed PostgreSQL suite, individual authority reviews, typecheck/build/static and exact-source CI precede new immutable candidate and paid Stage.

## References

- https://github.com/mako10k/kshiai/actions/runs/38189337992
- docs/evidence/reserved-turns-rc5-failure-2026-10-12.json
