# Stripe billing and entitlement design

- Status: Deferred proposal; not a current implementation plan
- Date: 2026-08-14
- Related: [ADR-0014](adr/0014-stripe-billing-and-entitlement-authority.md),
  [`T_BILLING`](plan.pert), [execution plan](billing-entitlements.pert)

## 0. Deferral decision

On 2026-08-14 the product owner confirmed that the billing model is still
undefined and should be discussed only after the product matures. The material
below is retained as design inventory, not as an accepted direction or current
frontier. No billing schema, dependency, route, Stripe object, secret,
deployment, or entitlement enforcement may be added from this proposal.

Reconsideration starts by defining the product value boundary and billing
model. Only then may the owner decide whether this proposal should be revised,
accepted, replaced, or rejected. A generic request to continue unrelated
product work does not reopen the deferred billing scope.

## 1. Scope and current-state findings

This design covers subscription enrollment, billing recovery, verified webhook
processing, local entitlement projection, bounded product usage, and enforcement
of cost-bearing operations.

Confirmed current seams:

- Supabase identity maps to the application `users.id`; public user DTOs contain
  no billing state.
- PostgreSQL is the production authority, while SQLite supports local tests.
- `idempotency_keys` already deduplicates battle and image request scopes, but it
  stores responses rather than customer usage authority.
- `image_gen_events` is a rate-limit attempt log. It is not a subscription
  allowance or invoice source.
- `provider_operation_runs` and attempts are protected E2E observation data.
  Provider token/cost observations are not stable customer product units.
- The Cloudflare Worker proxies request method, headers, query, and body to the
  backend and injects the protected origin header. Its raw-body preservation
  needs an explicit Stripe signature regression.
- Cloud Tasks and a durable outbox already wake ordered narration work on a
  scale-to-zero backend. Billing can reuse the deployment pattern but not the
  narration tables or task identity.
- `docs/requirements.md` still excludes billing. No billing schema, Stripe SDK,
  product catalog, secret, route, page, or deployment binding exists.

Out of scope for this decision: paid items, gacha, virtual currency, marketplace
payments, Stripe Connect, refunds initiated by this application, tax advice,
usage-based overage without a later catalog decision, and production setup.

## 2. Authority model

```text
authenticated user -> Checkout/Portal session -> Stripe-hosted UI
                                            |
Stripe signed event -> durable inbox -> leased reconciliation -> Stripe API
                                                     |
                                                     v
                                  verified subscription snapshot
                                                     |
cost-bearing request -> entitlement decision -> usage reservation
                                                     |
                                     domain operation/idempotent replay
                                                     |
                                      consume or release receipt
```

Stripe owns money and subscription lifecycle. PostgreSQL owns the exact local
authorization decision and usage receipt used by a request. The frontend owns
neither.

The local projection is valid only until its stored `valid_until`. A Stripe
outage does not revoke an unexpired snapshot. Once validity is absent or expired,
new paid work fails closed. A success redirect never extends validity.

## 3. Proposed catalog contract

The implementation defines closed IDs rather than arbitrary strings:

```ts
type BillingPlanKey = "member_v1";

type BillableOperation =
  | "character_authoring"
  | "battlefield_authoring"
  | "narration_authoring"
  | "character_improvement"
  | "match_policy_generation"
  | "character_image"
  | "battlefield_image"
  | "battle_create"
  | "battle_advance";

type AllowanceRule = {
  operation: BillableOperation;
  units: number;
  period: "subscription_period";
  providerFailure: "consume" | "release";
};
```

A catalog revision contains the public plan key, allowlisted Stripe price IDs,
subscription statuses that grant access, snapshot freshness rule, entitlement
IDs, and allowance rules. Stripe IDs come from server configuration and are
matched against the catalog; the browser never supplies them as authority.

Recommended initial product decision:

- one recurring plan;
- hard per-operation allowances;
- no overage invoice and no virtual credits;
- `active` and `trialing` grant only through their verified period boundary;
- `past_due`, `unpaid`, `incomplete`, `paused`, and canceled subscriptions grant
  no new reservation;
- reads and billing recovery remain open;
- a battle does not receive an unlimited lifetime grant at creation.

The owner must accept exact limits, price/currency/interval, trial availability,
provider-failure consumption, launch treatment for existing users, and whether
an already active battle gets a bounded period-end completion grace. These
values are recorded as `docs/evidence/billing-catalog-v1-acceptance.md` before
Stage. They are not inferred from Stripe Dashboard state.

## 4. Persistence model

The next forward migration reserves migration number `0020` only after
ADR-0014 is Accepted.

### `billing_accounts`

- `user_id` primary key and foreign key to `users`;
- unique `stripe_customer_id`;
- `created_at`, `updated_at`;
- no email, address, tax ID, payment method, card, or invoice payload.

Customer creation is serialized per user. A conflict reads back the existing
mapping. Email is metadata for Stripe UI only and never resolves ownership.

### `billing_webhook_events`

- Stripe `event_id` primary key;
- `event_type`, `object_id`, `event_created_at`, `livemode`, `api_version`;
- payload bytes or JSON plus SHA-256 digest, encrypted-at-rest by the database
  platform and inaccessible to product APIs;
- `pending | processing | processed | failed_terminal`;
- lease owner/expiry, attempt count, next attempt, normalized error, timestamps.

The receiver verifies signature and bounds the body before insert. Duplicate
inserts return the retained disposition. Processing leases use database time.
Raw payload retention is bounded and cleared after the operational replay
window; normalized snapshot and digest remain.

### `billing_subscription_snapshots`

- one current row per application user and Stripe subscription;
- Stripe customer/subscription/price IDs;
- normalized status, current period bounds, cancel-at-period-end;
- catalog revision and derived `valid_until`;
- reconciliation source event/object/retrieval time and a monotonic local
  revision;
- unique Stripe subscription ownership.

An event triggers retrieval of the current Stripe subscription. The complete
retrieved object replaces the prior projection transactionally. Event delivery
order does not directly decide status.

### `billing_entitlement_grants`

- explicit grant ID, user ID, entitlement ID, catalog revision;
- source `stripe_subscription | launch | operator | test` and source ID;
- validity interval, state, creation actor, reason, timestamps.

Stripe-derived grants are rebuilt from the verified snapshot. Non-Stripe grants
must be explicit, expiring, and auditable. Account kind, administrator status,
email, or frontend state is not a grant.

### `billing_usage_receipts`

- primary identity `(user_id, operation_kind, operation_id)`;
- stable receipt ID, catalog and entitlement revisions;
- integer reserved/consumed units and allowance period key;
- `reserved | consumed | released` plus timestamps and release/consume reason;
- domain reference such as battle or asset attempt ID, excluding prompt/output
  and payment data;
- lease fields for reconciliation.

Allowance totals count reservations plus consumed receipts under a row lock or
serializable retry. A concurrent pair cannot both spend the final unit. A replay
returns the existing receipt regardless of the user's newer subscription state.

### `billing_meter_outbox`

This table remains inactive for the proposed flat hard-limit catalog. A later
accepted metered catalog can append one outbox row per consumed receipt and send
one Stripe Meter Event identifier derived from the receipt ID. The outbox never
reconstructs usage from provider logs or aggregate counters. Stripe processes
meter events asynchronously, so its summary is reconciliation evidence, not the
runtime entitlement counter.

## 5. API boundary

### Public authenticated APIs

| Method and path | Contract |
| --- | --- |
| `GET /api/billing/status` | Minimal plan, entitlement, allowance, period, and recovery state; `private, no-store` |
| `POST /api/billing/checkout` | Requires application idempotency key and public plan key; returns hosted URL only |
| `POST /api/billing/portal` | Requires application idempotency key; returns short-lived hosted URL only |

The status DTO never includes Stripe customer/subscription IDs, webhook data,
payment details, internal grant reasons, or raw receipt metadata.

### External and internal APIs

| Method and path | Contract |
| --- | --- |
| `POST /api/billing/webhook` | Worker-origin protected, unauthenticated by user, raw signature verified, bounded durable receipt |
| `POST /api/internal/billing/task` | Cloud Tasks OIDC only; leases and processes one retained inbox/outbox item |

The origin middleware continues to reject direct Cloud Run webhook calls. Stripe
targets the Worker public URL. Secret rotation permits the current and next
webhook secret for a bounded overlap without logging either value.

Stable failures:

- `billing_not_configured` for a locally disabled integration;
- `entitlement_required` for no valid grant;
- `entitlement_stale` for an expired/ambiguous projection;
- `allowance_exhausted` with public period reset time;
- `billing_request_conflict` for idempotency-key/body mismatch.

## 6. Operation enforcement inventory

One central guard wraps a product operation; individual provider adapters do not
decide customer entitlements.

| Operation | Route families | Operation identity |
| --- | --- | --- |
| Structured authoring | generate, upgrade, chat/revise for character, battlefield, narration | persisted authoring attempt ID |
| Improvement | character improvement analyze/prompt | character plus request idempotency key |
| Match policy | `/match/policies` | request idempotency key and request digest |
| Images | character and battlefield image generation | immutable media operation ID |
| Battle creation | `/battles` | existing deterministic battle ID |
| Battle advance | `/advance`, `/advance/stream`, legacy `/action` | existing battle advance scope and operation digest |

Confirmation, draft deletion, operational visibility changes, copy from an
already generated snapshot, and read paths do not independently consume usage.
If a route currently lacks an application idempotency key, adding it is part of
the enforcement slice; a random server key per retry is not acceptable.

The entitlement transaction completes before the first external provider call.
The domain mutation remains in its existing repository/service boundary. The
usage reconciler decides `consumed` or `released` from the durable domain result
and accepted catalog rule. It never edits a battle or asset to make accounting
pass.

## 7. Webhook lifecycle and recovery

1. Read at most the configured body ceiling as bytes.
2. Verify a recent Stripe signature against the configured rotation set.
3. Parse the pinned snapshot Event schema and verify livemode/account scope.
4. Insert the event or read back the duplicate in one transaction.
5. Dispatch a Cloud Task after commit; dispatch failure leaves `pending`.
6. Return `2xx` once the event is durable, including retained duplicates.
7. The worker leases the event and retrieves the current customer/subscription.
8. Map only an allowlisted price/catalog, replace the local snapshot and grants,
   mark the event processed, and retain a projection receipt atomically.
9. Retry transient Stripe/database failures with a bounded schedule. Unknown
   product/API versions become terminal and revoke no existing unexpired
   snapshot; they surface an operator alert before the snapshot expires.

An operator recovery command lists retained pending/failed events, takes exact
event IDs, runs the same processor, and reads back the resulting snapshot. It
does not accept an arbitrary entitlement patch.

## 8. Checkout, cancellation, and status changes

- Checkout creates or reuses the mapped Customer and an idempotent subscription
  session for one accepted catalog key.
- A return page polls `GET /api/billing/status`; it does not assume success from
  a query parameter or Checkout Session state.
- Portal sessions are created on demand for the user's mapped Customer.
- Subscription updates, payment recovery, cancel-at-period-end, cancellation,
  pause, and trial changes flow through webhook reconciliation.
- If a user has multiple relevant subscriptions, the projection records a
  conflict and denies new paid work until reconciliation; it does not choose the
  most permissive row.
- Refunds and disputes do not automatically delete game data or rewrite usage.
  Any immediate grant-revocation rule requires a catalog decision.

## 9. Deployment and secrets

Required runtime secrets are separate Secret Manager resources:

- `STRIPE_SECRET_KEY`;
- current `STRIPE_WEBHOOK_SECRET`;
- optional next webhook secret during rotation.

Public configuration includes the pinned Stripe API version, mode, accepted
catalog revision, public application origin, and allowlisted price IDs. The
frontend receives no secret key and does not need Stripe.js for hosted Checkout.

Stage must attach test-mode secrets only to the no-traffic immutable Cloud Run
revision, create no live Stripe product, and point a test webhook destination to
the exact Worker preview/Stage path selected by the release design. Production
secret creation, IAM binding, webhook creation, products/prices, catalog
activation, migrations, and traffic are separately approved external writes.

## 10. Acceptance matrix

Local acceptance requires:

- SQLite and PostgreSQL migration parity and transaction-concurrency tests;
- raw-body signature fixtures through Hono and the Worker proxy;
- duplicate and out-of-order webhook convergence;
- Checkout/portal isolation and request idempotency;
- allowance boundary, replay, stale reservation, and expired projection tests;
- an inventory assertion that every route above passes through the guard;
- no billing fields in public users, profiles, battles, assets, observations,
  logs, or frontend storage;
- full lint, tests, build, migration smoke, and PERT checks.

Stage acceptance additionally requires Stripe test clocks or equivalent
test-mode lifecycle evidence for trial/active/past-due/cancel transitions,
webhook retry and task redispatch, secret rotation, two-instance allowance
contention, and rollback with all ledger rows preserved.

Production is not authorized by local or Stage acceptance. The owner reviews
the exact catalog, test-mode receipts, immutable artifacts, secrets/IAM diff,
rollback target, and enforcement switch before Promote.

## 11. Decision locks

Before ADR acceptance:

1. Confirm the recurring hard-allowance/no-overage product direction.
2. Confirm that paid subscription access supersedes only the billing part of the
   original non-goal.

Before Stage:

3. Accept exact catalog values and failure-consumption policy.
4. Accept existing-user launch treatment and active-battle period-end behavior.
5. Pin Stripe API version, test product/price IDs, event set, payload ceiling,
   snapshot freshness, and raw payload retention.

Before production:

6. Approve live Stripe objects, secrets/IAM, migrations, enforcement activation,
   promotion, and rollback as one exact release receipt.
