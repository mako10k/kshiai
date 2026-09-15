# ADR-0032: Separate semantic-authoring time boundaries

- Status: Accepted
- Revision: 1
- Date: 2026-09-15
- Decision owner: Product owner
- Authority: same-basename `.think`; this Markdown is its human-readable projection.
- Related: supersedes ADR-0031 for lifecycle while retaining its unaffected decisions;
  D11 implementation design revision 2; PERT tasks `cc308` and `cc304`

## Context

ADR-0031 requires finite execution containment but leaves exact numerical policy to a
separately accepted successor decision. D11 revision 2 proposed eight provider calls,
60 seconds per call and 240 seconds per attempt. Current WIP applies the attempt limit
as wall-clock termination even while semantic work is progressing, and one provider
timeout terminates the whole run.

The three maxima do not compose under their worst cases: eight 60-second calls require
480 seconds before local work. No reviewed provider-latency distribution, normal call
count, owner wait budget or hosting deadline supports the proposed time values.

## Decision drivers

- Retain finite cost and repetition containment.
- Do not confuse transport or worker expiry with semantic invalidity.
- Do not discard useful progress solely because an unsupported literal expires.
- Do not invent replacement values without workload and platform evidence.

## Considered options

1. Retain 60/240 seconds: simple, but unsupported and internally non-composable.
2. Remove every time control: avoids premature expiry, but leaves transport and worker
   containment undefined.
3. Separate the time boundaries and leave exact values pending evidence: more explicit
   policy work, while each failure mode receives the correct control. Chosen.

## Decision

Treat these as separate controls:

1. A route-specific provider transport timeout bounds one exchange.
2. A worker execution boundary controls one worker lease and fenced delivery.
3. Semantic no-progress and repeated-state detection decide whether reasoning is stalled.
4. Call, step, token and cost ceilings bound cumulative resource consumption.

A fixed whole-attempt wall clock is not a semantic termination condition. Productive
progress must not be declared failed solely because a shared elapsed-time literal
expires. A worker boundary may stop dispatch, reject late results and preserve a
recoverable technical outcome, but it cannot claim semantic failure or silently reset
consumption.

A provider timeout is a typed transport outcome and may consume its reservation. It
does not automatically terminate the entire attempt when one explicitly accepted,
bounded recovery remains within all other budgets and fence rules.

Exact provider and worker time values remain undecided until the target route and
platform are named, representative focused requests are measured, an owner-visible
wait budget is defined, and the owner accepts the exact policy revision.

## Consequences

### Positive

- Useful semantic progress is not discarded solely by an unsupported attempt timer.
- Transport, worker and semantic failure receipts retain distinct meanings.
- Existing call, token, cost, progress and cycle controls remain available.

### Negative and risks

- Worker-boundary recovery needs an exact persistence and fencing design.
- One bounded transport recovery can add latency and cost.
- Deployment cannot select the new policy until exact time values are accepted.

## Compatibility and migration

This ADR refines only ADR-0031 D7 elapsed-time semantics. ADR-0031 is Superseded as
the lifecycle container, while all of its other decisions remain incorporated through
this ADR. Existing deployed authoring behavior and stored data are unchanged. The
current `semantic_authoring_policy_v1` implementation remains non-normative WIP and is
not activation authority.

## Verification

- Measure the selected provider route with representative focused requests.
- Record latency distribution, focused-call counts and the target platform deadline.
- Verify transport timeout, worker-boundary expiry, late delivery and bounded recovery
  as distinct outcomes.
- Verify that productive progress is not terminalized by a whole-attempt wall clock.
- Verify that call, token, cost, no-progress and cycle ceilings still terminate their
  own failure modes without resetting accounting.

## Implementation references

- Current WIP: `packages/shared/src/semantic-authoring.ts`
- Current WIP: `backend/src/services/semantic-authoring/execution-policy.ts`
- Current WIP: `backend/src/services/semantic-authoring/execution.ts`
- Current WIP: `backend/src/services/semantic-authoring/ports.ts`

No implementation, provider call, deployment or activation is authorized by this ADR.

## Review and acceptance

Formal review of the exact pre-acceptance SHA-256
`c9e8ee12edd8f57d796ab389958c8a8f741011fd853b49662f265291bbdb8409`
reported PASS with no P0 through P3 findings. On 2026-09-15, immediately after that
result and the complete Japanese review scope were presented, the product owner replied
`ACCEPT`. Acceptance fixes the boundary architecture only; exact time values and all
runtime effects retain their separately stated authority gates.
