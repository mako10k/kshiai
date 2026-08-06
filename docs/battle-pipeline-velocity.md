# Battle Pipeline PoC Velocity

## Current forecast basis

- As of: 2026-08-06
- Point estimates: unchanged complexity units
- Previous smoothed velocity: 3.15625p/day
- Latest bounded Adaptive cycle: 5p completed in one workday
  - `T_ADAPTIVE_POC`: 3p
  - `T_ADAPTIVE_EVAL`: 2p
- Smoothing rule: 50% previous velocity + 50% latest-cycle velocity
- Current provisional velocity: `(3.15625 + 5) / 2 = 4.078125p/day`
- PERT representation: `261p/64d`

The Projection revision, Patch, Issues, Read, Graph, and Adaptive cycles each
have explicit task and decision boundaries, but all were observed on the same
calendar date. The 4.078125p/day value is therefore still low-confidence and
must not be interpreted as independently observed multi-day throughput.

## Forecast

| Scope | Points | Forecast at 4.078125p/day | Qualification |
|---|---:|---:|---|
| Completed Adaptive cycle | 5p | 1 observed day | supported for the frozen shadow mechanism |
| `T_WORLD_POC` | 2p | 0.49 day | blocked pending explicit continuation |
| `T_WORLD_EVAL` | 1p | 0.25 day | conditional on World Process PoC |
| `T_SYNTHESIS` | 2p | 0.49 day | conditional on World Process evaluation |
| Remaining after Adaptive evaluation | 5p | 1.23 days | conditional on later decision locks |

Velocity changes calendar forecasts, not point estimates or evidence gates. A
faster implementation does not lower evaluation thresholds, automatically
unblock later tasks, or authorize runtime/persistence changes.

Adaptive construction and evaluation now form the latest completed cycle. Its
supported result changes the forecast but does not itself unblock World Process.

## Next recalibration

After the next explicitly authorized PoC and evaluation pair, compare its
completed points with active workdays and update using the same 50% smoothing
rule. If same-date cycles continue, retain the low-confidence label and avoid
treating intra-day task throughput as independent calendar evidence.
