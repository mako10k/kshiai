# ADR-0002: Separate advance and narration APIs

- Status: Accepted
- Date: 2026-08-12
- Decision owner: Product owner
- Related: GitHub Issue #98; ADR-0001; `docs/issue-98-battle-pipeline-plan.md`; PERT tasks `T_WIRE_SEQUENTIAL_DECISION` and `T_HARDEN_CAUSAL_DURABILITY`

## Context

The current battle advance path resolves mechanics, reconciles semantic and world state, advances character agents, calls the narrator, streams narrator progress, applies narrator recognition continuity, and finally saves the battle. This makes narration latency and provider failure part of gameplay advancement even though committed narration does not cause the next mechanical state.

The causal dependency is one-way: committed advance facts are input to narration. Narration text must not be input to a later advance. Issue #98 also introduces durable bucket checkpoints, making it more important that optional rendering work cannot delay, replay, or overwrite committed mechanics.

## Decision drivers

- Gameplay commits must not depend on narrator latency or availability.
- Narration must describe exactly one immutable committed turn, not a later battle state.
- A stream reconnect must not invoke the narrator provider again.
- Later advances may run while earlier narration is pending.
- Public display order must follow battle turn order rather than job completion order.
- Narrator output must not acquire canonical mechanics or winner authority.

## Considered options

1. Keep narration inside `advance`. This preserves one response stream but couples gameplay completion to rendering latency, retry, and failure.
2. Commit advance first and create a separate immutable narration job. This adds job storage and a second API while preserving the actual causal direction.
3. Generate narration optimistically before gameplay commit. This can publish facts that never commit and is rejected.

## Decision

Choose option 2.

`POST /api/battles/:battleId/advance` owns character decisions, validation, bucket mechanics, semantic and world transitions, terminal determination, and durable turn finalization. It creates or reuses exactly one narration job for the committed turn receipt and returns `turnReceiptId`, `narrationId`, and narration status without waiting for narrator generation.

`GET /api/battles/:battleId/narrations/:narrationId` reads the durable job. `GET /api/battles/:battleId/narrations/:narrationId/stream` streams that job's stored progress and result. Reconnection reads the same job and never creates a provider call.

A subsequent `advance` does not inspect narration status or output. Narration input is an immutable snapshot containing the turn receipt, causal and observer-safe projections, narration style revision, perspective, labels, and schema version. UI placement uses battle turn and narration sequence, not completion time.

Narrator recognition updates may not write canonical `BattleState` asynchronously. They are removed, or stored in a revisioned narration-only read model after server validation. Terminal winner selection is finalized by deterministic gameplay rules before the narration job is created; the narrator may explain but not change it.

## Consequences

### Positive

- Gameplay can continue through narrator timeout or outage.
- Advance retry and narration retry have separate idempotency domains.
- Narration always refers to a frozen committed turn.
- Multiple pending narrations cannot overwrite a newer battle state.

### Negative and risks

- The UI must show pending, streaming, completed, and failed narration independently.
- Narrations can complete out of order and require ordered placeholders.
- A durable job/outbox, retention policy, access control, and stream replay protocol are required.
- Existing narrator continuity and terminal adjudication authority must be migrated.

## Compatibility and migration

- Existing embedded narration remains readable as a legacy representation.
- New turn records reference a narration job; they do not require completed prose.
- The current advance SSE endpoint remains a compatibility surface until clients use the narration stream.
- Job creation must be transactionally correlated with the committed turn receipt or recovered through an outbox.
- Release, deployment, and production backfill require separate approval.

## Verification

- Advance succeeds and the next advance runs while narration is pending or failed.
- Narration input remains unchanged after later turns and asset edits.
- Reconnect and duplicate requests do not call the provider twice.
- Turn N+1 narration completing first does not reorder Turn N and N+1 in the UI.
- Narrator output cannot change battle state, winner, perception, or character decisions.
- Access checks prevent reading another user's narration job or private trace.

## Implementation references

- Add API, persistence, frontend, migration, and verification commits here.
