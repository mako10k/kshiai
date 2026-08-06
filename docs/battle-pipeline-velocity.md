# Battle Pipeline PoC Velocity

## Current forecast basis

- As of: 2026-08-06
- Point estimates: unchanged complexity units
- Previous smoothed velocity: 4.078125p/day
- Latest bounded World Process cycle: 3p completed in one workday
  - `T_WORLD_POC`: 2p
  - `T_WORLD_EVAL`: 1p
- Smoothing rule: 50% previous velocity + 50% latest-cycle velocity
- Current provisional velocity: `(4.078125 + 3) / 2 = 3.5390625p/day`
- PERT representation: `453p/128d`

The Projection revision, Patch, Issues, Read, Graph, Adaptive, and World Process
cycles each have explicit task and decision boundaries, but all were observed
on the same calendar date. The 3.5390625p/day value is therefore still
low-confidence and must not be interpreted as independently observed multi-day
throughput.

## Forecast

| Scope | Points | Forecast at 3.5390625p/day | Qualification |
|---|---:|---:|---|
| Completed World Process cycle | 3p | 1 observed day | supported for the frozen shadow mechanism |
| `T_SYNTHESIS` | 2p | 0.57 day | next separately authorized evidence synthesis |
| Remaining after World Process evaluation | 2p | 0.57 day | one conditional task |

Velocity changes calendar forecasts, not point estimates or evidence gates. A
faster implementation does not lower evaluation thresholds, automatically
unblock later tasks, or authorize runtime/persistence changes.

World Process construction and evaluation now form the latest completed cycle.
Its supported result changes the forecast but does not itself authorize or
start synthesis.

## Next recalibration

The remaining task is synthesis rather than another PoC/evaluation pair. Keep
the current velocity until a comparable bounded cycle is observed; do not
treat synthesis completion as an equivalent throughput sample.
