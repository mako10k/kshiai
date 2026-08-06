# Battle Pipeline PoC Velocity

## Current forecast basis

- As of: 2026-08-06
- Point estimates: unchanged complexity units
- Previous velocity: 1p/day
- Latest bounded cycle: 3p completed in one workday
  - `T_PROJECTION_REVISION_POC`: 2p
  - `T_PROJECTION_REVISION_EVAL`: 1p
- Smoothing rule: 50% previous velocity + 50% latest-cycle velocity
- Current provisional velocity: `(1 + 3) / 2 = 2p/day`

Only the latest revision cycle has a clear task and decision boundary. The
other tasks recorded on the same date include pre-existing planning and setup,
so treating all completed points as one-day throughput would overfit the
forecast. The 2p/day value is provisional and must be recalculated after the
Patch PoC evaluation.

## Forecast

| Scope | Points | Forecast at 2p/day | Qualification |
|---|---:|---:|---|
| `T_PATCH_POC` | 2p | 1 day | current implementation task |
| `T_PATCH_EVAL` | 1p | 0.5 day | separate frozen evaluation |
| Remaining before Patch PoC | 22p | 11 days | conditional on all decision locks opening |
| Remaining after Patch PoC | 20p | 10 days | conditional on Patch and later evidence |

Velocity changes calendar forecasts, not point estimates or evidence gates. A
faster implementation does not lower evaluation thresholds, automatically
unblock later tasks, or authorize runtime/persistence changes.

## Next recalibration

After `T_PATCH_EVAL`, compare the bounded Patch cycle's completed points with
its active workdays and update using the same 50% smoothing rule. If actual work
time remains unavailable or task boundaries changed materially, keep 2p/day
and label the forecast low-confidence rather than deriving a false precision.
