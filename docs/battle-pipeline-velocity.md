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
| `T_GRAPH_POC` | 2p | 0.86 day | blocked; requires separate authorization |
| `T_GRAPH_EVAL` | 2p | 0.86 day | conditional on Graph PoC construction |
| Remaining after Read revision evaluation | 14p | 6.05 days | conditional on all later decision locks opening |

Velocity changes calendar forecasts, not point estimates or evidence gates. A
faster implementation does not lower evaluation thresholds, automatically
unblock later tasks, or authorize runtime/persistence changes.

## Next recalibration

After the next explicitly authorized PoC and evaluation pair, compare its
completed points with active workdays and update using the same 50% smoothing
rule. If it remains on the same calendar date, retain the low-confidence label.
