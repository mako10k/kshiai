# Production battle-pacing baseline — 2026-08-12

Status: read-only predeployment observation. This is not evidence that the
provisional `candidate-12-v2` values are correct, and it does not authorize a
release or deployment.

## Production identity

The currently recorded production release is v0.16.0:

- commit: `4bfba23916b82773a04614a00001e711dc7ac1bf`
- promoted: 2026-08-11 13:31:28 UTC
- Cloud Run revision: `kshiai-api-00080-tah`
- Worker version: `7dfa887d-bf78-4297-84e8-78b61a0841f6`
- Promote run: `31495648880`

The identity comes from the immutable GitHub release record and its successful
Promote workflow. Production data was queried through a read-only PostgreSQL
transaction. No API advance, LLM call, battle creation, or database write was
performed.

## Evidence by comparability

### v0.16.0-only window

Only one `battle_finished` observation exists after the v0.16.0 promotion and
there are no persistent E2E observations in that window.

| Metric | Value |
| --- | ---: |
| Finished battles | 1 |
| Combat turns | 20 |
| Turn-limit finishes | 1 |
| Early-KO flags | 0 |
| One-shot-suspect flags | 0 |

This sample is too small for a rate comparison or a rejection decision. It is
the correct current-release baseline boundary, but not a statistically useful
baseline by itself.

### All retained `battle_finished` events

These 140 events span 2026-08-02 through 2026-08-11 and therefore mix earlier
application versions. They describe historical production behavior only.

| Metric | Value |
| --- | ---: |
| Finished battles | 140 |
| Mean combat turns | 15.39 |
| Median combat turns | 18 |
| Maximum combat turns | 20 |
| Incapacitation finishes | 71 (50.71%) |
| Turn-limit finishes | 69 (49.29%) |
| Early-KO flags | 6 (4.29%) |
| One-shot-suspect flags | 4 (2.86%) |
| Short-match flags | 6 (4.29%) |

The high historical turn-limit share supports trying a more aggressive
provisional policy, but version mixing prevents attributing it to v0.16.0 or
predicting the candidate result.

### Retained persistent E2E observations

The 25 synthetic observations span 2026-08-07 through 2026-08-11 and all
predate the v0.16.0 production window. The fixed fixture is not representative
of general-player character or battlefield diversity.

| Metric | Value |
| --- | ---: |
| Observations | 25 |
| Finished by incapacitation | 25 |
| Mean final turn | 12.80 |
| Median final turn | 13 |
| Maximum final turn | 18 |
| Advance calls | 370 |
| Mean advance latency | 14.348 s |
| p50 / p95 / maximum latency | 13.941 / 23.392 / 43.965 s |
| Exact duplicate dialogue lines | 137 of 506 |
| Mean per-battle exact unique rate | 0.745 |

The E2E data is useful as an operational and dialogue-history reference. It is
not a pacing acceptance set because the fixture and application versions are
not the candidate configuration.

## Explicitly unavailable baseline metrics

The retained v0.16.0 evidence does not provide a trustworthy aggregate for:

- committed mechanical-change and semantic/world-change magnitude;
- action repetition, initiative-order response, and delayed-effect outcomes;
- narration queue errors or retries;
- model call count, input/output tokens, or estimated cost;
- candidate-specific forced-terminal, KO, restoration, or finish-pressure
  behavior.

These values must not be inferred from prose or from the deterministic local
simulation. v0.17.0 introduces the structured receipts and observability needed
for several of them; any remaining telemetry gap should be reported as missing
rather than triggering additional LLM calls solely for measurement.

## Comparison rule after deployment

Use the v0.16.0-only row as the release boundary and the mixed historical rows
only as context. Accumulate ordinary production battles under the frozen
`candidate-12-v2` snapshot, then compare periodic version-bounded cohorts.
Prefer small versioned adjustments over one-off retuning, and retain `current`
as the fail-closed rollback policy. No separate 20 USD observation budget is
reserved.

