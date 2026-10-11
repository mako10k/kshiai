# ADR-0072: Parallel turn plans and one sequential adjudication trace

- Status: Accepted
- Revision: 1
- Date: 2026-10-11
- Decision owner: Repository owner
- Authority: [canonical decision](0072-reserved-turn-adjudication.think)
- Related: docs/reserved-turns-v1.md; docs/unified-consciousness.pert; ADR-0067/0069/0070/0071

## Context

Application v0.24.0-rc.9 correctly persists ranked memory, but its acceptance battle was one-sided and repetitive. Tick/beat execution adds intermediate character calls and separate semantic/free-action judgments. The owner requests fewer LLM calls, stronger adjudication, removal of beats/ticks, parallel A/B turns and up to five reservations per character. The owner accepted the proposed two parallel character calls plus one whole-turn adjudication call: "では、提案に沿って進めましょう。"

## Decision drivers

- One understandable turn boundary, bounded calls independent of reservation count.
- Adjudicate every attempted action and carry concrete consequences to subsequent actions.
- Preserve immutable historical bindings and fail closed on malformed or conflicting traces.

## Considered options

1. One adjudication call per reservation: updated intermediate input is exact but up to12 calls/turn and serial latency; rejected for initial implementation.
2. Arbitrary multi-call chunks: adds partition/restart machinery; deferred.
3. One adjudication trace per turn, deterministic sequential validation/application: selected.

## Decision

Accept reserved-turn pipeline v1 for new battles, with a new immutable binding. Historical bindings keep their original engines; do not migrate/reinterpret ongoing battles. Keep ranked memory output format v2 semantics. A/B each receive the same committed turn-start boundary through their own perception projection, never the other's private memory or plan. Call each character once in parallel. Output0..5 ordered action reservations, optional speech and required next memory; five is a maximum, not a quota. Reservations expire at turn end. No mid-turn character call, beat, tick, continuation or event-trigger scheduler in the new pipeline.

The server fixes the adjudication order before dispatch: reservation index first, then descending turn-start initiative within each A/B pair. Exact initiative ties alternate the leading side by turn parity. Each side's reservation order is preserved. This ordinal sequence is an execution order, not a second game clock. A reservation is one bounded attempt, not an unbounded script. Conditions remain short natural language evaluated by the adjudicator; no machine natural-language condition interpreter.

One adjudication LLM receives frozen canonical world, immutable rules/assets, both plans and the fixed order. It returns exactly one receipt for every reservation, in that order: success/partial/failure/cancelled, reason, canonical update DSL and observable consequences. The model must reason over its own earlier proposed changes. The server applies each receipt to a working copy, checks its base revision and target references and resource/world invariants, then validates the next. Success/partial must name a concrete effect; failure may still incur costs or side effects. Cancelled actions cannot mutate world. Defeat/interruption caused by earlier receipts must be respected. This is one generated trace, not fresh model reasoning on each server-updated intermediate world.

Only server-applied DSL changes are authoritative. Neither a character intention, descriptive success claim nor narration can modify state. Reuse typed world operations and bounded resource changes; no arbitrary object replacement, eval or executable conditions. Require all receipts exactly once, no invented or reordered reservation IDs. Invalid trace is a technical failure, not a silently repaired action failure. Validate the entire turn on a working copy and commit world, both memories, receipts, speech and turn cursor atomically with the current lease/revision. Preserve paid response/accounting evidence on failure; unknown/in-flight sends are never automatically resent. Retain existing finite transport retry policy rather than introduce schema retries or fallback models.

Normal turn budget: two parallel character calls plus one adjudication call, with at most one separate narration call using only public consequences. No additional encounter/semantic/free-action/reflection calls inside a turn. Per-role input/output/deadline and battle caps are immutable policy fields; count physical retries separately. Do not claim lower monetary cost from call count alone.

## Consequences

### Positive

- Up to10 reservations share one adjudication request and one turn commit.
- Concrete result feedback can change next-turn strategy; ordinary and improvised actions share the adjudication boundary.

### Negative and risks

- Long traces can have inconsistent causal reasoning despite structural validation.
- Characters cannot improvise new plans midway through a turn; conditional reservations are precommitted.
- Ordering is an explicit coarse turn rule, not a physics simulation. One fixed battle cannot prove quality or savings.

## Compatibility and migration

Partially supersede ADR-0067/0069/0071 only for new-pipeline scheduling, action execution and new-battle selection. ADR-0070 memory semantics remain. Preserve all historical contract schemas and readers. New authoritative private runtime and additive SQLite/PostgreSQL persistence require migration and explicit release evidence. New battles bind immutable pipeline/policy/prompt/DSL revisions and provider/model identities. No secret rotation or unpriced paid run is needed for offline implementation. Production remains application v0.24.0-rc.9 until a separately verified candidate is promoted; do not silently convert saved battles.

## Verification

Test A/B parallel dispatch and frozen isolated input;0/5/6 reservation limits; deterministic ordering and tie fairness; prior action changes later feasibility; injury/resource/world changes and cancelled actions; missing/duplicate/extra/reordered receipts; revision conflicts, invalid trace atomicity and replay/no-resend; private memory and required rank retention; immutable historical continuation; one advance equals one turn and bounded3/4 logical calls; HTTP creation/advance/persistence/public output integration. Review affected authority individually. Run shared build, governed full tests, typecheck/build/static and ADR checks. Offline results do not establish live provider quality or monetary savings.

## Implementation references

- Canonical PERT: docs/unified-consciousness.pert reservedContract/reservedCore/reservedIntegration/reservedVerify.
- Previous production acceptance: docs/evidence/unified-ranked-memory-production-2026-10-11.json.
