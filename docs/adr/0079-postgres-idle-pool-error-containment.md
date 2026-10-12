# ADR-0079: Contain idle PostgreSQL pool connection errors

- Status: Accepted
- Date: 2026-10-12
- Decision owner: User
- Related: ADR0072 revision1; ADR0078 revision1; docs/unified-consciousness.pert reservedRepair; Stage38211435113

## Context

Cloud Run logs for application v0.25.0-rc.9 revision kshiai-api-00208-zur show an unhandled error event on BoundPool: Connection terminated unexpectedly. The API process exited at2026-10-12T06:24:33Z and its SSE response was truncated; the observer reported no done event. Five turns were committed; turn6 adjudication remained physically unresolved. This is an idle PostgreSQL connection lifecycle defect, not an invalid adjudication response. Cumulative181 reserved attempts leaves80 under the approved261 ceiling.

## Decision drivers

Keep unrelated in-flight LLM work alive after an idle DB connection is discarded; preserve transaction errors, fences, physical accounting, privacy and no unknown-send replay. The owner authorized repairs/tests/deployment/staging/switching and repair retries, renewed authentication and directed continuation.

## Considered options

1. Let an idle pool error terminate the API: rejected.
2. Retry arbitrary writes, transactions or unknown provider sends: rejected.
3. Handle the pool's idle error event with a fixed safe diagnostic and rely on pg-pool to discard the broken idle client: selected.

## Decision

Create the shared application PostgreSQL pool with an error listener before any connection use. Log a fixed diagnostic without serializing Error, client, connection configuration or credentials. pg-pool removes the broken idle connection; subsequent requests may acquire a new client. Errors on checked-out connections, queries and transactions still propagate to their callers; no query, transaction or provider request is automatically replayed. Existing persistence, atomic commit, leases, immutable battle bindings and budgets are unchanged. No migration or new battle policy/prompt/output revision: application v0.25.0-rc.10 retains policy v7/prompt v6/output v3.

The existing repair authority covers one corrected fixed fixture/max38advances/80physical attempts, cumulative261, unpriced. Do not replay the unresolved rc.9 judge or rerun an unchanged candidate. Successful Stage precedes exact-artifact promotion; production remains application v0.24.0-rc.9 until then.

## Consequences

An idle connection reset no longer destroys unrelated requests. Diagnostics avoid the former Node client dump. Genuine database operation failures remain visible rather than being hidden by retries.

## Compatibility or migration impact

No schema, API or historical snapshot change. Preserve failed rc.9 and its unresolved physical receipt. All application pool users receive the listener; standalone migration clients retain their existing lifecycle.

## Validation

Verify an actual idle backend termination on isolated PostgreSQL leaves the process alive, emits only the safe diagnostic and allows a fresh connection/query. Verify checked-out query failures reject without replay and contain no private data in the idle diagnostic. Run full governed tests/typecheck/build/static and individually review affected authority, then exact PR/main checks/tag, bounded Stage and exact-artifact promotion.
