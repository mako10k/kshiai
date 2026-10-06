# Deferred narration delivery generation repair

Date: 2026-10-06. PERT: `awareness-public-deploy`; public completion remains planned.

## Observations and boundary

Stage rc.9 / run [37405299375](https://github.com/mako10k/kshiai/actions/runs/37405299375) failed its former 24-advance observer limit. The independent observer correction is merged as PR163/main `0bf6cdf6ffe96d16c87bec9615768cf39da3de16`; all four main CI jobs passed. It does not establish successful narration or public completion.

Exact battle `btl_d8b863802f25da550741bba041d30a18`, inspected using verified CA and explicit read-only PostgreSQL transaction: narration entries completed1/queued23; batches completed1/deferred1; attempts completed1/abandoned1 (`budget_lease_busy`, no paid attempt). The earliest queued receipt is sequence2, outbox status dispatched, delivery_generation0, delivery_attempts2, dispatched_at `2026-10-06T02:48:10.008Z`. Its derived task ID is `narration-cc134698607f8ac6110ce1048c5e400e925204f14b2eb7b57ec870816dfc50a5`. Cloud Tasks describe returns NOT_FOUND, indicating a recently existing task has completed or been deleted. No queue or battle data was changed.

## Reasoning and uncertainty

V5 prephysical budget-lease contention defers its claimed batch, restores selected entries and outboxes to queued/pending, and acknowledges the delivery. The former deferral retained its generation. Immediate dispatch consequently used the same deterministic task ID. Existing dispatcher intentionally accepts ALREADY_EXISTS as an ambiguous enqueue success and records dispatched. Acknowledging the original delivery leaves no executable replacement. Five-minute stale recovery exceeds the normal 180-second publication deadline.

Explicit Cloud Tasks IDs cannot immediately be reused after execution/deletion: [official tasks.create contract](https://docs.cloud.google.com/tasks/docs/reference/rest/v2/projects.locations.queues.tasks/create). Exact historical CreateTask409 was not logged, and the precise contention holder and queue tombstone duration remain unknown. The event-level409 is an inference supported by source behavior, unchanged generation, two dispatch attempts and the absent task. The producing condition is generation reuse during acknowledged deferral; lease contention is its trigger. The200/409 combination belongs to that mechanism. Tests omitted the queue's explicit-ID deduplication after acknowledgment.

## Accepted repair and alternatives

Accepted ADR0050/0051/0054/0057 govern durable narration, fencing, physical accounting and normal completion. Increment selected outbox delivery_generation inside the existing fenced V5 deferral transaction, retaining receipt, batch and attempt history. Existing generation guards acknowledge stale deliveries; the new generation has a fresh deterministic task ID. Deferral makes zero SDK calls and does not consume a physical attempt.

Bounded similarity review found the same acknowledgment loss in V5 preclaim flush-window deferral and waiting for an outstanding batch. Maintain the input delivery in that existing fenced transaction with its expected generation, without another SDK call for an outstanding batch. Apply the same conditional fresh generation when successful publication requeues an input delivery outside its selected batch. Preserve completed and unrelated outboxes. The existing six-second flush timer and deadlines bound preclaim waiting; no new scheduling policy or V4 behavior is introduced.

Do not change V4 handlers, Cloud Tasks409 handling, model transport retry, budgets, normal policy, completion semantics or held legacy trial. Returning503 for every deferred route would expand legacy behavior and depend on queue backoff; weakening409 handling would risk duplicate ambiguous enqueue; manual failed-battle recovery is unnecessary. The smallest correction is the V5 transaction update.

Current review boundary: atomic generation advancement, stale/duplicate delivery fencing, history preservation and prephysical accounting. Successor evidence: mandatory CI, new immutable Stage with38 advances/200 physical operations, then authorized Promote and fresh public complete battle. Local tests do not supply public acceptance. Public traffic remains on the prior revision.

[CLI reasoning](awareness-narration-deferred-delivery-repair-2026-10-06.think), including the related deferred paths, audited fatal0/error0/warning0. Independent implementation review found no remaining INSIDE findings after adding direct flush-wait, outstanding-batch and successful-unselected-input regressions. Old generations acknowledge without a provider call; only the successor generation publishes; unrelated outboxes retain their generation. The busy deferral makes no provider call.

Local workspace build, typecheck and static checks passed. Required awareness suite:301 tests,299 passed,2 explicit PostgreSQL skips,0 failed. Focused awareness narration19/19 and legacy narration14/14 passed. Governed test suite passed. Native PostgreSQL CI, immutable Stage and public completion remain subsequent gates. No local result is normal public completion evidence.
