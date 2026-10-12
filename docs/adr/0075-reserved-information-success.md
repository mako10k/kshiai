# ADR-0075: Information-only success in reserved turn output v2

- Status: Accepted
- Revision: 1
- Date: 2026-10-12
- Decision owner: Repository owner
- Authority: [canonical decision](0075-reserved-information-success.think)
- Related: ADR0072 revision1; ADR0074 revision1; docs/unified-consciousness.pert

## Context

Application v0.25.0-rc.4 Stage38184308617 committed two turns and consumed12physical attempts, then rejected a successful observation with observer feedback and no world updates. ADR0072 required physical state changes for every success, excluding legitimate information gathering. Production remains application v0.24.0-rc.9.

## Decision drivers

Allow meaningful observation without fabricated resource or world mutations. Preserve canonical consistency, historical contracts, atomicity and low call counts.

## Considered options

1. Keep the old success rule and classify observations as failures: rejected by owner.
2. Remove success validation globally: rejected because historical contracts and empty outputs would change.
3. Version the information-only success contract: selected.

## Decision

Accept reserved turn output v2, policy v4 and prompt v4 for newly created battles. Success or partial success may have updates[] when at least one nonempty observation exists in observations.a, observations.b or observations.public. Reason alone is insufficient. No extra machine semantic classification is introduced: adjudication determines whether observation is warranted. Physical successes with nonempty updates must still cause a concrete canonical change; zero-effect patches remain invalid. Cancelled results cannot mutate state. Keep strict types, references, resource bounds, ordering, base revisions, defeat cancellation and atomic commits.

Bind output v2, policy v4 and prompt v4 together. Runtime policy v4 selects the information contract; all old policies retain strict output v1 validation, including persisted prepared traces and lastTrace. Prompt v1/v2/v3 remain unchanged. Retain policy v3 soft/hard timing and compression, four normal calls per turn and existing attempt ceilings. No schema repair calls or response rewriting.

Owner acceptance2026-10-12: 「許可します。」 responding to the concrete proposal allowing observation/feedback-only success while retaining integrity checks and old battle contracts. This accepts the specification and implementation under existing correction/deployment authority. It does not silently add another paid fixture after the rc.4 single fixture was consumed.

## Consequences

Information actions can succeed without invented damage or movement. Observation quality remains an LLM judgment; structural validation does not prove useful information or entertainment. Failed fixture evidence is retained.

## Compatibility and migration

No database migration and no rebinding existing battles. Versioned schemas must reject mismatched policy/output/prompt bindings. Existing failed battles remain failed; no replay of received or unknown requests.

## Verification

Regression tests cover information success/partial, empty observations, cancellation, resource bounds, old-policy rejection, version binding and complete atomic execution with observer feedback. Build shared before backend checks; run full governed tests with PostgreSQL, typecheck/build/static, individual authority review and exact-source CI. Successful bounded Stage is required before production promotion.

## References

- https://github.com/mako10k/kshiai/actions/runs/38184308617
- docs/evidence/reserved-turns-rc4-failure-2026-10-12.json
