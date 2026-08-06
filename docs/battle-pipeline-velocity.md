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
| Completed `T_SYNTHESIS` | 2p | 0.57 day forecast, completion recorded separately | evidence synthesis; excluded from cycle velocity |
| Remaining planned PoC work in that plan | 0p | 0 days | no recommended task remains in that plan |

Velocity changes calendar forecasts, not point estimates or evidence gates. A
faster implementation does not lower evaluation thresholds, automatically
unblock later tasks, or authorize runtime/persistence changes.

World Process construction and evaluation remain the latest comparable bounded
cycle. Synthesis completion closes the current PoC evidence plan but does not
authorize the recommended integrated shadow-turn experiment, runtime changes,
persistence changes, release, or deployment.

## Next recalibration

Keep the current velocity until a comparable bounded implementation/evaluation
cycle is observed; do not treat synthesis completion as an equivalent
throughput sample.

## Integrated shadow decision update

The 9p integrated shadow plan reached its final decision milestone on
2026-08-06, but no independent person-day actual was recorded for that cycle.
The shared calendar date is not sufficient evidence that 9p was completed in
one workday, so the provisional velocity remains `453p/128d` rather than being
recalibrated from repository timestamps.

The decision record permits only a separately planned 3p versioned plan-basis
corrective replay. At the retained velocity its forecast is approximately
`0.848d`. This forecast does not authorize that plan, runtime wiring,
persistence, release, or deployment.

## Conflict-handling held-out generalization update

The additive applicability contract subsequently passed its fixed 3p cycle,
but that work still has no independently recorded person-day actual. The
provisional velocity therefore remains `453p/128d` (`3.5390625p/day`).

The separately bounded held-out generalization PoC is estimated at 4p:

| Task | Points | Forecast at 3.5390625p/day |
|---|---:|---:|
| Freeze held-out protocol | 1p | 0.283d |
| Build the literal corpus and integration controls | 2p | 0.565d |
| Run and decide the 720-run replay | 1p | 0.283d |
| Total | 4p | 1.130d |

After protocol completion, the remaining 3p forecast is approximately
`0.848d`. These values are planning forecasts, not elapsed-time actuals or
authority to change the classifier, connect runtime services, persist state,
release, or deploy.

## Actual-turn shadow-observation update

The held-out generalization plan completed without an independently recorded
person-day actual, so the provisional velocity remains `453p/128d`
(`3.5390625p/day`). Repository timestamps and work completed on the same
calendar date are not treated as throughput observations.

The separately bounded actual-turn read-only shadow-observation PoC is
estimated at 9p:

| Task | Points | Forecast at 3.5390625p/day |
|---|---:|---:|
| Freeze actual-turn observation semantics | 1p | 0.283d |
| Build the offline read-only observation adapter | 2p | 0.565d |
| Decide exact actual-turn capture authority | 1p | 0.283d |
| Capture the approved actual-turn sample | 2p | 0.565d |
| Evaluate observation effectiveness and distribution | 2p | 0.565d |
| Record observation limitations and next gate | 1p | 0.283d |
| Total | 9p | 2.543d |

After protocol completion, the remaining 8p forecast is approximately
`2.260d`. These are capacity forecasts only. They do not authorize a runtime
hook, DB or network access, an external LLM or XAI call, raw user-data capture,
canonical or persistence writes, classifier changes, release, or deployment.
