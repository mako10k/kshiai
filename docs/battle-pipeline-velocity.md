# Battle Pipeline PoC Velocity

## Current forecast basis

- As of: 2026-08-06
- Point estimates: unchanged complexity units
- Previous smoothed velocity: 2.25p/day
- Latest bounded Read cycle: 3p completed in one workday
  - `T_READ_POC`: 2p
  - `T_READ_EVAL`: 1p
- Smoothing rule: 50% previous velocity + 50% latest-cycle velocity
- Current provisional velocity: `(2.25 + 3) / 2 = 2.625p/day`
- PERT representation: `21p/8d`

The Projection revision, Patch, Issues, and Read cycles each have explicit task
and decision boundaries, but all were observed on the same calendar date. The
2.625p/day value is therefore still low-confidence and must not be interpreted
as independently observed multi-day throughput.

## Forecast

| Scope | Points | Forecast at 2.625p/day | Qualification |
|---|---:|---:|---|
| `T_READ_REVISION_POC` | 1p | 0.38 day | next candidate; blocked pending explicit authorization |
| `T_READ_REVISION_EVAL` | 1p | 0.38 day | conditional on the revision PoC |
| Remaining after Read evaluation and replan | 16p | 6.10 days | conditional on all later decision locks opening |

Velocity changes calendar forecasts, not point estimates or evidence gates. A
faster implementation does not lower evaluation thresholds, automatically
unblock later tasks, or authorize runtime/persistence changes.

## Next recalibration

After the next explicitly authorized PoC and evaluation pair, compare its
completed points with active workdays and update using the same 50% smoothing
rule. If it remains on the same calendar date, retain the low-confidence label.
