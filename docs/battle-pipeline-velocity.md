# Battle Pipeline PoC Velocity

## Current forecast basis

- As of: 2026-08-06
- Point estimates: unchanged complexity units
- Previous smoothed velocity: 2.625p/day
- Latest bounded Read revision cycle: 2p completed in one workday
  - `T_READ_REVISION_POC`: 1p
  - `T_READ_REVISION_EVAL`: 1p
- Smoothing rule: 50% previous velocity + 50% latest-cycle velocity
- Current provisional velocity: `(2.625 + 2) / 2 = 2.3125p/day`
- PERT representation: `37p/16d`

The Projection revision, Patch, Issues, and Read cycles each have explicit task
and decision boundaries, but all were observed on the same calendar date. The
2.3125p/day value is therefore still low-confidence and must not be interpreted
as independently observed multi-day throughput.

## Forecast

| Scope | Points | Forecast at 2.3125p/day | Qualification |
|---|---:|---:|---|
| `T_GRAPH_POC` | 2p | 0.86 day | completed construction estimate |
| `T_GRAPH_EVAL` | 2p | 0.86 day | next separate evaluation; not started |
| Remaining after Graph PoC | 12p | 5.19 days | conditional on Graph and later evidence |

Velocity changes calendar forecasts, not point estimates or evidence gates. A
faster implementation does not lower evaluation thresholds, automatically
unblock later tasks, or authorize runtime/persistence changes.

## Next recalibration

After `T_GRAPH_EVAL`, compare the bounded 4p Graph cycle with its active
workdays and update using the same 50% smoothing rule. If it remains on the
same calendar date, retain the low-confidence label.
