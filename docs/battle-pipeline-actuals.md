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
  `work_event start`. Commit that start event before implementation proceeds
  when the work can safely pause. For an already-dispatched production workflow,
  do not pause or mutate the release merely to create a Git baseline: retain the
  pre-dispatch local timestamp, record the closeout immediately, and corroborate
  both boundaries with the immutable remote run timestamps.
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
  An exact locally captured dispatch boundary plus an immutable workflow
  created/completed readback is operational evidence, but must be labeled as a
  late-recorded closeout when its PERT events were committed together.

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

Only exact current-plan work events are aggregated. Old task timestamps that
lack both a captured boundary and independent readback remain excluded.

| Task | Estimate | Started at | Finished at | Elapsed | Active | Effort | Disposition | Evidence commit |
|---|---:|---|---|---:|---:|---:|---|---|
| `T_BUILD_CAUSAL_TURN_SLICE` | 2p | 2026-08-07T11:23:39+09:00 | 2026-08-07T11:37:26+09:00 | 827s (`827/3600h`) | `827/3600h` | `827/3600ph` | complete: focused 7 tests, shared 184 tests, shared typecheck and build passed | start `21bc8c6`; implementation `3e26227`; finish `34bc4cd` |
| `T_WIRE_NARRATION_CONSUMER` | 1p | 2026-08-07T11:40:12+09:00 | 2026-08-07T11:47:05+09:00 | 413s (`413/3600h`) | `413/3600h` | `413/3600ph` | complete: focused 16 tests, root typecheck, backend typecheck and build passed | start `46a54cc`; implementation `3f71e72`; finish `e6bd6c5` |
| `T_ACCEPT_CAUSAL_SLICE` | 1p | 2026-08-07T11:48:05+09:00 | 2026-08-07T11:52:15+09:00 | 250s (`5/72h`) | `5/72h` | `5/72ph` | complete: focused 23 and full 305 tests, root typecheck and build, diff, call-authority and PERT checks passed | start `167e3fd`; finish `9b1f76a` |
| `T_TRY_AND_REVISE_STAGING` | 2p | 2026-08-07T11:53:29+09:00 | 2026-08-07T12:27:00+09:00 | 2011s (`2011/3600h`) | `2011/3600h` | `2011/3600ph` | complete: v0.7.2 staged with all smoke gates; exact-image off/guarded disposable battles compared; central causal consequence improved; no bounded revision selected; cleanup verified | start `8e5f525`; finish/evidence `e2e4c6e` |
| `T_DECIDE_PRODUCTION_TRIAL` | 1p | 2026-08-07T13:33:20+09:00 | 2026-08-07T13:33:40+09:00 | 20s (`1/180h`) | `1/180h` | `1/180ph` | complete: owner approved exact v0.7.2 guarded artifacts at 100% for the current single-user cohort; no cohort splitter | exact local decision/pre-dispatch capture; closeout recorded in this ops PR |
| `T_TRY_GUARDED_PRODUCTION` | 1p | 2026-08-07T13:33:40+09:00 | 2026-08-07T13:36:40+09:00 | 180s (`1/20h`) | `1/20h` | `1/20ph` | complete: protected Promote run 31147799943 passed artifact checks, backend/Worker 100% promotion, production/auth smoke and release publication; Cloud Run mode and errors read back | exact local pre-dispatch/readback captures corroborated by GitHub run 04:33:41Z–04:35:48Z; closeout recorded in this ops PR |
| `T_CHOOSE_NEXT_PIPELINE_AXIS` | 1p | 2026-08-07T13:55:56+09:00 | 2026-08-07T13:56:16+09:00 | 20s (`1/180h`) | `1/180h` | `1/180ph` | complete: selected a persistent isolated E2E realm with reusable Codex observer/opponent accounts, fixtures and retained battle artifacts before the next mechanics axis | start `109457d`; finish and replan in this commit |
| `T_BUILD_PERSISTENT_E2E_REALM` | 3p | 2026-08-07T13:58:00+09:00 | 2026-08-07T14:16:13+09:00 | 1093s (`1093/3600h`) | `1093/3600h` | `1093/3600ph` | complete: additive account realm migration; character, field, narrator and rating isolation; persistent two-account fixture reuse; cross-account production SSE observer; protected workflow and administrator binding; focused 15 and full 315 tests, typecheck and build passed | start `7d4ee1d`; implementation and finish in this commit |

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
| 2026-08-07T13:36:40+09:00 | `T_TRY_AND_REVISE_STAGING`, `T_DECIDE_PRODUCTION_TRIAL`, `T_TRY_GUARDED_PRODUCTION` | 4p | 6191s (`6191/3600h`) | exact captured window rate `14400/6191` point/hour; normalized to valid PERT syntax `14400p/6191h`; the two production events are late-recorded together and independently corroborated by run 31147799943 | `14400p/6191h` exact elapsed-hour Velocity | 1p | `6191/14400h` (`6191/4s`, 25m47.75s) | this ops PR and workflow run 31147799943 |
| 2026-08-07T13:56:16+09:00 | `T_DECIDE_PRODUCTION_TRIAL`, `T_TRY_GUARDED_PRODUCTION`, `T_CHOOSE_NEXT_PIPELINE_AXIS` | 3p | 1376s (`86/225h`) | exact event-window rate `675/86` point/hour; normalized to valid PERT syntax `675p/86h` | `675p/86h` exact elapsed-hour Velocity | 5p after the accepted E2E realm replan | `86/135h` (38m13.33s) | start baseline `109457d`; production run 31147799943; this replan commit |
| 2026-08-07T14:17:20+09:00 | `T_TRY_GUARDED_PRODUCTION`, `T_CHOOSE_NEXT_PIPELINE_AXIS`, `T_BUILD_PERSISTENT_E2E_REALM` | 5p | 2553s (`851/1200h`) | structured rate `6000/851` point/hour; losslessly normalized from perttool's non-grammar token to `6000p/851h` | `6000p/851h` exact elapsed-hour Velocity | 2p | `851/3000h` (17m01.2s) | implementation and finish `1b09276`; Velocity update in this commit |
