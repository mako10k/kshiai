# Battle-scoped ordered narration stream design

Status: ADR-0006 authority prerequisites and composite presentation read model
implemented locally; ordered worker, outbox, queue and stream remain pending.

Related: [ADR-0006](adr/0006-terminal-snapshot-narration-delivery.md),
[current pipeline](current-battle-pipeline.md), and
[Issue #98 plan](issue-98-battle-pipeline-plan.md).

## Outcome and boundaries

Canonical advancement and presentation become two independently recoverable
pipelines. `advance` commits a phase receipt and an immutable narration input;
it never waits for narrator generation. One battle-scoped SSE connection replays
and follows the ordered presentation stream across later advances.

This design does not change initiative, action validation, mechanics,
semantic/world authority, character-private memory, or effect semantics. It does
remove narrator recognition and terminal winner authority from the asynchronous
narration write path. Release, deployment, production migration, and production
observation remain out of scope.

## Identity and ordering model

`turnReceiptId` names an immutable committed **phase receipt**, not just an
integer combat turn. Its conceptual identity fields are:

```text
turnReceiptId     opaque stable identifier
battleId          owning battle
sequence          monotonic committed phase sequence within the battle
phase             prologue | combat | judgment | aftermath
combatTurn        integer or null
stateRevision     committed battle revision represented by the receipt
```

The logical narration key is `(battleId, turnReceiptId)`. The database enforces
one narration input and one current logical status for that key. `sequence` is
unique per battle and controls generation and display order. An internal
`generationAttemptId` identifies a worker attempt only.

## Durable records

The exact SQL representation is an implementation choice, but the persistence
contract requires four logical record classes.

### Turn receipt

- immutable committed phase facts and canonical revision;
- unique `(battle_id, sequence)` and `(battle_id, turn_receipt_id)`;
- created atomically with the canonical advance transition or through a durable
  outbox record in the same transaction;
- contains no narrator output.

### Narration entry

- unique `(battle_id, turn_receipt_id)`;
- immutable input snapshot and its digest;
- frozen asset generation references, perspective, prompt/schema generation,
  causal projection, observer-safe view, and character-authored speech;
- status `queued | generating | completed | failed | cancelled`;
- active attempt and lease metadata are operational, not public identity;
- terminal fallback/failure information is durable.

### Narration event

- unique monotonic `(battle_id, event_sequence)`;
- references `turnReceiptId` and narration sequence;
- kind `queued | started | completed | failed | cancelled | reset`;
- public payload only; private prompt, raw provider output, usage detail, and
  internal IDs are forbidden;
- inserted before an event is eligible for SSE publication.

### Narration attempt receipt

- internal `generationAttemptId`, provider/model/route/prompt generation;
- lease owner, started/finished timestamps, latency, token usage, cost estimate,
  retry/fallback disposition and bounded error class;
- raw private prompt/output is not copied to public events or administrator DTOs;
- retention is independently configurable from public narration events.

## Transaction and recovery boundaries

### Advance commit

One transaction (or an equivalent transactionally correlated outbox) must:

1. compare the expected battle revision and idempotency ownership;
2. commit the canonical phase state and immutable turn receipt;
3. insert-or-read the unique narration entry and immutable input digest;
4. append its public `queued` event;
5. persist the advance result correlated to the request idempotency record.

If the response is lost after commit, replay reads the committed result and
never repeats mechanics, character calls, receipt creation, or narration input
creation. `completeIdempotentRequest` after an unrelated battle save is not a
sufficient final contract; the committed receipt must be discoverable by the
idempotency key and returned on takeover/readback.

### Narration generation

A worker transaction atomically selects the lowest non-terminal narration
sequence for a battle. It may transition `queued → generating` only when no
earlier sequence is non-terminal. A battle-scoped narration lease prevents two
workers from generating the same logical narration.

Provider progress remains private and attempt-scoped. Public prose first appears
only in one validated terminal `completed` or fallback `failed` event. On worker
takeover:

- if a terminal result exists, return it without a provider call;
- abandon the incomplete attempt and start a new internal attempt for the same
  logical narration without publishing or combining earlier progress;
- enforce the responsibility attempt ceiling and then commit a deterministic
  failure/fallback terminal event.

Exact-once provider execution is not claimed. The contract is one logical
narration, bounded attempts, monotonic durable public events, and no duplicate
canonical or public terminal result.

## API contracts

Conceptual routes, subject to schema implementation review:

```text
POST /api/battles/:battleId/advance
GET  /api/battles/:battleId/narration
GET  /api/battles/:battleId/narration/stream
GET  /api/battles/:battleId/turns/:turnReceiptId/narration
```

`advance` returns the committed battle projection plus ordered `receipts[]`;
each item carries `turnReceiptId`, `narrationSequence`, phase and status. It does
not stream narrator progress. The
legacy `POST .../advance/stream` may temporarily emit phase and final advance
events, but must stop emitting non-durable narrator content and must use the same
held idempotency key on retry.

The battle narration read endpoint returns an ordered bounded page and the
current active/queued summary. The per-receipt endpoint is useful for history
and diagnostics but does not introduce a narration ID.

## SSE protocol

The battle-scoped stream is a read/follow API. Connecting never creates a
narration entry or invokes a provider.

Each event uses:

```text
id: <opaque battle-local durable event cursor>
event: narration.<kind>
data: { turnReceiptId, narrationSequence, phase, combatTurn, status, ... }
```

Clients treat `id` as opaque. The server validates that `Last-Event-ID` belongs
to the requested battle and the caller may still read that battle.

Cursor behavior:

- `Last-Event-ID`: replay committed later events, then follow;
- explicit `turnReceiptId`: replay that receipt from its first durable event,
  then follow later sequences;
- no cursor and one generating entry: replay that entry from its first durable
  event, then follow;
- no cursor and idle: emit the latest completed snapshot when one exists, then
  follow future events;
- pruned cursor: return an explicit reset event containing the oldest retained
  cursor and a bounded current snapshot; never silently skip;
- authorization loss or battle deletion: emit no further battle data and close;
- heartbeat comments carry no domain state and are not replayed.

SSE connections are finite notifications/readers, not worker lifetimes. The
same logical cursor sequence continues across physical reconnects caused by the
platform timeout, bearer refresh, client disconnect or transient failure. A database
notification, bounded poll, or equivalent fan-out wakes connected instances;
the durable event table remains authoritative.

## Frontend state machine

The battle page maintains two independent activities:

- advance state: idle, committing, committed, failed;
- narration stream: connecting, following, reconnecting, authorization-failed.

It opens one narration stream for the battle and keeps it across advances.
Narration blocks are keyed by `turnReceiptId`, ordered by `narrationSequence`,
and can show `queued`, `generating`, `completed`, or `failed`. Later committed
turn placeholders may appear while an earlier block is generating, but later
text cannot appear first.

The client persists the last received opaque event cursor for the active page
session and reconnects with it. It never retries a failed `advance` with a new
idempotency key until readback proves the previous request did not commit.

## Authority cleanup

Before narration becomes asynchronous:

- deterministic gameplay finalizes terminal winner and finish reason;
- `referee` may produce an explanation or non-authoritative score proposal but
  cannot overwrite the committed winner;
- narrator recognition updates are removed from canonical `BattleState`, or
  validated into a narration-only revisioned read model;
- narrator input is fully derived and frozen before the narration entry commits;
- later advances never read narration status, prose, recognition, or provider
  attempt state.

## Cost and routing

Narration remains a distinct context. It is not combined with action,
expression, psyche, or semantic/world reconciliation. The initial route is the
accepted lightweight `fast` tier with a deterministic composer fallback.
Standard/high-cost escalation is disabled unless a separate enumerated route
class, token ceiling, price snapshot, quality fixture, and owner acceptance are
recorded.

One logical narration records all attempts so battle/turn cost includes retry.
Queue waiting time, provider latency, token count, estimated cost, attempt count,
fallback reason, and head-of-line blocking reason are administrator-visible.

## Administrator visualization

The existing causal pipeline visualization gains a narration lane showing:

- turn receipt identity, phase, combat turn, sequence, state revision and input
  digest;
- queued/generating/terminal state and the earlier sequence blocking it;
- durable event cursor range and retained/reset boundary;
- active lease age, attempt count, provider/model route, tokens, cost, latency,
  fallback/error class;
- separation from canonical state and private character memory;
- legacy embedded narration as `legacy/unavailable`, without inferred receipts.

No private prompt, raw provider output, private psyche, registry source mapping,
or secret is displayed.

## Migration slices

1. Define schemas and repositories for receipt, entry, event, attempt and lease;
   add read-only administrator projection.
2. Make advance finalization deterministic and remove narrator writes to
   canonical state.
3. Transactionally create the immutable narration entry/outbox with advance and
   return receipt identity without waiting.
4. Implement the ordered worker, bounded retry/fallback, and durable events.
5. Add battle read/follow APIs with cursor replay, reset, authorization and
   heartbeat behavior.
6. Move the frontend to independent advance and narration state machines; retain
   only the legacy presentation read switch as the bounded rollback path.
7. Remove narrator progress from advance SSE after the new client is accepted.

Current local compatibility boundary:

- new phase narration is stored in `battle_presentations`, not appended to
  canonical `BattleState.log`;
- battle GET and character history/detail compose retained legacy log blocks
  with ordered receipt presentations when
  `BATTLE_PRESENTATION_READ_MODEL` is not `legacy`;
- setting that variable to `legacy` is the local read rollback and does not
  delete either representation;
- new narrator recognition and raw narrator pipeline trace writes have stopped;
  existing persisted traces are retained for now, but administrator responses
  redact private inputs and provider outputs. Retention/deletion remains an
  owner decision at `T_ACCEPT_NARRATION_CONTRACT`.

Implemented local stream boundary (2026-08-12):

- owner-authorized snapshot, per-receipt, event replay and finite fetch-SSE
  endpoints use `battleId` plus receipt identity; there is no public narration
  ID;
- the opaque cursor identifies a durable battle-local event high-watermark.
  Network delivery is at-least-once and the frontend replaces entries by
  receipt ID while deduplicating event IDs;
- public events retain only allowlisted status and terminal prose. Frozen input,
  provider output, attempts, usage and lease data remain outside the public DTO;
- physical SSE requests are deliberately finite. The client reconnects with a
  fresh bearer token, causing battle access to be rechecked each time;
- public events are retained for 30 days and internal attempts for 14 days.
  Pruning transactionally advances a retained high-watermark; a cursor behind
  it receives one terminal snapshot reset before following newer events;
- the battle page follows narration independently of advance and displays
  ordered queued/generating placeholders. After the accepted local cutover,
  advance SSE publishes phase and terminal battle events only; narrator prose,
  drafts and bulk speech placement are read exclusively from durable narration
  entries;
- advance now freezes the exact phase-specific provider request and commits its
  receipt/outbox without invoking a narration or focus provider. An authenticated
  local worker endpoint consumes the ordered entry and writes one terminal
  presentation. The synchronous terminal import has been removed; cloud queue
  infrastructure remains separately authorized.

## Acceptance matrix

- advance N and N+1 commit while narration N is generating;
- N+1 makes no provider call and publishes no text before N becomes terminal;
- one logical SSE cursor sequence delivers N then N+1 in order across physical
  reconnects;
- disconnect/reconnect uses at-least-once delivery; the idempotent reducer shows
  no duplicate block and reconnect causes no provider invocation;
- lost advance response, expired idempotency ownership, and worker takeover do
  not duplicate mechanics, receipts, logical narration, or terminal events;
- one failed narration releases its successor with a durable fallback/failure;
- A/B private state, raw trace, and provider request are absent from public DTO
  and every SSE event;
- later turns and asset edits do not alter an earlier input digest or output;
- multi-instance races preserve one active attempt per battle lease;
- queue backlog, retention reset, authorization expiry, battle deletion,
  prologue, judgment and aftermath are covered;
- administrator DAG and cost lane are derived only from durable records;
- full test, typecheck, build and migration verification pass locally.

## Open implementation choices

- PostgreSQL notification versus bounded polling for SSE fan-out;
- maximum terminal public snapshot size;
- public-event and internal-attempt retention periods;
- whether legacy embedded narration is imported when an unambiguous receipt
  already exists;
- whether narration-only recognition continuity is retained or removed.

## Design-review corrections and mandatory gates

The independent design review found that the baseline above needs the following
binding clarifications. These override any looser wording earlier in this
document.

1. **Canonical phase gate.** Before queue work, define a battle-wide revision
   and phase sequence allocated by compare-and-swap for prologue, combat,
   judgment and aftermath. The turn-limit winner is deterministic before receipt
   creation; `referee` may explain but cannot overwrite it. Phase-owned memory,
   rating and terminal writes commit before immutable narration input.
2. **Push wake-up.** The deployed Cloud Run service scales to zero, so DB polling
   or notification alone cannot start a worker. The advance transaction writes
   a durable outbox; an authenticated queue push wakes a bounded worker endpoint.
   Redelivery is normal. A recovery scan re-enqueues orphaned queued or expired
   generating entries. Selecting the managed queue remains an infrastructure
   approval, but a push-capable wake-up is mandatory.
3. **Fenced ordering lease.** A monotonic fencing token is checked by heartbeat,
   attempt transition, event insert and terminal write. Eligible selection locks
   the lowest sequence and proves no earlier non-terminal entry; a stale worker
   cannot publish after losing its lease. Scheduling is fair across battles.
4. **Terminal-only public prose.** Incomplete provider output is private and not
   replayable. The first public prose is one validated terminal snapshot. A
   takeover abandons the incomplete attempt and may regenerate under the total
   attempt ceiling, without mixing old and new prose.
5. **Logical, finite SSE.** “One battle stream” is one logical cursor sequence,
   not an unbounded HTTP connection. Current 300-second runtime limits are
   respected; authenticated fetch streaming reconnects with refreshed bearer
   credentials and the opaque cursor. Authorization is periodically revalidated.
6. **At-least-once delivery.** Network delivery is at-least-once. The frontend
   reducer ignores duplicate event IDs and replaces a receipt block on terminal
   snapshot. Retention compaction atomically binds the oldest cursor,
   high-watermark and reset snapshot so reset-and-follow has no gap.
7. **Presentation read model.** New asynchronous prose is not written into
   canonical `BattleState.log`. Battle GET, history and improvement consumers use
   a feature-gated composite read model joining legacy embedded blocks with new
   ordered entries; rollback retains the legacy adapter until all consumers pass.
8. **Trace privacy migration.** Stop persisting new narrator prompt/raw provider
   payloads in `pipelineTrace`; define retention/access for existing rows. The
   administrator API returns a sanitized narration DTO instead of relying on raw
   BattleState JSON.
9. **Closed cost ceiling.** The narration attempt ceiling counts adapter HTTP
   retries and worker attempts together. Streaming usage gaps must be measured or
   conservatively bounded before production routing; queue wait, attempts,
   tokens, estimated cost and fallback are sanitized administrator fields.
10. **Idempotent commit correlation.** Battle revision, receipt, narration entry,
    queued event/outbox and advance result are transactionally correlated with
    the idempotency key. Takeover/readback returns that receipt; it does not rerun
    character calls or mechanics.
11. **Receipt cardinality.** One advance response may commit multiple phase
    receipts (for example combat plus deterministic judgment). The response uses
    an ordered `receipts[]`; every receipt has its own narration sequence. A
    single-receipt convenience field is not the authoritative contract.
12. **Ordered continuity ownership.** Immutable advance input excludes earlier
    generated narrator prose and recognition. If presentation continuity is
    retained, the worker derives a narration-only continuity snapshot strictly
    from earlier terminal narration entries when its sequence becomes eligible,
    records that snapshot and the actual provider-input digest before calling the
    provider, and never writes it to canonical battle state. Canonical drama
    progression is derived from actions/events, not narrator prose.
13. **Audience-bound events.** Every public event schema is an allowlist bound to
    an audience projection and realm. Owner/spectator policy is explicit per
    route. Reset has precedence over replay when a cursor is pruned; it names an
    atomic high-watermark and terminal snapshots at or before that watermark.
