# Battle pipeline actuals and Velocity ledger

Date: 2026-08-07 (Asia/Tokyo)

This file keeps measured execution and forecast updates separate from point
estimates in
[`battle-pipeline-execution.pert`](battle-pipeline-execution.pert).

## Measurement contract

- Estimate only in points. The bootstrap conversion is `1d = 1p`; points are
  relative size and are not hours or calendar days.
- Before work starts, commit the point estimate and current Velocity.
- At the real start, capture an exact fixed-offset timestamp and add a PERT
  `work_event start`. Commit that start event before implementation proceeds.
- At the real finish, add a separate `work_event finish` with the exact
  timestamp. Record active hours and person-hours when they are known.
- Use suspend/resume events for genuine inactive intervals. Never edit a start
  or finish timestamp to make a forecast look accurate.
- Do not change the original estimate after start. Scope added after start is a
  new task or an explicitly recorded replan.
- After each finished task, aggregate the latest one to three conformant tasks,
  update the Velocity when perttool returns an adoptable elapsed-throughput
  candidate, rerun the forecast, and append one Velocity row below.
- If evidence is incomplete, retain the current Velocity and record
  `unavailable`; do not manufacture an actual from Git timestamps or memory.

## Operational sequence

Use the timestamp captured at the actual boundary; perttool does not read the
clock automatically.

```bash
perttool task start docs/battle-pipeline-execution.pert TASK_ID \
  --at 2026-08-07T11:00:00+09:00 --write
git add docs/battle-pipeline-execution.pert
git commit -m "Start TASK_ID"

perttool task finish docs/battle-pipeline-execution.pert TASK_ID \
  --at 2026-08-07T14:30:00+09:00 --active-time 3.5 --effort 3.5 --write
git add docs/battle-pipeline-execution.pert
git commit -m "Finish TASK_ID"

perttool project observe-velocity docs/battle-pipeline-execution.pert \
  --task TASK_ID --evidence all --format json
perttool project set docs/battle-pipeline-execution.pert \
  --velocity ADOPTABLE_VELOCITY_TOKEN --write
perttool dag analyze docs/battle-pipeline-execution.pert
```

For the second and later observations, pass the latest one to three completed
task IDs with repeated `--task`. The exact returned `adoptable_velocity_token`
is copied without rounding. A Velocity change and its forecast are committed
with the ledger update after review.

## Task actuals

No task in the current causal-slice plan has started. Old task timestamps lack
a conformant committed start baseline and are not used for this Velocity.

| Task | Estimate | Started at | Finished at | Elapsed | Active | Effort | Disposition | Evidence commit |
|---|---:|---|---|---:|---:|---:|---|---|

## Velocity and forecast history

The current `1p/1d` value is a bootstrap only. The first measured row replaces
it when a conformant task finishes.

| Observed at | Included tasks | Completed points | Elapsed window | Candidate | Adopted Velocity | Remaining points | Forecast finish | Evidence commit |
|---|---|---:|---:|---|---|---:|---|---|
| 2026-08-07T11:10:08+09:00 | none | 0p | unavailable | unavailable: no current-plan completion | `1p/1d` bootstrap | 9p | 9d bootstrap | n/a: bootstrap |
