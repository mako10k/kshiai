# Battle-pipeline production staged rollout

Date: 2026-08-06 (Asia/Tokyo)

Status: Planned. No runtime activation, production configuration change, user
data collection, release, or deployment is authorized merely by this document.
Execution authority and task order live in
[`battle-pipeline-production-rollout.pert`](battle-pipeline-production-rollout.pert).

## Transition from PoC

The exploratory PoC phase ends with `T_SOURCE_AUTHORING_SHADOW_POC`. Its fixed
S01-S09 suite passed with exact control/shadow parity, immutable observer input,
fail-open error handling, all five source artifacts for eligible cases, and zero
database, network, provider, external LLM, XAI, canonical, battle-state, or
persistence effects. The historical observation plan is retained as evidence,
but its next evaluation task is explicitly blocked as superseded.

This rollout does not resume the old actual-sample PoC. It productionizes the
validated seam through ordinary release controls, aggregate operational
telemetry, reversible cohorts, and a separate owner decision before any result
may affect a battle.

## Invariants

- `off` is the default and emergency state. Missing, malformed, stale, or
  partially loaded configuration resolves to `off`.
- Shadow execution cannot change requested or effective actions, turn order,
  state, events, narration input, persistence candidates, provider calls, or
  externally visible output. Its return value is ignored.
- Source bundles remain in memory. Durable telemetry is aggregate and bounded;
  it contains no raw prose, identity, source bundle, canonical entity ID,
  battle ID, per-turn hash, prompt, completion, or model payload.
- An incomplete, ambiguous, contested, timed-out, or failed new-path decision
  uses the existing production path. Evidence fails closed; gameplay fails open.
- Free-form semantics may be authored by structured LLM output, but only
  deterministic validated code selects and persists mechanics.
- The immutable release artifact, database migration state, Cloud Run revision,
  Worker version, rollout configuration digest, operator, time, and rollback
  targets are recorded for every production transition.

## Configuration state machine

The production contract should expose one versioned server-side configuration,
not independent ad-hoc flags:

```text
mode: off | shadow | guarded
contractVersion: exact supported integer
shadowPercent: 0 | 1 | 10 | 50 | 100
effectPercent: 0 | 1 | 10 | 50 | 100
eligibleDecisionClasses: explicit allow-list
expiresAt: required for non-off modes
```

Cohorts are selected deterministically from an opaque battle reference so a
battle cannot move between paths midstream. `guarded` additionally requires a
current owner-approved authority receipt. `effectPercent` must be zero in
`off` and `shadow`, may never exceed `shadowPercent`, and cannot exceed the
approved cohort ceiling or decision-class allow-list.

Production changes should be made by a dedicated, protected GitHub workflow.
It must verify the active release tag and backend image digest, require the
`production` environment approval and typed confirmation, create a new Cloud
Run revision from the same immutable image, validate it without traffic, record
the previous revision/configuration, and then change traffic. Direct console or
local configuration changes are break-glass actions and require an incident
record. The Worker stays on its staged immutable version unless the release
itself changes edge behavior.

## Rollout stages

| Stage | Exposure | Minimum hold | Acceptance gate |
|---|---:|---:|---|
| Disabled release | 0% | staging tests | Unit, integration, load, privacy, failure-injection, and rollback tests pass; feature absent from visible behavior |
| Production baseline | off | 24 hours | Known-good rollback targets and baseline success/error/latency/provider/write metrics recorded |
| Shadow canary | 1% | 24 hours and 100 eligible turns | Zero parity divergence, extra domain writes, and privacy violations; observer errors below 1%; p95 regression within both 10% and 20 ms |
| Shadow expansion | 10% | 48 hours and 500 eligible turns | Prior gates plus no material backend-error, provider-call, circuit-breaker, telemetry-cardinality, or cost regression |
| Shadow expansion | 50%, then 100% | 72 hours each | Separate receipts for each step; successful kill-switch drill; observation only |
| Effect authority | 0% effects | explicit owner decision | Named low-risk decision classes, deterministic validator, fallback, ceiling, monitoring, rollback operator, and non-claims approved |
| Guarded effect canary | owner cohort, then 1% | 48 hours each | No invariant or unauthorized-write breach, material battle-error regression, or rollback failure |
| Guarded effect expansion | 10%, 50%, 100% | 72 hours each | Separate owner-reviewed receipts; product and reliability metrics acceptable against disabled baseline |
| Closeout | accepted scope | 7-day final review | Evidence, incidents, residual risks, telemetry deletion, support, and rollback runbooks frozen |

Both the minimum time and minimum volume apply. Low traffic delays expansion; it
does not lower the sample gate. Each percentage change is an independently
reviewed transition, never a timer-driven automatic ramp.

## Universal stop conditions

Any stage immediately returns to `off` and records an incident when one of these
occurs:

- any control/shadow parity divergence during shadow mode;
- any extra canonical, battle-state, or persistence write in shadow mode;
- any telemetry allow-list or privacy violation;
- any deterministic mechanical invariant breach;
- observer failures at or above 1% of eligible turns;
- p95 turn latency regression above either 10% or 20 ms;
- backend 5xx or battle terminal-error increase of 0.5 percentage points or
  more over the accepted baseline;
- unexpected provider calls, unbounded telemetry cardinality, or budget breach;
- kill-switch, configuration-expiry, rollback, or evidence-receipt failure.

Turning the feature off is the first response. Artifact rollback follows when
the disabled path is unhealthy or the release contains a defect unrelated to
activation. Database rollback is excluded; schema changes must remain
expand/migrate/contract compatible with the previous application revision.

## Evidence receipt

Each stage records, without secret values or private payloads:

- release tag, commit, image digest, Cloud Run revision, Worker version, and
  migration set;
- previous and new configuration digests, percentage, mode, expiry, operator,
  approval, start/end time, eligible volume, and dashboard interval;
- every hard-gate result, observed regression, circuit-breaker event, incident,
  rollback target, and rollback drill result;
- the explicit decision to advance, hold, revise, turn off, or roll back.

Configuration or telemetry evidence alone never authorizes broader decision
classes, model changes, prompt changes, persistence changes, classifier
retraining, or removal of the global off switch. Those require separate plans.

## Forecast

The implementation and review scope is 19 points. At the retained provisional
velocity of `453p/128d` (about 3.54 points/day), the capacity forecast is about
5.37 developer/owner workdays. Calendar completion is longer because the
minimum production holds total at least 20 days after baseline, and every hold
also requires its minimum eligible-turn volume. Forecasts do not relax gates.
