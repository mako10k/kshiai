# Battle Pipeline PoC Velocity

## Current forecast basis

- As of: 2026-08-06
- Point estimates: unchanged complexity units
- Previous smoothed velocity: 2.5p/day
- Latest bounded Issues cycle: 2p completed in one workday
  - `T_ISSUES_POC`: 1p
  - `T_ISSUES_EVAL`: 1p
- Smoothing rule: 50% previous velocity + 50% latest-cycle velocity
- Current provisional velocity: `(2.5 + 2) / 2 = 2.25p/day`
- PERT representation: `9p/4d`

The Projection revision, Patch, and Issues cycles each have explicit task and
decision boundaries, but all were observed on the same calendar date. The
2.25p/day value is therefore still low-confidence and must not be interpreted
as independently observed multi-day throughput.

## Forecast

| Scope | Points | Forecast at 2.25p/day | Qualification |
|---|---:|---:|---|
| `T_READ_POC` | 2p | 0.89 day | completed implementation estimate |
| `T_READ_EVAL` | 1p | 0.44 day | next separate evaluation; not started |
| Remaining after Read PoC | 15p | 6.67 days | conditional on all later decision locks opening |

Velocity changes calendar forecasts, not point estimates or evidence gates. A
faster implementation does not lower evaluation thresholds, automatically
unblock later tasks, or authorize runtime/persistence changes.

## Next recalibration

After the next explicitly authorized PoC and evaluation pair, compare its
completed points with active workdays and update using the same 50% smoothing
rule. If it remains on the same calendar date, retain the low-confidence label.
