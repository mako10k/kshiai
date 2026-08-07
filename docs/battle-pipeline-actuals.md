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

## Scope replan history

| Recorded at | Existing task | Added task | Point impact | Reason |
|---|---|---|---:|---|
| 2026-08-07T15:19:07+09:00 | `T_RUN_FIRST_PERSISTENT_E2E` remains 1p and was suspended | `T_BUILD_INTERNAL_OBSERVATION_SURFACE` 2p | target 14p -> 16p | The user added a separate internal API/Web viewer for raw battle logs and canonical-world progression before the production rerun. The original estimate and its 14:41:27 start remain unchanged. |
| 2026-08-07T16:46:08+09:00 | completed 16p causal/E2E observation sequence remains unchanged | `T_BUILD_AGENT_PIPELINE_DAG` 2p, `T_RESHAPE_NARRATOR_INPUT` 2p, `T_TRY_NARRATOR_INPUT_PIPELINE` 1p | target 16p -> 21p | The user requested per-turn Site A/Site B character context and output progression plus a DAG of pipeline inputs/outputs, and explicitly selected narrator-input improvement rather than stronger output guards. The new slice first makes the exact bounded inputs visible, then separates committed changes, current state, and static background before observation. |
| 2026-08-07T17:50:21+09:00 | completed 21p sequence and exact actuals remain unchanged | `T_STABILIZE_AGENT_ACTION_CONTRACT` 2p, `T_TRY_AGENT_ACTION_CONTRACT` 1p, `T_SELECT_FOLLOWING_PIPELINE_AXIS` 1p | target 21p -> 25p | The user made retained observation the ordering mechanism for axial pipeline renewal and deferred non-critical narrator-only work until pipeline maturity. The v0.10.0 baseline selects the action-proposal boundary first because 22 of 30 side-turn provider results were rejected; the following environment-process versus expanded-adjudication choice waits for the new production observation. Current measured Velocity `18000p/3263h` forecasts the remaining 4p as `3263/4500h` (43m30.4s). |
| 2026-08-07T18:41:45+09:00 | completed 25p sequence remains unchanged | `T_ALIGN_AGENT_ACTION_PROPOSAL_SHAPE` 1p, `T_TRY_ALIGNED_AGENT_ACTION_PROPOSALS` 1p | target 25p -> 27p | The v0.11.0 production trial removed provider-level rejection but all 15 invoked proposals were rejected as `schema_invalid`, directly preventing the new boundary from producing accepted actions and reducing the value of later environment/adjudication observations. Select one prompt-contract alignment and retry before choosing between those larger axes. Non-critical narrator repetition remains a downstream observation only. Current measured Velocity `2880p/563h` forecasts the remaining 2p as `563/1440h` (23m27.5s). |

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
| `T_RELEASE_PERSISTENT_E2E_REALM` | 1p | 2026-08-07T14:17:44+09:00 | 2026-08-07T14:38:38+09:00 | 1254s (`209/600h`) | `209/600h` | `209/600ph` | complete: feature PR #38 and release PR #39 passed four checks; annotated v0.8.0 resolves to main `001f928`; Stage run 31150701052 applied migration 0007 and passed all smokes; Promote run 31151087653 published the release and moved exact revision `kshiai-api-00032-giy` plus Worker `1a4431e2-0d79-4f62-ae11-bc8a07d7926d` to 100%; administrator email matched one production account; no post-promote Cloud Run errors observed | start included in #38; finish and readback in this commit; initial Stage run 31150428152 stopped before cloud auth because exact-main `validate` and `worker` checks were not yet complete |
| `T_BUILD_INTERNAL_OBSERVATION_SURFACE` | 2p | 2026-08-07T15:19:07+09:00 | 2026-08-07T15:54:18+09:00 | 2111s (`2111/3600h`) | `2111/3600h` | `2111/3600ph` | complete: durable DB observation receipt; role- and realm-gated internal API; separate unlinked Web viewer; per-turn canonical transition retention; 320 tests, typecheck, build and PERT checks; PR #41 and release PR #42 passed four checks; v0.9.0 Stage 31154719950 applied migration 0008 and passed all smokes; Promote 31155105595 published the release and moved exact revision `kshiai-api-00036-yew` plus Worker `7bb7bc30-d34a-4517-bed5-2b9ff0a29371` to 100%; production viewer returned 200 and unauthenticated API returned 401 | start/replan `38e1415`; release `bd27dfd`; finish and production readback in this commit |
| `T_RUN_FIRST_PERSISTENT_E2E` | 1p | 2026-08-07T14:41:27+09:00 | 2026-08-07T16:08:51+09:00 | 5244s (`437/300h`) | `3133/3600h` | `3133/3600ph` | complete: protected observer run 31155769295 and Cloud Run Job execution `kshiai-persistent-e2e-b44fx` succeeded; reused both synthetic accounts and all fixed fixtures; retained cross-account battle `btl_03da078a3011a53dbb5cde76`, sanitized DB observation and workflow receipt; E2E detail access read back 13 turn records and 12 canonical transitions; no general-realm leakage or post-release Cloud Run errors observed; surviving narration/canonical mismatch recorded as `OBS-20260807-03` without an interrupting patch | start before observation-surface scope addition; suspended for exactly 2111s while that separate 2p task shipped; workflow run 31155769295; finish and production readback in this closeout commit |
| `T_BUILD_AGENT_PIPELINE_DAG` | 2p | 2026-08-07T16:46:46+09:00 | 2026-08-07T16:55:06+09:00 | 500s (`5/36h`) | `5/36h` | `5/36ph` | complete: future turn records retain bounded Site A and Site B consumer input, provider disposition/output and accepted output plus narrator call input/provider/public output; internal API exposes trace capability; separate viewer renders the actual current-turn resolution -> canonical transition -> parallel agent context/output -> narrator input/output sequence and labels nextAction as following-turn intent; all 320 tests, root typecheck, build, deployment typecheck, diff and PERT checks passed | plan `889f881`; start `6a313b2`; implementation `a6ce4bf`; finish in this commit |
| `T_RESHAPE_NARRATOR_INPUT` | 2p | 2026-08-07T16:56:01+09:00 | 2026-08-07T17:07:42+09:00 | 701s (`701/3600h`) | `701/3600h` | `701/3600ph` | complete: narrator-model payload is one role-labelled turn brief; actions carry adjacent structured causality and human-readable resolution reasons; accepted semantic/world change is explicit; current state and static background are separate; duplicate outcome prose is removed; no claim validator, prose rejection, repair loop, retry policy, mechanical authority, or new output restriction was added; all 320 tests, root and deployment typecheck, production build, diff and PERT checks passed | start `679668b`; implementation `181ce3c`; finish in this commit |
| `T_TRY_NARRATOR_INPUT_PIPELINE` | 1p | 2026-08-07T17:08:53+09:00 | 2026-08-07T17:41:09+09:00 | 1936s (`121/225h`) | `121/225h` | `121/225ph` | complete: feature PR #44 and release PR #45 passed four checks; annotated v0.10.0 resolves to `8a35ee0`; Stage 31160973729 and Promote 31161359156 moved exact revision `kshiai-api-00038-xed` and Worker `8268dc74-9526-4f16-80a0-3a9cc6349ac3` to production; persistent E2E 31161541235 retained battle `btl_19dcf0ea770b6263943c2703`; all 15 agent traces, 14 narrator traces and 14 canonical transitions were read back; partially improved causal narration plus surviving input/canonical ambiguity and character-agent rejection phenomena were recorded without a guard patch | release tag and workflows are external receipts; finish and production observation recorded in this commit; perttool issue [#8](https://github.com/mako10k/perttool/issues/8) records that observe-velocity reads HEAD instead of this just-written finish |
| `T_STABILIZE_AGENT_ACTION_CONTRACT` | 2p | 2026-08-07T17:54:50+09:00 | 2026-08-07T18:04:58+09:00 | 608s (`38/225h`) | `38/225h` | `38/225ph` | complete: model action proposal is retained separately from server validation and the accepted following-turn action; invalid proposals no longer turn valid character state and speech into provider failures; bounded rejection receipts cover schema, availability, finisher, affordance, instrument and required-change cases and are visible in the internal DAG; focused 26 and full 322 tests, root/deployment typecheck and production build passed | start `02c2db6`; implementation `a6df24a`; finish in this commit |
| `T_TRY_AGENT_ACTION_CONTRACT` | 1p | 2026-08-07T18:29:26+09:00 | 2026-08-07T18:39:25+09:00 | 599s (`599/3600h`) | `599/3600h` | `599/3600ph` | complete: release PR #49 and annotated v0.11.0 resolved to `54c9d19c`; Stage run 31165178053 attempt 2 passed after one bounded retry of Cloudflare error 10013; Promote 31166109223 moved exact revision `kshiai-api-00041-huf` and Worker `cee5a0bd-7825-4ffb-a0d0-4f8821104074` to 100%; E2E 31166408488 retained battle `btl_442a384a57ea0952f0d215d4`; all 15 invoked agent lanes were provider-fulfilled with accepted state and speech, but all 15 action proposals were schema-invalid and no following-turn action was accepted | PERT start captured before Promote; exact workflow and production readbacks; finish in this ops branch |
| `T_SELECT_FOLLOWING_PIPELINE_AXIS` | 1p | 2026-08-07T18:39:54+09:00 | 2026-08-07T18:41:45+09:00 | 111s (`37/1200h`) | `37/1200h` | `37/1200ph` | complete: selected a 1p action-kind-specific proposal prompt alignment plus a 1p production E2E retry ahead of environment world-process or expanded adjudication; the selection is based on the 15/15 reproducible schema-invalid receipt distribution and its direct obstruction of accepted-action observation | start and finish in this ops branch; retained battle and trace readback |
| `T_ALIGN_AGENT_ACTION_PROPOSAL_SHAPE` | 1p | 2026-08-07T18:43:41+09:00 | 2026-08-07T18:45:50+09:00 | 129s (`43/1200h`) | `43/1200h` | `43/1200ph` | complete: character-agent prompt now presents six action-kind-specific proposal shapes and explicitly confines explanation and subject fields to free action; server validation receipt mechanical authority and narrator policy remain unchanged; focused 1 and full 323 tests, root typecheck and production build passed | start `776750b`; implementation `5e2265e`; finish in this commit |

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
| 2026-08-07T14:39:45+09:00 | `T_CHOOSE_NEXT_PIPELINE_AXIS`, `T_BUILD_PERSISTENT_E2E_REALM`, `T_RELEASE_PERSISTENT_E2E_REALM` | 5p | 2562s (`427/600h`) | structured rate `3000/427` point/hour; losslessly normalized from perttool's non-grammar token to `3000p/427h` | `3000p/427h` exact elapsed-hour Velocity | 1p | `427/3000h` (8m32.4s) | release finish `8d8fab5`; Velocity update in this commit |
| 2026-08-07T15:56:02+09:00 | `T_BUILD_PERSISTENT_E2E_REALM`, `T_RELEASE_PERSISTENT_E2E_REALM`, `T_BUILD_INTERNAL_OBSERVATION_SURFACE` | 6p | 6978s (`1163/600h`) | structured rate `3600/1163` point/hour; losslessly normalized from perttool's non-grammar token to `3600p/1163h` | `3600p/1163h` exact elapsed-hour Velocity | 1p | `1163/3600h` (19m23s) | finish/release readback `d526afc`; Velocity update in this commit |
| 2026-08-07T16:09:52+09:00 | `T_RELEASE_PERSISTENT_E2E_REALM`, `T_BUILD_INTERNAL_OBSERVATION_SURFACE`, `T_RUN_FIRST_PERSISTENT_E2E` | 4p | 6667s (`6667/3600h`) | structured rate `14400/6667` point/hour; losslessly normalized from perttool's non-grammar token to `14400p/6667h` | `14400p/6667h` exact elapsed-hour Velocity | 0p | complete (`0h`) | E2E finish `7c0f756`; Velocity update in this commit |
| 2026-08-07T16:55:40+09:00 | `T_BUILD_INTERNAL_OBSERVATION_SURFACE`, `T_RUN_FIRST_PERSISTENT_E2E`, `T_BUILD_AGENT_PIPELINE_DAG` | 5p | 8019s (`891/400h`) | structured rate `2000/891` point/hour; losslessly normalized from perttool's non-grammar token to `2000p/891h` | `2000p/891h` exact elapsed-hour Velocity | 3p | `2673/2000h` (1h20m11.4s) | DAG finish `6cdb6da`; Velocity update in this commit |
| 2026-08-07T17:08:37+09:00 | `T_RUN_FIRST_PERSISTENT_E2E`, `T_BUILD_AGENT_PIPELINE_DAG`, `T_RESHAPE_NARRATOR_INPUT` | 5p | 8775s (`39/16h`) | structured rate `80/39` point/hour; losslessly normalized from perttool's non-grammar token to `80p/39h` | `80p/39h` exact elapsed-hour Velocity | 1p | `39/80h` (29m15s) | narrator-input finish `fc5487b`; Velocity update in this commit |
| 2026-08-07T17:43:53+09:00 | `T_BUILD_AGENT_PIPELINE_DAG`, `T_RESHAPE_NARRATOR_INPUT`, `T_TRY_NARRATOR_INPUT_PIPELINE` | 5p | 3263s (`3263/3600h`) | perttool structured rate `18000/3263` point/hour; losslessly normalized from `18000/3263p/1h` to valid PERT syntax `18000p/3263h` | `18000p/3263h` exact elapsed-hour Velocity | 0p | complete (`0h`) | trial finish `bbadbea`; intermediate commit required by perttool [#8](https://github.com/mako10k/perttool/issues/8); Velocity update in this commit |
| 2026-08-07T18:05:59+09:00 | `T_RESHAPE_NARRATOR_INPUT`, `T_TRY_NARRATOR_INPUT_PIPELINE`, `T_STABILIZE_AGENT_ACTION_CONTRACT` | 5p | 4137s (`1379/1200h`) | perttool structured rate `6000/1379` point/hour; losslessly normalized from `6000/1379p/1h` to valid PERT syntax `6000p/1379h` | `6000p/1379h` exact elapsed-hour Velocity | 2p | `1379/3000h` (27m34.8s) | finish `5ed7ec8`; Velocity update in this commit |
| 2026-08-07T18:39:25+09:00 | `T_TRY_NARRATOR_INPUT_PIPELINE`, `T_STABILIZE_AGENT_ACTION_CONTRACT`, `T_TRY_AGENT_ACTION_CONTRACT` | 4p | 5432s (`679/450h`) | exact elapsed observation-window rate `1800/679` point/hour; normalized to valid PERT syntax `1800p/679h` | `1800p/679h` exact elapsed-hour Velocity | 1p before the observation-driven replan | `679/1800h` (22m38s) | v0.11.0 Stage, Promote and E2E workflow receipts; PERT finish in this ops branch |
| 2026-08-07T18:41:45+09:00 | `T_STABILIZE_AGENT_ACTION_CONTRACT`, `T_TRY_AGENT_ACTION_CONTRACT`, `T_SELECT_FOLLOWING_PIPELINE_AXIS` | 4p | 2815s (`563/720h`) | perttool structured rate `2880/563` point/hour; losslessly normalized from `2880/563p/1h` to valid PERT syntax `2880p/563h` | `2880p/563h` exact elapsed-hour Velocity | 2p after the observation-driven replan | `563/1440h` (23m27.5s) | retained v0.11.0 battle/trace; selection finish commit `29e6e1a`; Velocity update in the following commit |
