# ADR-0014: Queue asset authoring and accept on dedicated review screens

- Status: Accepted
- Date: 2026-08-15
- Decision owner: Product owner
- Related: ADR-0010; ADR-0011; ADR-0006; `docs/structured-asset-authoring-workflow.md`; production 524 plus stale-draft inconsistency on character generate/upgrade

## Context

Character create, revision, and upgrade begin an authoring attempt and then run structure generation, mechanical checks, bounded repair, and public-description generation in the same HTTP request. Cloudflare returns 524 after about 100 seconds. Cloud Run may continue that request for up to about 300 seconds. The client that saw 524 is not the authority for the attempt outcome.

A second fault makes the timeout visible as the wrong draft. `getLatestCharacterAuthoringAttempt` previously selected only in-flight and `awaiting_owner_acceptance` rows. A newer failed attempt was invisible, so an older awaiting draft could be returned as latest.

Polling after 524 can hide the first fault for one open tab. It cannot make the gateway wait, and it cannot define latest after failure for reloads, list views, or another device.

ADR-0010 already persists idempotent authoring attempts and requires owner activation with no provider call under the activation transaction. ADR-0011 already holds a validated candidate at `awaiting_owner_acceptance`. Battle narration already detaches provider work through an outbox, fenced lease, and Cloud Tasks wake (ADR-0006). Authoring still treats the user HTTP request as the runner.

## Decision drivers

- A successful authoring job must not depend on the submit HTTP request remaining open.
- Latest must name the newest attempt, including `failed`. An older awaiting candidate must not be presented as the result of a later request.
- Owner preview and confirmation remain required before activation.
- Sequential processing means one live provider-running attempt per asset, not a product-wide mutex that makes user B wait for user A's upgrade.
- Notifications and list marks must not become a second authority beside the attempt row.
- Narration order and authoring order are different domains.

## Considered options

1. Keep sync generate/upgrade/chat and tighten latest plus post-524 polling. This is locally small but leaves 524 as a normal success path and still binds other views to the wrong attempt.
2. Detach provider work onto the existing authoring attempt, return 202 from begin, accept on dedicated review screens, and project notifications and list marks from attempt state. This adds a worker and review routes but removes the gateway race.
3. Reuse `battle_narration_outbox` and the narration lease for authoring. This avoids new tables but couples unrelated sequence, failure, and lease domains.

## Decision

Choose option 2.

OWNER_ACCEPTANCE: the product owner approved the queued-authoring plan for this ADR on 2026-08-15 and directed continuation after the Proposed text was presented. ACCEPTANCE applies to this revision of ADR-0014.

Rules:

1. HTTP begin for character create, revision, and upgrade writes the authoring attempt and an outbox row in one transaction and returns `202` plus `attemptId`. It does not wait for a provider. A completed idempotent replay may still return the existing candidate. An in-progress replay returns the same `attemptId` with progress, not a second job.
2. The job is the existing authoring attempt. A worker, not the user request, moves the attempt through generation statuses to `awaiting_owner_acceptance` or `failed`. Confirm and discard stay synchronous and must not call a provider. Activation remains ADR-0010's atomic pointer move.
3. At most one attempt per asset may be provider-running. A global concurrency number is a provider-capacity cap, not a product rule that users wait for each other. Saturated cap means queue wait, not 524.
4. Owner acceptance happens on a dedicated review route keyed by `attemptId`. Create shows the candidate. Revision and upgrade compare the current public projection with the candidate. Submitter pages may hand the same attempt to that route when it becomes ready. They must not reconstruct a different latest draft.
5. Owner notifications and list marks are projections. Insert a notification in the same transaction that first reaches `awaiting_owner_acceptance` or `failed`. Unread state belongs only to the burger inbox. List marks follow attempt state even after the notification is read. If the target attempt is no longer awaiting or is not latest for that asset, the review route explains stale or failed and must not show an older draft.
6. Latest includes `failed`. Failed latest returns no draft.
7. Authoring uses its own outbox and fence. It may copy the narration wake pattern. It must not share narration tables.
8. Discard is allowed before the worker claims the attempt. After claim, the worker finishes or fails that attempt. Stale-lease recovery may requeue or fail; it must not activate.
9. The first implementation is character authoring. Notification and review identifiers should stay family-agnostic so battlefield and narration-style attempts can follow. Portrait generation is not an owner-acceptance hold and is out of scope.

## Consequences

### Positive

- Gateway timeout can no longer look like authoring success or failure.
- The submitter can leave. Ready and failed states reach them through the review route, burger inbox, and list marks.
- Create versus change get distinct accept surfaces without changing activation authority.
- Failed attempts stay visible instead of resurrecting an older draft.

### Negative and risks

- Conversational revision becomes a queued compare-accept loop instead of an inline same-request draft.
- A worker, outbox, lease, and wake path must be operated and recovered.
- A tight provider cap can delay other users' jobs. That delay is queue wait and must be presented as such.
- A notification table can drift from attempt state if it is written outside the terminal transaction.

## Compatibility and migration

- Existing awaiting candidates remain owner-acceptable through the new review route. They are not regenerated.
- In-flight sync requests that began before cutover run to their current terminal status. New begins after cutover must not wait for a provider.
- No sync compatibility endpoint is kept for generate, upgrade, or chat. Keeping one would restore 524.
- Current pointers, generations, and battle bindings are unchanged. This ADR does not rebind historical battles.
- Battlefield and narration-style HTTP runners stay sync until a later slice applies the same contract.
- Uncommitted 524 polling-after-timeout UI is not part of this decision.

## Verification

- Begin returns `202` while a provider mock takes minutes.
- The same asset does not run two provider-claimed attempts at once. A second begin is an idempotent replay or a conflict.
- Distinct assets may proceed when the provider cap has a free slot.
- After a later attempt fails, latest draft is null and failed is present.
- Create accept activates one generation. Change accept shows current versus candidate before activation.
- Ready and failed each insert one notification per attempt. Read receipts do not clear list marks.
- A notification whose attempt was discarded or superseded does not render an older candidate.
- Confirm and discard perform no provider call.

## Implementation references

- Plan: queued authoring, dedicated review, burger notifications
- llmthink domain `KshiaiQueuedAuthoringReview` (session audit 2026-08-15, fatal=0)
- `docs/structured-asset-authoring-workflow.md`
- ADR-0010, ADR-0011, ADR-0006
