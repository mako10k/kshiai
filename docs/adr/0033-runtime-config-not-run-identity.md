# ADR-0033: Keep transport and worker configuration out of durable run identity

- Status: Accepted
- Revision: 1
- Date: 2026-09-15
- Decision owner: Product owner
- Related: ADR-0032, accepted semantic-authoring foundation requirement v3,
  implementation-design revision 5, PERT tasks `cc309` and `cc304`

## Context

The accepted foundation permits a failed attempt to terminate and an explicit retry
to reconstruct a new attempt from its frozen source. It does not require persistence
of an in-memory candidate, model context, or worker checkpoint. The accepted design
revision 5 nevertheless added provider-transport and worker-execution policy revision
identities to every durable run.

Those identities do not enable checkpoint recovery. Process or worker-lease loss ends
the current run, fences late results, and requires an owner-triggered new run. The new
run uses the runtime configuration selected for that new execution.

## Decision drivers

- Preserve correctness across duplicate workers, late provider results, and retries.
- Keep the common persistence contract limited to facts needed to reconstruct or
  explain durable outcomes.
- Do not create a versioned configuration registry without a concrete replay,
  compliance, billing, or service-level requirement.
- Preserve the separate time-boundary semantics accepted in ADR-0032.

## Considered options

1. Persist both configuration revision identities in every run. This improves
   historical configuration attribution, but adds schema and lifecycle coupling that
   is not used to resume a failed run.
2. Persist complete transport and worker configuration snapshots. This enables exact
   replay, but contradicts source-based new-run recovery and creates unnecessary
   configuration retention and compatibility obligations.
3. Keep transport and worker values as runtime configuration and persist only the
   correctness-bearing request, accounting, fence, and outcome facts. Chosen.

## Decision

Treat provider transport and worker execution values as startup runtime configuration,
not as part of durable `SemanticAuthoringRunV1` identity. Do not require a transport or
worker configuration revision ID, configuration registry, or configuration snapshot in
the common run record.

Continue to persist the run and source identities, target contract, adapter and
semantic resource-policy identities, pricing and token-estimator identities, provider
request lifecycle, reservations and receipts, owner/fencing token/run version,
questions and answers, technical outcomes, and family-owned final candidate metadata.

A same-run provider transport recovery may use the immutable configuration held by the
live execution. Process or worker-lease loss ends that run with a recoverable technical
outcome. An explicit retry creates a new run from source under the configuration active
for the new execution. Optional bounded operational telemetry may identify the route,
platform, timeout, or lease used, but that telemetry is not a replay contract or a
condition for semantic correctness.

## Consequences

### Positive

- No database migration or durable registry is added solely for operational Config
  generations.
- The persistence model remains aligned with stateless, source-based new-run retry.
- Correctness continues to rely on explicit request state, monotonic accounting, and
  fencing rather than configuration labels.

### Negative and risks

- Historical runs do not by themselves reproduce every operational setting.
- Diagnosis that needs exact timeout or lease values depends on bounded telemetry from
  the execution environment.
- A future compliance or exact-replay requirement would require a separately accepted
  persistence decision.

## Compatibility and migration

No existing stored row contains the two proposed configuration-identity columns, so no
data migration is required to remove them from the unimplemented design. Existing
fence, request, accounting, and outcome records remain unchanged. ADR-0032's separation
of provider, worker, semantic-progress, and cumulative-resource boundaries remains in
force.

## Verification

- The run contract and database schema do not require transport or worker Config IDs.
- Worker/process loss fails the current run, fences late writes, and exposes a
  source-based new-run retry.
- Provider request state, reservations, receipts, and accounting remain monotonic.
- Runtime startup still rejects missing or invalid timeout and lease configuration.

## Implementation references

- `packages/shared/src/semantic-authoring.ts`
- `backend/src/llm/semantic-authoring-provider.ts`
- `backend/src/services/semantic-authoring/durable-execution.ts`
- `docs/structured-semantic-authoring-kernel-implementation-design-v1.md`

## Review and acceptance

Formal review of the exact pre-acceptance ADR revision and conforming implementation-
design revision 6 reported PASS with no P0 through P3 findings. Its reasoning SHA-256
is `cdd328284fd76310ef28dfaff0f59c2e7cf559828c738a3a71c85839be1567d3`.

On 2026-09-15, immediately after the PASS result and complete Japanese review scope
were presented, the product owner replied `ACCEPT`. The reviewed pre-acceptance ADR
SHA-256 was `ae8b736857b59188880acbf397e2da941caf5c102539b2410ddd7011fd1f529a`,
and the conforming implementation-design revision-6 SHA-256 was
`a0f2ba909d3c71fb7de2235bd84125b420663f6f8b5400c4236eaf92e832ebff`.

This acceptance does not select exact Config values or authorize implementation,
commit, push, provider calls, deployment, migration, activation, rollback, or release.
