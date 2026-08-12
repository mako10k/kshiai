# Battle pacing candidate 12 v2

Status: production-trial candidate; not deployed or permanently adopted.

## Exact policy

| Parameter | Current | Candidate |
|---|---:|---:|
| Maximum turn | 20 | 12 |
| Global damage multiplier | 1.0 | 1.4 |
| Defending damage multiplier | 0.55 | 0.65 |
| Finisher unlock | 10 | 6 |
| Decisive pressure | turns 10–20 | turns 6–12 |
| Finisher maximum multiplier | 2.0 | 2.4 |
| Maximum critical chance | 0.40 | 0.50 |
| Critical damage multiplier | 1.5 | 1.5 |
| Decisive damage cap ratio | 0.26 | 0.32 |
| Repetition penalty starts | third repeat | fourth repeat |
| Repetition damage floor | 0.70 | 0.90 |
| Automatic restoration | 20% toward base | explicit effects only |
| Final winner | deterministic engine | deterministic engine |

The environment switch is `BATTLE_PACING_POLICY=candidate-12-v2`. Missing or
`current` preserves the rollback policy. Unknown values fail startup.

## Search result

The grid compared damage multipliers 1.2, 1.3, 1.4, and 1.5 with finisher
maximum multipliers 2.2, 2.4, and 2.6. At the primary fixed seed, damage 1.4
produced means 7.93–7.94; finisher multiplier had little effect in this fixture.
Damage 1.5 reduced the mean to about 7.4 and increased variance, so it was not
selected.

Five independent 240-battle synthetic runs for the selected candidate produced:

| Seed | Mean | Median | Min–max | P90 | Forced terminal | Turn 1–2 KO |
|---:|---:|---:|---:|---:|---:|---:|
| 9966112 | 7.9625 | 8 | 5–12 | 10 | 0% | 0% |
| 98 | 7.8167 | 8 | 5–12 | 10 | 0.42% | 0% |
| 20260812 | 7.9500 | 8 | 5–12 | 10 | 0% | 0% |
| 305419896 | 7.9875 | 8 | 5–11 | 10 | 0% | 0% |
| 3735928559 | 7.7250 | 8 | 5–12 | 10 | 0% | 0% |

Across these runs, delayed fixture effects resolved 100%. These results are
candidate-search evidence only; the harness does not model real LLM decisions,
speech, or the production character population.

## Production-trial boundary

Before deployment, the owner must accept the exact commit SHA, release path,
observation window, provider-cost ceiling, and rollback thresholds. Existing
battles retain their frozen policy. Only battles created with the candidate
environment value use v2.

Initial rollback triggers to review at the owner gate:

- any unexpected turn 1–2 KO attributable to the policy;
- forced-terminal rate materially above the accepted bound;
- error, latency, or LLM cost regression beyond the accepted bound;
- delayed effects systematically starved by earlier finishes;
- visible action/speech quality regression.
