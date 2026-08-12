# ADR-0006: Terminal-snapshot narration delivery

- Status: Accepted
- Date: 2026-08-12
- Decision owner: Product owner
- Supersedes: [ADR-0005: Battle-scoped ordered narration stream](0005-battle-scoped-ordered-narration-stream.md)
- Related: GitHub Issue #98; `docs/battle-narration-stream-design.md`; `docs/issue-98-battle-pipeline-plan.md`

## Context

ADR-0005 established the correct public identity and battle-scoped ordering but
left three contracts incompatible with the deployed runtime and safe recovery:
durable partial prose could be mixed with a regenerated attempt; one physical
SSE connection could not outlive the current finite Cloud Run timeout; and a
single receipt response could not represent an advance that commits multiple
canonical phases such as combat and judgment.

## Decision drivers

- Never combine prose from different provider attempts.
- Preserve one logical battle narration stream without requiring an unbounded
  physical HTTP request.
- Represent every committed canonical phase without overloading combat turn.
- Make reconnect delivery honest about at-least-once network semantics.
- Close canonical winner and narrator authority before asynchronous work.

## Considered options

1. Continue publishing partial prose and require provider continuation. This is
   not supported consistently by current adapters.
2. Publish only a validated terminal narration snapshot and keep attempt
   progress private. This sacrifices live token animation but gives deterministic
   recovery and clean replacement semantics.
3. Publish partial prose and reset it visibly on retry. This exposes unstable
   prose and complicates historical replay.

## Decision

Choose option 2.

- The public logical narration identity remains `(battleId, turnReceiptId)`;
  there is no public `narrationId`.
- An advance returns ordered `receipts[]`. Each opaque receipt identifies one
  committed phase (`prologue | combat | judgment | aftermath`) and owns one
  battle-local narration sequence.
- Narration provider progress is private. Public prose first appears as one
  validated terminal `completed` snapshot, or as a deterministic terminal
  failure/fallback snapshot. A new attempt never appends to a prior attempt.
- The battle stream is logically continuous but physically finite. Authenticated
  fetch-SSE reconnects with an opaque durable cursor before or after platform
  timeout and refreshes authorization.
- Delivery is at-least-once. Clients de-duplicate event IDs and replace the
  receipt block with terminal snapshots.
- Narration generation remains strictly ordered per battle; later canonical
  advances do not wait for it.
- A battle-wide revision and canonical phase sequence are committed by CAS.
  Gameplay deterministically commits winner, finish reason, phase-owned memory,
  rating, semantic/world state and character-authored speech before creating
  immutable narration input. Narrator/referee prose cannot overwrite them.
- Presentation continuity, if retained, is derived at worker eligibility time
  from earlier terminal narration entries and is stored only in the narration
  read model. It is not canonical battle input.
- Cloud Run scale-to-zero wake-up requires a durable outbox and authenticated
  queue push. Worker writes use a narration-specific fenced lease.
- The managed push implementation is Google Cloud Tasks. One deterministic task
  name is derived from each outbox ID; `ALREADY_EXISTS` is a successful
  idempotent enqueue. The task carries a Google OIDC token bound to the exact
  worker audience. The worker endpoint accepts only that service-account email.
  A startup scan and later battle mutations retry outbox rows left pending by an
  ambiguous or failed Cloud Tasks API call.

## Consequences

### Positive

- Retry and takeover cannot create a mixed public paragraph.
- Cursor recovery works across finite requests and token refresh.
- Multi-phase advance output has explicit identity and ordering.
- Canonical gameplay remains independent of narration latency and failure.

### Negative and risks

- Users do not see token-by-token narrator progress; they see queued/generating
  state followed by a completed block.
- `receipts[]`, presentation read model, queue wake-up and fenced leases increase
  migration scope.
- Strict per-battle ordering introduces presentation-only head-of-line blocking.

## Compatibility and migration

- ADR-0005 remains as historical rationale and is marked `Superseded`.
- Existing embedded logs remain readable through a feature-gated composite
  presentation read model. No receipt is invented where legacy identity is
  ambiguous.
- Existing advance SSE remains temporary for advance phase/final state only;
  non-durable narrator progress is removed after compatibility acceptance.
- Native `EventSource` is not required; the bearer-authenticated fetch stream is
  retained.
- Release, queue infrastructure deployment, production migration and production
  observation require separate authorization.

## Verification

- A failed or abandoned attempt publishes no partial prose.
- Worker takeover produces one terminal block for the same logical receipt.
- Advance can return combat and judgment receipts in canonical sequence.
- Physical reconnect across runtime timeout produces one visible block per
  receipt under an at-least-once event stream.
- Later advances commit while earlier narration remains queued/generating.
- Narration output cannot change winner, mechanics, world, private memory,
  rating, perception, or canonical drama state.
- Queue redelivery and stale workers are rejected by unique identity and fencing.

## Implementation references

- [Detailed design](../battle-narration-stream-design.md)
- Add implementation commits, migrations, tests and evidence as work proceeds.
