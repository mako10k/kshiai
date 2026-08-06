# Battle Pipeline PoC Velocity

## Current forecast basis

- As of: 2026-08-06
- Point estimates: unchanged complexity units
- Previous smoothed velocity: 2.3125p/day
- Latest bounded Graph cycle: 4p completed in one workday
  - `T_GRAPH_POC`: 2p
  - `T_GRAPH_EVAL`: 2p
- Smoothing rule: 50% previous velocity + 50% latest-cycle velocity
- Current provisional velocity: `(2.3125 + 4) / 2 = 3.15625p/day`
- PERT representation: `101p/32d`

The Projection revision, Patch, Issues, and Read cycles each have explicit task
and decision boundaries, but all were observed on the same calendar date. The
3.15625p/day value is therefore still low-confidence and must not be interpreted
as independently observed multi-day throughput.

## Forecast

| Scope | Points | Forecast at 3.15625p/day | Qualification |
|---|---:|---:|---|
| Completed Graph cycle | 4p | 1 observed day | supported for an in-memory derived view |
| `T_ADAPTIVE_POC` | 3p | 0.95 day | completed construction estimate |
| `T_ADAPTIVE_EVAL` | 2p | 0.63 day | next separate evaluation; not started |
| Remaining after Adaptive PoC | 7p | 2.22 days | conditional on Adaptive and later evidence |

Velocity changes calendar forecasts, not point estimates or evidence gates. A
faster implementation does not lower evaluation thresholds, automatically
unblock later tasks, or authorize runtime/persistence changes.

Adaptive construction completion alone does not update velocity. Recalibration
waits for the bounded Adaptive PoC plus evaluation cycle to finish.

## Next recalibration

After the next explicitly authorized PoC and evaluation pair, compare its
completed points with active workdays and update using the same 50% smoothing
rule. If it remains on the same calendar date, retain the low-confidence label.
