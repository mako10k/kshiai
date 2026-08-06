# Battle Pipeline PoC Velocity

## Current forecast basis

- As of: 2026-08-06
- Point estimates: unchanged complexity units
- Previous smoothed velocity: 2p/day
- Latest bounded Patch cycle: 3p completed in one workday
  - `T_PATCH_POC`: 2p
  - `T_PATCH_EVAL`: 1p
- Smoothing rule: 50% previous velocity + 50% latest-cycle velocity
- Current provisional velocity: `(2 + 3) / 2 = 2.5p/day`
- PERT representation: `5p/2d`

The Projection revision cycle and Patch cycle each have explicit task and
decision boundaries, but both were observed on the same calendar date. The
2.5p/day value is therefore still low-confidence and must not be interpreted
as independently observed multi-day throughput.

## Forecast

| Scope | Points | Forecast at 2.5p/day | Qualification |
|---|---:|---:|---|
| `T_ISSUES_POC` | 1p | 0.4 day | next intervention; currently decision-locked |
| `T_ISSUES_EVAL` | 1p | 0.4 day | separate frozen evaluation |
| Remaining after Patch evaluation | 19p | 7.6 days | conditional on all later decision locks opening |

Velocity changes calendar forecasts, not point estimates or evidence gates. A
faster implementation does not lower evaluation thresholds, automatically
unblock later tasks, or authorize runtime/persistence changes.

## Next recalibration

After the next explicitly authorized PoC and evaluation pair, compare its
completed points with active workdays and update using the same 50% smoothing
rule. If it remains on the same calendar date, retain the low-confidence label.
