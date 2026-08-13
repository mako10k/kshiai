# ADR-0007: Provider operation ledger and observation ceilings

- Status: Accepted
- Date: 2026-08-13
- Decision owner: Product owner
- Related: GitHub Issue #98; `T_ACCEPT_PROVIDER_ACCOUNTING_ADR`; `docs/v0.17.3-provider-operation-accounting-rca.llmthink.dsl`; `docs/evidence/production-observation-0.17.3-2026-08-13.md`

## Context

The bounded `v0.17.3` production observation completed one battle normally and
revision logs showed 58 successful LLM operations with no logged retry or
failure. Durable observation data nevertheless reported zero narration HTTP
attempts and its projected layer budget omitted operations that occurred.

Two independent contracts were conflated:

- a conservative preflight projection deciding whether a run may begin; and
- actual physical provider attempts consumed after the run begins.

Narration persisted an application-reported attempt value, but terminal entries
cleared `active_attempt_id` and the observation read model joined retained
attempts only through that active ownership pointer. Other battle provider
layers had no durable actual-operation ledger. Provider adapter retries occurred
below the `LlmProvider` interface and could not be counted by callers.

This is a material state-ownership, persistence, retry and observation API
decision. Implementation therefore requires an accepted ADR before adding a
new durable ledger or changing the provider transport boundary.

## Decision drivers

- Stop before an approved observation run exceeds its physical-attempt ceiling.
- Count failed and retried outbound attempts, not only successful logical calls.
- Bind accounting to the exact observation run and immutable battle identity.
- Keep admission projections distinct from measured actual consumption.
- Reject unclassified observation calls rather than silently omitting them.
- Preserve provider prompts, responses, secrets and private character state
  outside the accounting ledger.
- Keep normal non-observation gameplay compatible and avoid making its success
  depend on an observation-only budget record.
- Preserve unknown token or price evidence as unknown instead of reporting zero.

## Considered options

1. Count structured Cloud logs after the battle. This can diagnose a completed
   run but cannot correlate every call reliably or reject the next outbound
   attempt before overspend.
2. Count calls at each `LlmProvider` method. This identifies logical operations
   but misses physical retries inside the provider adapter and distributes
   policy across many methods.
3. Reserve and record each physical attempt at the common provider transport
   boundary, with request-scoped observation context and a durable run ledger.
   This adds persistence and context propagation but is the only option that
   enforces the approved physical-attempt ceiling.
4. Increase the conservative projection and retain narration-only actuals. This
   may avoid one observed underestimate but leaves completeness and runtime
   enforcement unproved.

## Decision

Choose option 3, supported by a revisioned exhaustive projection registry.

### Units and taxonomy

The system treats these as separate units:

- application operation;
- logical provider call;
- physical provider HTTP attempt;
- adapter retry;
- narration receipt attempt;
- Cloud Tasks delivery attempt;
- tokens and estimated monetary cost.

Every battle provider operation used by an approved observation belongs to one
revisioned layer and operation key. The initial layers are `encounter`,
`characterExpression`, `deepPsyche`, `environment`, `narration`, and `referee`.
The registry includes battlefield concretization and encounter preparation as
separate operation keys even when both share the encounter layer. Projection
tests fail when an observation-capable provider operation lacks a mapping.

Projection remains a conservative admission guard derived from the enabled
workflow phases and feature policy. It is never presented as actual usage.

### Run and battle ownership

An observation run is created durably before the battle creation request and
contains its immutable run ID, projection revision, approved physical-attempt
ceiling, reserved count, lifecycle state and timestamps. The E2E observer owns
run creation and finalization through its existing database authority.

The create request carries the bounded run ID only for the authenticated E2E
account. Battle creation binds that run ID immutably to the newly allocated
battle. Calls made while constructing that battle use the same preallocated
battle ID. Advance and narration-worker paths derive observation context from
the recorded battle binding; clients cannot rebind an existing battle by
supplying another header.

Existing and ordinary battles have no observation run binding. Their provider
behavior remains unchanged by an absent context. An E2E request that claims an
unknown, inactive, exhausted or differently bound run fails closed before
provider work.

### Physical-attempt reservation and ledger

The common provider transport assigns one `logicalCallId` before invoking a
provider request. Immediately before every physical outbound attempt, including
adapter retries, it atomically:

1. verifies the run is active and the battle binding matches;
2. verifies the operation has a registered layer;
3. increments `reserved_attempts` only while it is below the approved ceiling;
4. inserts one ledger row identified by `(logicalCallId, attemptOrdinal)`.

The external request starts only after that transaction commits. A crash after
reservation is conservative: the attempt remains consumed with an unresolved
outcome rather than being returned to the budget. Completion records success or
failure, provider, model tier, elapsed time and available usage. Idempotent
reservation cannot increment the run twice for the same attempt identity.

The ledger never stores prompts, responses, headers, credentials, private
character state or public narration text. Correlation identifiers are opaque
and bounded. Ledger access remains internal and E2E-observer restricted.

### Narration read model

`active_attempt_id` continues to mean current work ownership only. Internal
observability selects the latest retained attempt independently and separately
aggregates every retained attempt for the receipt and battle. Abandoned and
failed attempts remain budget consumption. Receipt attempt counts, provider
physical attempts and delivery attempts are returned as distinct fields.

The provider ledger is authoritative for observation-wide physical attempts.
Narration aggregates are a responsibility-local cross-check and must agree for
narration operations before observation acceptance.

### Acceptance and stop behavior

An observation run is acceptance-grade only when:

- run ID, battle ID, projection revision and ceiling are exact and immutable;
- every physical attempt is classified and bound;
- every logical call and expected narration receipt is terminal;
- ledger total equals the sum of layer totals and does not exceed reservations;
- narration receipt accounting agrees with narration ledger entries;
- the run never reserved more than its approved ceiling;
- missing token or cost evidence remains explicitly unknown; and
- no live generation, lease or unresolved attempt remains.

Exhaustion rejects before another outbound provider attempt. It stops automatic
advancement and leaves durable diagnostic state; it does not increase the
ceiling, retry under another run ID or fall back to an unaccounted provider.

## Consequences

### Positive

- The approved ceiling becomes enforceable at the physical cost boundary.
- Retry and failure consumption is visible without counting queue redelivery as
  provider work.
- Projections can evolve independently from immutable actual evidence.
- Observation receipts can be explained and reconciled by layer and operation.

### Negative and risks

- Every observed provider attempt adds a database transaction before the
  external call, increasing latency and creating a database availability
  dependency for observation runs.
- Context must cross API requests, battle persistence and Cloud Tasks without
  allowing rebinding or spoofing.
- A reservation followed by a process crash may overcount physical calls. This
  is deliberately safer than allowing an unbounded duplicate.
- Exact token and monetary totals remain unavailable when providers omit usage;
  separate conservative token and price policy is still required.

## Compatibility and migration

- Add nullable immutable observation-run identity to battles. Existing rows and
  ordinary battles remain `NULL` and require no backfill.
- Add run and physical-attempt ledger tables with uniqueness and ceiling
  constraints. The migration is additive and does not reinterpret historical
  logs as authoritative ledger entries.
- Existing narration attempt rows remain intact. The read model changes how it
  selects and aggregates retained rows; no destructive data rewrite is needed.
- The observation payload schema advances additively and preserves the prior
  projection fields while naming the physical-attempt ledger as actuals.
- Release, database migration execution, deployment, queue change and another
  production observation require separate authorization.

## Verification

- A completed narration entry with `active_attempt_id=NULL` still exposes its
  latest retained attempt and aggregate usage.
- An abandoned attempt followed by a successful attempt contributes both rows
  to the aggregate.
- Projection fixtures cover creation, prologue, combat, judgment, aftermath,
  optional deep psyche, environment work, narration and referee paths.
- A fake provider transport proves one reservation for success, each retry and
  terminal failure.
- Repeating the same attempt identity is idempotent; using the next ordinal
  consumes one new reservation.
- The first attempt beyond the ceiling is rejected before fake transport I/O.
- Unknown, inactive, exhausted, unclassified and battle-mismatched contexts
  fail closed.
- No ledger field contains prompt, response, secret or character-state data.
- Focused tests, full build/typecheck/test, generated-file cleanliness and the
  LLM-free Stage receipt fixture pass before any release decision.

## Implementation references

- [LLMTHINK RCA](../v0.17.3-provider-operation-accounting-rca.llmthink.dsl)
- [Production observation evidence](../evidence/production-observation-0.17.3-2026-08-13.md)
- `docs/issue-98-battle-pipeline-plan.pert`
