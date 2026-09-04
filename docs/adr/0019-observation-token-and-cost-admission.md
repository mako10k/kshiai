# ADR-0019: Bound paid observations before provider dispatch

- Status: Proposed
- Date: 2026-09-04
- Decision owner: Product and release owner
- Canonical draft: [`0019-observation-token-and-cost-admission.think`](0019-observation-token-and-cost-admission.think)
- Related: ADR-0007; ADR-0018; `docs/dialogue-activation-focus-recovery.pert`;
  `docs/evidence/dialogue-activation-stage-authorization-review-2026-09-04.md`

This Markdown file is the human-readable projection of the Proposed LLMTHINK
record. The same-basename `.think` file is authoritative. No implementation or
external action is authorized while the decision remains Proposed.

## Context

ADR-0007 atomically bounds physical provider attempts, but explicitly leaves a
separate conservative token and price policy unresolved. The current battle
provider adapter sends no explicit completion-token maximum, retains only a
provider-reported total token count and has no reliable current monetary value.
Consequently, writing token and USD numbers into a Stage authorization would
not make those boundaries enforceable.

The live `v0.21.7` backend also has xAI, OpenAI and Venice credential-variable
bindings configured. This readback does not prove that every credential is
currently usable. The revision explicitly selects xAI first but does not freeze
provider order or model variables, so current code can fall back across
differently priced models when those providers are available.

## Decision drivers

- Reject before provider transport when any approved exposure would be exceeded.
- Bind one cohort to exact provider, model and price identities.
- Keep physical attempts, tokens and USD as separate reconciled units.
- Preserve unknown usage as unknown rather than zero.
- Leave ordinary gameplay unchanged when no observation budget is bound.
- Keep Stage, provider calls, migrations and production as separate actions.

## Considered options

1. Retain post-response totals and stop later. This can detect but not prevent
   the request that crosses a ceiling.
2. Rely only on provider API-key or team limits. xAI supports model ACL, QPM,
   TPM, prepaid and postpaid controls, but in-flight requests continue and the
   controls are not scoped to one six-battle cohort.
3. Add application-owned conservative reservations before each physical
   attempt, with provider controls as defense in depth. This is the proposed
   direction.
4. Waive token and monetary limits. This would weaken the accepted
   `DAF_AUTHORIZE_STAGE` completion contract and is not proposed.

## Proposed decision

1. Bind every approved paid cohort to an immutable
   `ObservationBudgetPolicyV1`: allowed run count and expiry, exact
   providers/models, price-snapshot digest, per-request input/completion token
   envelopes, physical-attempt ceiling, total reserved-token ceiling and total
   reserved-USD ceiling.
2. Reject inherited, aliased, unpriced or out-of-policy provider fallback before
   transport. Provider-side limits remain independently verified defense in
   depth, not the cohort authority.
3. Before every observed physical attempt, derive a finite conservative token
   and charge envelope and reserve it atomically with the ADR-0007 attempt. The
   request starts only when every ceiling has room.
4. Record and reconcile the provider's prompt, cached-input, completion,
   reasoning and total usage where available. Missing or contradictory usage
   stops acceptance. A crash or unknown result retains the conservative
   reservation.
5. Use a Stage-specific controller that targets one exact tagged no-traffic
   revision and runs the six frozen slots sequentially. A stopped slot ends the
   cohort; it is not replaced. The controller does not require production
   traffic and cannot Promote.

If a provider-specific counter cannot prove a conservative request-input bound
including protocol overhead, use the model's full documented context limit or
reject the request. A postflight alert is not an acceptable substitute for the
hard admission boundary.

## Consequences

### Positive

- Owner-approved token and USD limits become real admission controls.
- Provider fallback cannot silently change the experiment or its pricing.
- Attempts, reserved exposure and actual usage remain separately auditable.
- Ordinary battles remain unaffected without an observation budget binding.

### Negative and risks

- The provider boundary and durable observation schema become more complex.
- Conservative reservations can stop a cohort before actual spend reaches its
  nominal ceiling, especially after a crash.
- A practical token bound may require provider-specific counting behavior.
- Schema additions require a forward-only migration and rollback compatibility.
- Exact provider pricing is time-sensitive and must be frozen, not remembered.

## Compatibility and migration

Extend observation-run and provider-attempt records additively with immutable
policy identity, token/charge reservation and reconciled usage fields. Existing
and ordinary battles remain nullable and keep current behavior. Any migration
execution remains a separate Stage/release authorization; application rollback
must stay compatible with the additive schema.

## Authority boundary

Acceptance would authorize only local implementation and regression tests. It
would not authorize a database migration execution, provider API-key or billing
change, tag, push, artifact publication, Stage dispatch, provider call,
Promote, production observation or persisted dialogue-setting write.

## Verification required before acceptance-grade use

- A fake transport proves rejection before I/O for exhausted physical-attempt,
  reserved-token and reserved-USD ceilings.
- Retries reserve separately; duplicate attempt identities do not double count.
- Unpriced providers/models, aliases, stale price snapshots and out-of-policy
  fallback fail closed.
- Success, failure, timeout and crash paths retain conservative reservations.
- Missing or contradictory provider usage stops the cohort and stays unknown.
- Ordinary provider calls without an observation policy remain unchanged.
- The Stage controller verifies no production traffic, exact digest, compact
  override receipt, six predetermined run identities and stop-without-replace.
- Full local tests use fake providers only and make no paid request.

## Pending owner decision

The owner must accept, revise or reject the proposed decisions above. Generic
continuation does not accept ADR-0019. Even after acceptance, exact provider,
model, price snapshot, numerical ceilings, run identities and release artifacts
remain part of the later `DAF_AUTHORIZE_STAGE` review.

## External evidence

- [xAI Management API guide](https://docs.x.ai/developers/management-api-guide)
- [xAI API-key ACLs](https://docs.x.ai/developers/rest-api-reference/management/auth)
- [xAI billing controls](https://docs.x.ai/developers/rest-api-reference/management/billing)
- [xAI usage fields](https://docs.x.ai/developers/advanced-api-usage/prompt-caching/usage-and-pricing)
- [xAI pricing](https://docs.x.ai/developers/pricing)

## Implementation references

- `backend/src/llm/provider-accounting.ts`
- `backend/src/llm/openai-compatible.ts`
- `.github/workflows/stage-release.yml`
- `.github/workflows/observe-persistent-e2e.yml`
