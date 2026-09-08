# ADR-0024: Detach asset authoring execution from read traffic

- Status: Accepted
- Date: 2026-09-08
- Decision owner: Product owner
- Canonical draft: [`0024-detach-authoring-from-read-traffic.think`](0024-detach-authoring-from-read-traffic.think)
- Related: GitHub Issue #141; ADR-0014; ADR-0006

This Markdown file is the human-readable projection of the Accepted LLMTHINK
record. The same-basename `.think` file is authoritative.

OWNER_ACCEPTANCE: on 2026-09-08, after the related-ADR consistency review
corrected the user-boundary defect in this record, the product owner explicitly
approved this revised ADR-0024. Acceptance authorizes local implementation only
within the authority boundary below.

## Context

The six character, battlefield, and narration-style draft GET handlers call
`wakeCharacterAuthoringJobs` before returning state. That helper starts an
unawaited in-process worker which claims the oldest capacity-eligible job across
all three families. Selecting globally is valid for an environment-global worker
queue; the defect is that a read request is being used as its execution trigger.

A job can also remain pending indefinitely after command-request loss, process
restart, or scale-to-zero when nobody polls. The GET calls are masking the
missing durable wake required by Accepted ADR-0014; deleting them alone would
expose stranded jobs without correcting the producing defect.

## Decision drivers

- Draft GET routes are read projections and must have no execution side effects.
- Accepted commands must durably bind the job and its wake intent in one transaction.
- The worker queue and provider-capacity admission are global to the environment.
- One selected execution must preserve its persisted owner and entity boundary.
- Cross-user visibility or selection never grants entity mutation authority.
- Authoring persistence and fences must remain separate from battle narration.
- Process loss, restart, scale-to-zero, duplicate delivery, and stale delivery must recover.

## Considered options

1. Remove GET wake calls and retain mutation-time fire-and-forget. This leaves
   accepted work dependent on one process surviving after the response.
2. Add a process-local startup drain. This recovers only when a process starts
   and still cannot wake a scaled-to-zero service.
3. Persist a generic queue wake and let the environment-global worker claim the
   next job. This respects ownership but makes wake-to-job completion and lost-
   delivery reconciliation indirect.
4. Persist one authoring outbox delivery per job and address that job explicitly
   inside the same environment-global queue. This is proposed for traceable
   liveness and idempotent recovery, not for per-user queue partitioning.

## Decision

1. Remove all authoring wake calls from the six draft latest/by-ID GET routes.
   Regression tests require repeated reads to produce zero job claims, attempt
   transitions, outbox writes, notifications, and provider calls.
2. Add an authoring-owned outbox row in the same transaction that inserts or
   reopens a character, battlefield, or narration-style job. The outbox records
   family, attempt ID, delivery generation and delivery state and does not share
   narration persistence.
3. Deliver an OIDC-authenticated internal task containing exactly one outbox ID,
   family, attempt ID, and generation. The handler resolves owner and entity from
   persisted job state, rather than accepting them from the task, and processes
   that job under a unique worker identity and fenced lease. Capacity exhaustion
   retries the same delivery.
4. Use deterministic task identity from outbox ID and generation. Dispatch after
   command commit, retry pending dispatch during startup, and re-arm stale
   deliveries only when there is no active matching lease. Treat Cloud Tasks
   `ALREADY_EXISTS` for the same identity as idempotent success.
5. Use one environment-global authoring worker queue for all users and all three
   families. Initially reuse the configured Cloud Tasks transport project,
   location, physical queue, and service account, while keeping an authoring-
   specific URL, audience, task namespace, outbox, endpoint, and fence. A later
   dedicated physical queue may isolate throughput without changing global
   scheduling or owner-scoped execution.

## Consequences

### Positive

- Polling becomes observational and cannot cause provider work.
- Accepted authoring work progresses independently of browser lifetime and later reads.
- Each delivery, claim, lease, retry, and terminal result has one traceable job identity.
- One environment-global worker can serve every user while each execution remains owner-scoped.
- Duplicate and stale deliveries recover without sharing narration authority.

### Negative and risks

- A new outbox, exact-claim repository path, task endpoint, and configuration are required.
- Sharing the physical queue initially couples authoring and narration throughput.
- Stale recovery and terminal closure must agree with all three family runners.
- Schema and runtime rollout require compatibility across old and new revisions.

## Compatibility and migration

Add the authoring outbox and any fence columns through a forward-only migration.
Existing pending jobs receive outbox rows idempotently so they become dispatchable.
During a mixed-revision rollout, old revisions may still issue an in-process wake;
the exact atomic claim and lease must prevent concurrent ownership. The new code
may read old rows with migration defaults. Reverting application code must not
require dropping the additive schema.

## Authority boundary

Acceptance authorizes local migration, repository, dispatcher, endpoint,
command-path wake, startup recovery, configuration, workflow checks, and tests.
It does not authorize executing a migration in a deployed environment, changing
cloud resources, pushing, releasing, or deploying to Stage or production.

## Verification

- Repeated latest and by-ID GETs for all three families make no writes or provider calls.
- Create, revise, upgrade, and authoring chat persist one exact wake with the job.
- Jobs from different owners share one queue and can progress within the global cap.
- Every task resolves owner and entity from persisted state; task input cannot replace them.
- Every attempt, candidate, asset, generation, notification, and pointer mutation
  remains inside that resolved owner/entity scope.
- A public or selectable entity cannot be authored, activated, deleted, or have
  its current pointer moved by a non-owner without separate explicit authority.
- Duplicate deliveries are idempotent and a stale worker fails the fence.
- Pending and stale-dispatched jobs resume after simulated process restart without a GET.
- Character, battlefield, and narration-style jobs reach owner-review or failure equally.
- New and repaired contracts contain no `any`, `Record<string, any>`, arbitrary record,
  `as any`, or `as unknown as` boundary.
- Release smoke can read draft endpoints without changing any authoring state.

## Implementation references

- `backend/src/routes.ts`
- `backend/src/services/character-authoring-jobs.ts`
- `backend/src/repositories/family-authoring-jobs.ts`
- `backend/src/services/authoring-task-dispatch.ts`
- `backend/migrations/0023_authoring_dispatch.sql`
- `backend/src/routes-authoring-read-purity.test.ts`
- `backend/src/services/character-authoring-jobs.test.ts`
- `.github/workflows/stage-release.yml`
- GitHub Issue #141
