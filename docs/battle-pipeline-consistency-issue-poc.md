# Battle Pipeline Consistency Issue Lifecycle PoC

## Status

- Task: `T_ISSUES_POC`
- State: built
- Date: 2026-08-06
- Estimate: 1p
- Forecast velocity: 2.5p/day
- Forecast duration: 0.4 day
- Authority: shadow-only; no canonical mutation or persistence wiring
- Evaluation: in progress (`T_ISSUES_EVAL` remains separate)

This prototype tests whether known consistency problems can be registered,
deduplicated, deferred, resolved, and classified by purpose without treating
the registry as a globally coherent world or granting an LLM write authority.

## Contracts

`packages/shared/src/battle-consistency-issue.ts` defines strict schemas for:

- character/adjudicator/world/narrator `ConsistencyAlert` proposals;
- full consistency issues and their discovery provenance;
- bounded lifecycle events;
- a reversible `shadow_issue_registry` envelope;
- mutation and patch-audit registration receipts;
- existing projection-facing `ConsistencyIssueView` output.

Every external alert must name at least one involved entity or conflicting
fact. Alert arrays, issue arrays, lifecycle IDs, origins, purposes, and
reporters are bounded and uniqueness-checked. The complete envelope has a
512 KiB hard ceiling.

## Authority boundary

An LLM alert carries its own `blocking` claim only as
`reporterClaimsBlocking`. It cannot choose `blocksPurposes`, change a canonical
fact, resolve an issue, or produce a repair. The caller must supply a separate
server-side purpose classification when registering the alert.

Patch-audit findings use the existing strict audit-result contract. A
`no_issue_found` receipt preserves the exact checked fact/entity scope and does
not create an issue. An `indeterminate` result also does not create a conflict
issue. When an `issue_found` result also contains `incomplete_context`, only
the deterministic findings are registered; uncertainty remains visible in the
original audit receipt.

## Deterministic lifecycle

- New candidates receive monotonic issue and lifecycle-event IDs.
- Kind plus normalized fact/entity references forms the deduplication identity.
- Ref-less audit findings include their source reference in that identity so
  unrelated schema/process failures are not merged.
- Replaying the same source is an exact no-op.
- A different source for the same unresolved issue increments occurrence data,
  appends provenance, and unions server-classified blocking purposes.
- `deferred` changes processing state only and continues to block its classified
  purposes.
- `resolved` issues no longer block; a later recurrence becomes a new issue.
- Invalid lifecycle time, unknown issue IDs, illegal transitions, schema
  extensions, and limit overflow are rejected without partial envelope changes.
- Multi-finding audit registration is rolled back as a unit if any registration
  cannot be represented.

All operations return a newly validated envelope and leave the input envelope
unchanged. There is no database adapter, battle-service call, canonical commit,
or repair implementation in this phase.

## Automated evidence

`packages/shared/src/battle-consistency-issue.test.ts` covers:

- separation of LLM blocking claims from server purpose classification;
- issue view projection and purpose-specific blocking;
- duplicate registration, exact replay, and resolved recurrence;
- deferred blocking and resolved non-blocking behavior;
- lifecycle traceability and input immutability;
- scoped `no_issue_found` versus `indeterminate` audit receipts;
- deterministic audit registration and replay deduplication;
- invalid lifecycle time and strict-schema rejection.

These are construction and lifecycle regression tests, not effectiveness
evidence. `T_ISSUES_EVAL` must separately measure detection recall, false
positives, actionability, deduplication stability, purpose-blocking quality,
storage growth, and review burden before local read/repair work can be unblocked.

## Limitations

- Deduplication is exact over structured kind and normalized references; it does
  not infer that differently worded or partially overlapping conflicts match.
- Purpose classification is supplied by trusted server code but is not yet
  evaluated for correctness.
- The registry stores known issues only and never labels the remaining world
  globally coherent.
- No issue repair, canonical patch, persistence migration, or runtime consumer
  is connected.
- Passing these tests cannot guarantee correct final battle results.
