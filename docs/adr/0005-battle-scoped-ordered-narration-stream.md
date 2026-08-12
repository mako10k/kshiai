# ADR-0005: Battle-scoped ordered narration stream

- Status: Accepted
- Date: 2026-08-12
- Decision owner: Product owner
- Supersedes: [ADR-0002: Separate advance and narration APIs](0002-separate-advance-and-narration-apis.md)
- Related: GitHub Issue #98; ADR-0001; `docs/current-battle-pipeline.md`; `docs/issue-98-battle-pipeline-plan.md`; PERT tasks `T_HARDEN_CAUSAL_DURABILITY` and `T_SEPARATE_ADVANCE_NARRATION`

## Context

ADR-0002 correctly separated canonical battle advancement from narration, but
modeled each narration as a client-visible job identified by a new
`narrationId`. That makes the client reconnect for every committed turn and
treats one battle's continuous story as unrelated job streams.

The actual ordering requirement belongs to the battle. A later advance may
commit while an earlier turn is still being narrated, but the later narration
must not begin or appear before the earlier narration reaches a durable terminal
state. A client watching the battle should retain one SSE connection across
advances. Stream recovery needs a durable event cursor, not a second public
domain identifier for the same turn receipt.

Each narration is already causally bound to one immutable committed phase or
turn receipt. Therefore `battleId + turnReceiptId` is sufficient as its logical
public identity, provided the server enforces one logical narration per receipt.
Provider attempts still need internal identities for operations and cost
receipts, but those identities are not navigation keys for clients.

## Decision drivers

- Preserve the central ADR-0002 rule that narration cannot delay, cause, replay,
  or overwrite canonical advance state.
- Present a battle as one ordered narration stream across multiple advances.
- Let clients reconnect using standard durable SSE event cursors.
- Prevent Turn N+1 narration from overtaking Turn N even when N+1 input is ready.
- Avoid two public identifiers for one immutable turn narration.
- Keep provider retries, usage, and failures independently observable without
  exposing operational attempt identity as domain identity.
- Support prologue, combat turns, judgment, and aftermath without overloading a
  numeric combat-turn value.

## Considered options

1. Retain a public `narrationId` and one stream per narration job. This gives
   direct job addressing, but forces reconnection and pushes battle ordering and
   gap handling into the client.
2. Use a battle-scoped ordered stream identified publicly by `battleId`, with
   each logical narration identified by its immutable `turnReceiptId`. This
   centralizes ordering and supports one connection across advances.
3. Use only a numeric turn number. This is compact, but cannot safely distinguish
   prologue, combat, judgment, aftermath, compatibility records, or a corrected
   receipt generation.
4. Stream whatever narration finishes first and reorder it in the UI. This
   reduces head-of-line waiting but exposes later story facts before their
   predecessor and makes reconnect behavior dependent on client state.

## Decision

Choose option 2.

### Public identity

The public logical identity of a narration is the composite:

```text
(battleId, turnReceiptId)
```

`turnReceiptId` is an immutable receipt identifier, not merely the displayed
numeric combat turn. The receipt also carries a monotonically increasing
`narrationSequence` within the battle. Exactly one logical narration row exists
for each composite identity, enforced by a unique persistence constraint.

The public API does not create or return a `narrationId`. An internal
`generationAttemptId` may identify provider attempts, leases, usage, and logs.
Retries remain attempts of the same logical narration and cannot create another
public narration identity.

### Advance contract

`POST /api/battles/:battleId/advance` commits character decisions, mechanics,
semantic/world state, terminal state, and the immutable turn receipt without
waiting for narration. In the same recoverable transaction or outbox boundary,
it creates or reuses the logical narration entry for that receipt.

The response includes the committed `turnReceiptId`, `narrationSequence`, and
current narration status. A later advance neither reads nor waits for an earlier
narration's status or output.

Conceptual response shape:

```json
{
  "battleId": "battle-123",
  "turnReceiptId": "turn-receipt-7",
  "narrationSequence": 7,
  "narrationStatus": "queued"
}
```

This is a design example, not a finalized DTO schema.

### Battle-scoped narration APIs

The public surfaces are conceptually:

```text
GET /api/battles/:battleId/narration
GET /api/battles/:battleId/narration/stream
GET /api/battles/:battleId/turns/:turnReceiptId/narration
```

The first endpoint returns the ordered narration state for the battle. The
second is a long-lived battle-scoped SSE stream that remains connected across
later `advance` calls. The third reads the one logical narration associated with
a specific immutable receipt.

### Ordered generation

Narration generation is serialized per battle by `narrationSequence`.

- The earliest non-terminal narration is the only entry eligible to acquire the
  battle narration generation lease.
- A later receipt may be fully committed and its immutable narration input may
  be ready, but its provider call remains `queued` while any earlier sequence is
  `generating`.
- Disconnecting every client does not stop generation or release ordering.
- `completed`, `failed`, and an explicitly authorized `cancelled` state are
  terminal for queue ordering. Failure must persist a durable fallback or
  failure event and release the next sequence rather than deadlock the battle.
- Provider retry never permits a later sequence to overtake the current one.

This is intentional head-of-line blocking for presentation only. It never
blocks gameplay advances.

### SSE recovery and unspecified start

Every persisted stream event has a battle-local monotonic event sequence and an
SSE `id`. Events include `turnReceiptId`, `narrationSequence`, status, and the
bounded public payload. Partial provider text must be persisted before it is
published if it is eligible for replay.

- With `Last-Event-ID`, the server replays durable events strictly after that
  event and then continues following the battle stream. It does not reinvoke a
  provider.
- With an explicit turn receipt cursor, the server starts from that receipt's
  durable narration events and then continues into later sequences.
- With neither cursor, if a narration is currently generating, the server
  replays that active turn's stored events from its durable beginning and then
  follows it. This avoids missing text produced immediately before connection.
- If none is generating, the server emits the latest completed narration
  snapshot when available, then keeps the connection open for the next queued
  or future turn.
- The same connection continues from Turn N to N+1 and across later advance
  requests until the client disconnects or authorization expires.

An event ID is a replay cursor, not a narration domain ID. Its encoding is an
implementation detail and must not require clients to parse it.

### Immutable input and authority

Each logical narration entry owns an immutable input snapshot containing the
turn receipt, causal and observer-safe projections, frozen asset generation
references, narration style, perspective, participant labels, and schema/prompt
generation. Later advances and editable-asset revisions cannot change it.

Narrator output remains presentation-only. It cannot change mechanics,
semantic/world state, perception, private character memory, action decisions,
or winner. Narrator recognition, if retained, belongs to a revisioned
narration-only read model and cannot asynchronously write canonical
`BattleState`.

## Consequences

### Positive

- One SSE connection naturally represents one battle's continuing story.
- Clients do not coordinate per-job stream replacement or repair narration
  ordering locally.
- `battleId + turnReceiptId` aligns narration identity with its immutable causal
  source.
- Reconnect uses durable SSE semantics and does not duplicate provider calls.
- Gameplay can advance while narration is queued, generating, or failed.
- Internal provider attempts remain measurable without leaking operational IDs
  into the public API.

### Negative and risks

- Strict ordering introduces narration head-of-line blocking when one provider
  call is slow.
- A rapidly advancing battle can build a narration backlog; retention,
  backpressure, queue limits, and administrator visibility are required.
- Durable partial-event replay increases write volume and requires bounded
  chunking or snapshots.
- A failed narration must be made terminal deterministically or it can block all
  following narration.
- A long-lived SSE connection needs authorization refresh, heartbeat, idle
  behavior, and bounded replay rules.
- Multi-instance workers need one battle-scoped generation lease and atomic
  selection of the earliest eligible sequence.

## Compatibility and migration

- ADR-0002 is retained as historical rationale and marked `Superseded`.
- Existing embedded narration in battle logs remains readable as legacy data.
- No synthetic `narrationId` is invented for legacy rows. A migration may bind
  legacy narration to an existing turn receipt when that identity is already
  unambiguous; otherwise it remains legacy embedded presentation.
- The current advance SSE remains a compatibility surface until the frontend
  switches to the battle narration stream. It must not be presented as durable
  replay if its progress was emitted before persistence.
- Any experimental implementation created from ADR-0002's public narration-job
  route must migrate callers to battle-scoped routes before release; no public
  production compatibility is assumed without evidence.
- `T_SEPARATE_ADVANCE_NARRATION` must be replanned from a per-job public API to a
  battle-scoped ordered stream before implementation. PERT mutation should be
  performed through `perttool`, not by manually editing generated lifecycle
  history.
- Release, deployment, production migration, and production observation remain
  separately authorized.

## Verification

- Advance N+1 succeeds while narration N is `generating`.
- Narration N+1 remains queued and makes zero provider calls until narration N
  becomes terminal.
- The existing battle SSE connection delivers N+1 after N without reconnecting.
- `Last-Event-ID` reconnect replays every persisted event exactly once from the
  requested boundary and makes zero additional provider calls.
- A cursorless connection during generation receives the active turn from its
  durable beginning, then follows later turns.
- A cursorless idle connection receives the latest completed snapshot and then
  follows a future advance.
- Duplicate advance, outbox recovery, worker retry, and multi-instance lease
  races retain one logical narration per `(battleId, turnReceiptId)`.
- Provider failure writes a terminal public fallback/failure event and releases
  the next sequence.
- Turn N+1 completion can never be published before Turn N terminal status.
- A narration snapshot is unchanged by later turns and editable-asset updates.
- No narration output or recognition update changes canonical battle state,
  private memory, perception, or winner.
- Prologue, combat, judgment, and aftermath receipts receive distinct stable
  identities and sequences.
- Administrator observability shows queue depth, active sequence, latency,
  attempts, usage, fallback, and blocking reason without exposing private
  prompts.

## Implementation references

- Decision record added before implementation; add implementation commits, PRs,
  schema migrations, and evidence here as work proceeds.

