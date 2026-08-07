# Battle pipeline actuals and Velocity ledger

Date: 2026-08-07 (Asia/Tokyo)

This file keeps measured execution and forecast updates separate from point
estimates in
[`battle-pipeline-work.pert`](battle-pipeline-work.pert).

## Measurement contract

- Estimate only in points. The bootstrap conversion is `1d = 1p`; points are
  relative size and are not hours or calendar days.
- Before work starts, commit the point estimate and current Velocity.
- At the real start, capture an exact fixed-offset timestamp and add a PERT
  `work_event start`. Commit that start event before implementation proceeds.
- At the real finish, add a separate `work_event finish` with the exact
  timestamp. Record active hours and person-hours when they are known.
- Express non-terminating hour values as exact rationals (for example,
  `827/3600`) rather than rounded decimals; perttool checks explicit active
  time against the event-derived interval exactly.
- Use suspend/resume events for genuine inactive intervals. Never edit a start
  or finish timestamp to make a forecast look accurate.
- Do not change the original estimate after start. Scope added after start is a
  new task or an explicitly recorded replan.
- After each finished task, aggregate the latest one to three conformant tasks,
  update the Velocity from the elapsed-throughput candidate, rerun the forecast,
  and append one Velocity row below.
- Preserve the measured sub-day resolution. If perttool returns an invalid
  `adoptable_velocity_token` but exposes a structured rational rate, serialize
  it losslessly as `NUMERATORp/DENOMINATORh`; never fall back to a day-rate or
  round the rational merely because the emitted token is malformed. This is
  tracked in perttool [#7](https://github.com/mako10k/perttool/issues/7).
- If evidence is incomplete, retain the current Velocity and record
  `unavailable`; do not manufacture an actual from Git timestamps or memory.

## Operational sequence

Use the timestamp captured at the actual boundary; perttool does not read the
clock automatically.

```bash
perttool task start docs/battle-pipeline-work.pert TASK_ID \
  --at 2026-08-07T11:00:00+09:00 --write
git add docs/battle-pipeline-work.pert
git commit -m "Start TASK_ID"

perttool task finish docs/battle-pipeline-work.pert TASK_ID \
  --at 2026-08-07T14:30:00+09:00 --active-time 3.5 --effort 3.5 --write
git add docs/battle-pipeline-work.pert
git commit -m "Finish TASK_ID"

perttool project observe-velocity docs/battle-pipeline-work.pert \
  --task TASK_ID --evidence all --format json
perttool project set docs/battle-pipeline-work.pert \
  --velocity ADOPTABLE_VELOCITY_TOKEN --write
perttool dag analyze docs/battle-pipeline-work.pert
```

For the second and later observations, pass the latest one to three completed
task IDs with repeated `--task`. Prefer the returned
`adoptable_velocity_token`; when it is not grammar-valid, losslessly normalize
the structured rational rate into the equivalent PERT velocity syntax. A
Velocity change and its forecast are committed with the ledger update after
review.

## Task actuals

Only conformant current-plan work events are aggregated. Old task timestamps
lack a committed start baseline and remain excluded.

| Task | Estimate | Started at | Finished at | Elapsed | Active | Effort | Disposition | Evidence commit |
|---|---:|---|---|---:|---:|---:|---|---|
| `T_BUILD_CAUSAL_TURN_SLICE` | 2p | 2026-08-07T11:23:39+09:00 | 2026-08-07T11:37:26+09:00 | 827s (`827/3600h`) | `827/3600h` | `827/3600ph` | complete: focused 7 tests, shared 184 tests, shared typecheck and build passed | start `21bc8c6`; implementation `3e26227`; finish `34bc4cd` |
| `T_WIRE_NARRATION_CONSUMER` | 1p | 2026-08-07T11:40:12+09:00 | 2026-08-07T11:47:05+09:00 | 413s (`413/3600h`) | `413/3600h` | `413/3600ph` | complete: focused 16 tests, root typecheck, backend typecheck and build passed | start `46a54cc`; implementation `3f71e72`; finish `e6bd6c5` |
| `T_ACCEPT_CAUSAL_SLICE` | 1p | 2026-08-07T11:48:05+09:00 | 2026-08-07T11:52:15+09:00 | 250s (`5/72h`) | `5/72h` | `5/72ph` | complete: focused 23 and full 305 tests, root typecheck and build, diff, call-authority and PERT checks passed | start `167e3fd`; finish `9b1f76a` |
| `T_TRY_AND_REVISE_STAGING` | 2p | 2026-08-07T11:53:29+09:00 | 2026-08-07T12:27:00+09:00 | 2011s (`2011/3600h`) | `2011/3600h` | `2011/3600ph` | complete: v0.7.2 staged with all smoke gates; exact-image off/guarded disposable battles compared; central causal consequence improved; no bounded revision selected; cleanup verified | start `8e5f525`; finish/evidence `e2e4c6e` |

## Velocity and forecast history

The original `1p/1d` value was a bootstrap only. The first measured row below
replaced it when a conformant task finished.

| Observed at | Included tasks | Completed points | Elapsed window | Candidate | Adopted Velocity | Remaining points | Forecast finish | Evidence commit |
|---|---|---:|---:|---|---|---:|---|---|
| 2026-08-07T11:10:08+09:00 | none | 0p | unavailable | unavailable: no current-plan completion | `1p/1d` bootstrap | 9p | 9d bootstrap | n/a: bootstrap |
| 2026-08-07T11:39:35+09:00 | `T_BUILD_CAUSAL_TURN_SLICE` | 2p | 827s | exact elapsed `7200/827p/1h`; token rejected by perttool [#7](https://github.com/mako10k/perttool/issues/7), so use available active-date candidate | `2p/1d` measured fallback | 7p | 3.5d | `34bc4cd` |
| 2026-08-07T11:47:31+09:00 | `T_BUILD_CAUSAL_TURN_SLICE`, `T_WIRE_NARRATION_CONSUMER` | 3p | 1406s | exact elapsed `5400/703p/1h`; same [#7](https://github.com/mako10k/perttool/issues/7) token limitation, so use available active-date candidate | `3p/1d` measured fallback | 6p | 2d | `e6bd6c5` |
| 2026-08-07T11:51:18+09:00 | `T_BUILD_CAUSAL_TURN_SLICE`, `T_WIRE_NARRATION_CONSUMER` | 3p | 1406s | structured rate `5400/703` point/hour; losslessly normalized to valid PERT syntax `5400p/703h` | `5400p/703h` exact elapsed-hour Velocity | 6p | `703/900h` (46m52s) | `e6bd6c5`; correction of the two day-rate fallbacks above |
| 2026-08-07T11:52:43+09:00 | `T_BUILD_CAUSAL_TURN_SLICE`, `T_WIRE_NARRATION_CONSUMER`, `T_ACCEPT_CAUSAL_SLICE` | 4p | 1716s (`143/300h`) | structured rate `1200/143` point/hour; losslessly normalized to valid PERT syntax `1200p/143h` | `1200p/143h` exact elapsed-hour Velocity | 5p | `143/240h` (35m45s) | `9b1f76a` |
| 2026-08-07T12:27:31+09:00 | `T_WIRE_NARRATION_CONSUMER`, `T_ACCEPT_CAUSAL_SLICE`, `T_TRY_AND_REVISE_STAGING` | 4p | 2808s (`39/50h`) | structured rate `200/39` point/hour; losslessly normalized to valid PERT syntax `200p/39h` | `200p/39h` exact elapsed-hour Velocity | 3p | `117/200h` (35m06s) | `e2e4c6e` |
