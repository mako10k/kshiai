# ADR-0014: Project Stripe billing into server-owned entitlements

- Status: Proposed
- Decision state: Deferred by the product owner on 2026-08-14
- Date: 2026-08-14
- Decision owner: Product owner
- Related: `T_BILLING` in `docs/plan.pert`;
  `docs/billing-entitlement-design.md`; `docs/billing-entitlements.pert`;
  NFR-10 in `docs/requirements.md`

## Context

The parent plan now reaches `T_BILLING`, which asks for Stripe subscriptions,
Checkout, the customer portal, signed idempotent webhooks, bounded usage
accounting, and fail-closed entitlements. The original product requirements
still list billing and paid items as an explicit non-goal. Accepting this ADR
must therefore also authorize removing subscription access from that non-goal;
the existing plan alone does not silently override it.

The product owner has decided that the billing model is not defined and that
billing should be reconsidered only after the product is more mature. This ADR
therefore remains a dormant proposal. It does not select a pricing model,
authorize implementation, or make billing the next development frontier.
Reopening it requires an explicit product-maturity review and owner consent.

The runtime is a stateless Hono API behind a Cloudflare Worker, with Supabase
authentication and shared PostgreSQL persistence. Cost-bearing routes already
use application idempotency keys in some paths, image attempts have a local
rate-limit log, and protected observation runs record provider attempts. None
of those records is a customer billing ledger or an entitlement authority.

Stripe Checkout completion, browser redirects, webhook delivery, and Stripe
meter summaries are asynchronous external observations. Webhooks can be
duplicated and delivered out of order. The application must not grant access
from a redirect, trust client-supplied price or customer IDs, or make every
gameplay request depend synchronously on Stripe availability.

## Decision drivers

- Grant paid access only from authenticated, Stripe-verified state.
- Deduplicate webhook delivery and product usage across retries, reconnects,
  instances, and both battle-advance aliases.
- Keep payment instruments and Stripe secrets outside the application database
  and frontend bundle.
- Fail closed for new cost-bearing work without locking users out of history,
  deletion, billing recovery, or account access.
- Preserve battle authority, immutable asset binding, and existing rollback
  behavior; billing may authorize an operation but may not alter its result.
- Permit Stripe and Cloud Run outages to use a bounded, non-expired local
  entitlement projection instead of turning Stripe into a synchronous gameplay
  dependency.
- Make pricing, allowance, and exemption changes explicit and versioned.

## Considered options

1. Treat Checkout success pages or client-visible subscription data as access
   authority. This is small but forgeable, race-prone, and cannot handle later
   payment failure or cancellation.
2. Query Stripe before every billable request and use the response directly.
   This is fresh but couples game availability and latency to Stripe, does not
   itself prevent duplicate usage, and leaves no auditable local decision.
3. Treat Stripe as billing truth while projecting verified subscription events
   into a durable PostgreSQL entitlement snapshot, then reserve and consume
   versioned product usage locally. This is the proposed option.

## Decision

Choose option 3 if this ADR is accepted.

### Authority and catalog

Stripe owns customers, prices, subscriptions, invoices, and payment state. The
application owns a minimal verified projection used for authorization. Only a
signed webhook followed by server-side Stripe reconciliation, or an explicit
operator reconciliation using the same code path, may advance that projection.
Checkout or portal responses never grant an entitlement.

Every grant binds a versioned server catalog. A catalog maps an allowlisted
Stripe price to closed entitlement and usage-operation IDs. The client may
choose only a public plan key; it may not send a Stripe price, customer,
subscription, meter, allowance, or entitlement value. Catalog versions and
their operation rules are immutable once used by a receipt.

The proposed first product is a recurring subscription with hard, server-side
allowances and no automatic overage charge. Exact price, currency, interval,
trial policy, allowance values, and treatment of a subscription that expires
mid-battle require a separate owner-accepted catalog receipt before Stage.
Usage-based overage, credits, paid items, and a virtual-currency economy are not
authorized by this ADR. Stripe Meter Events may be enabled only by a later
catalog version that explicitly authorizes a metered price.

### Webhook and reconciliation boundary

`POST /api/billing/webhook` receives the byte-identical bounded request body
through the existing Worker proxy and verifies `Stripe-Signature` before JSON
parsing. Invalid signatures, oversized payloads, livemode mismatch, unsupported
API versions, and unexpected account scope are rejected without a database
mutation.

The receiver inserts a durable inbox row keyed by Stripe Event ID and returns a
successful duplicate response for an already retained event. Processing is
asynchronous and leased. Because Stripe does not guarantee event order, the
processor retrieves the relevant current Stripe object and derives a complete
snapshot instead of applying event names as ordered deltas. It records the
source event, object ID, event time, payload digest, processing state, and any
error. The raw verified payload is private, retention-bounded, and never
returned by a user or observation API.

Cloud Tasks may wake the processor, reusing the current OIDC task pattern. A
pending inbox row remains recoverable when task dispatch fails. Startup and an
operator command can redispatch retained pending rows without re-inserting the
Stripe event.

### Checkout and portal

Authenticated Checkout and portal endpoints are idempotent server operations.
The server creates at most one Stripe Customer per application user, uses only
the accepted catalog and configured return origins, and returns a short-lived
hosted URL. A Stripe Customer is never selected by email alone. Portal access
remains available while a subscription is delinquent or inactive so the user
can recover billing.

### Entitlement and usage enforcement

Entitlement checks occur at cost-bearing product-operation boundaries, before
the first provider or image call. A transaction creates or reuses one usage
receipt keyed by `(user_id, operation_kind, operation_id)`, binds the exact
entitlement/catalog revision, checks the period allowance, and reserves a
bounded integer quantity. Replaying the same application idempotency key reuses
the same receipt and never consumes a second unit.

Receipts move through closed states: `reserved`, `consumed`, or `released`.
Validation and authorization failures before cost-bearing work release the
reservation. The accepted catalog must state whether a provider-attempt failure
consumes an allowance; the implementation may not infer this from HTTP status
or provider wording. Stale reservations are reconciled using the durable
operation result and a lease, not released merely because a request timed out.

The first enforcement inventory includes structured character, battlefield,
and narration authoring; character and battlefield images; improvement
analysis; match-policy generation; battle creation; and every route that
advances a battle. Read-only APIs, authentication, public search, history,
replay, deletion, export, Checkout, portal, webhook receipt, and billing status
remain outside the paid gate.

An absent, expired, ambiguous, or conflicting entitlement denies new
cost-bearing work with a stable `entitlement_required` or
`allowance_exhausted` response. An unexpired locally verified snapshot remains
usable during a Stripe outage. Administrative, developer, test, and E2E access
uses explicit, expiring server grants with audit rows; account kind or frontend
flags do not create an implicit paid bypass.

Billing authorization has no authority over battle mechanics, asset contents,
winner, rating, narration facts, or provider routing. Billing failure cannot
partially mutate those domains. Existing completed operation responses remain
replayable even if the current subscription later changes.

## Consequences

### Positive

- Subscription state and per-operation usage are auditable and deterministic
  across webhook retries and multiple runtime instances.
- Stripe outages do not affect already verified entitlements until their
  explicit validity boundary.
- Browser redirects and public IDs cannot grant access or select a product.
- Users can recover billing and access their existing data while paid mutations
  fail closed.
- Product pricing can change through a new catalog without rewriting historical
  usage receipts.

### Negative and risks

- The design adds a durable webhook inbox, reconciliation worker, entitlement
  projection, usage ledger, and operational recovery path.
- There is an intentional bounded delay between Stripe state changes and the
  local projection.
- A product catalog and explicit failure-consumption policy must be accepted
  before meaningful enforcement tests can pass.
- Incorrect secret rotation, API-version pinning, or Worker body forwarding can
  block every billing update.
- Hard allowance checks require careful transaction isolation around concurrent
  requests.

## Compatibility and migration

- Add forward-only PostgreSQL and SQLite-development tables. Do not attach
  Stripe IDs directly to public user DTOs or rewrite existing domain history.
- Existing users start without paid entitlements. Before enforcement is enabled,
  the owner must choose an explicit launch grant, trial, or enrollment policy;
  silent permanent grandfathering is not allowed.
- Enforcement is deployed disabled, then exercised in Stripe test mode and a
  no-traffic Stage revision. Enabling production billing secrets, a live webhook
  destination, products, prices, traffic, or enforcement is a separate protected
  release decision.
- Rollback disables new paid mutations and preserves inbox, subscription, and
  usage rows for reconciliation. It does not delete Stripe objects or attempt a
  reverse migration.
- Acceptance supersedes only the billing line in the original non-goals. Paid
  items, gacha, virtual currency, and arbitrary overage remain excluded.

## Verification

- Signature tests use the exact raw body and reject mutation, stale signatures,
  wrong secrets, livemode mismatch, and oversized bodies.
- Duplicate, concurrent, out-of-order, missing-object, retry, and secret-rotation
  webhook fixtures converge to one current snapshot.
- Checkout and portal tests prove user/customer isolation, server price
  allowlisting, idempotency, safe return origins, and no redirect-based grant.
- Concurrent allowance tests prove one receipt per operation, no over-consume,
  correct reserve/consume/release behavior, and stable replays after entitlement
  changes.
- Route tests cover every cost-bearing entry point and prove read, history,
  replay, deletion, billing recovery, and webhook paths remain available.
- Stage uses Stripe test mode, an exact immutable revision, webhook replay, task
  recovery, PostgreSQL concurrency, and a rollback rehearsal. Production
  configuration and traffic require explicit owner approval.
- Full workspace tests, lint, build, migrations, Worker body-preservation tests,
  secret scan, and PERT checks pass before local acceptance.

## Implementation references

- [Detailed design](../billing-entitlement-design.md)
- [Execution plan](../billing-entitlements.pert)
- [Stripe webhook guidance](https://docs.stripe.com/webhooks)
- [Stripe subscription Checkout guidance](https://docs.stripe.com/payments/checkout/build-subscriptions)
- [Stripe customer portal API](https://docs.stripe.com/api/customer_portal/sessions)
- [Stripe usage recording guidance](https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api)
