# Normal observation advance bound repair after rc.9

Date: 2026-10-06. PERT: awareness-public-deploy; public-completion remains planned.

## Observations

- [Stage37405299375](https://github.com/mako10k/kshiai/actions/runs/37405299375), commit `fd9753d3a382ce3b85bfd57990a6619025b0cf45`, annotated `v0.23.0-rc.9` object `973c7cf64bd111528c089b0b0999f956cce0a7de`.
- API `kshiai-api-00174-fes` Ready, image `asia-northeast1-docker.pkg.dev/kshiai/kshiai/backend@sha256:4b205971d0ef13a0921c91de8a121c6150cd5cc913f112eec474176e4e49521d`. Existing publicAPI `kshiai-api-speech-9ce565d` retained100%; no promotion.
- Build/migration/boot/accounting/task/edge/auth/SSE checks passed. Actual observer `kshiai-persistent-e2e-qpvlj` exited1 at02:50:54Z with `Battle did not finish within 24 advances`.
- Exact battle `btl_d8b863802f25da550741bba041d30a18` remained active: tick23, publicturn8, incompleteReason null. This is failed observation evidence, not normal completion.
- SDK ledger read only with verified CA and explicit BEGIN READ ONLY:73rows completed after late calls settled. All48Luna responses finishReason stop. No invalidJSON/length or BATTLE_BUSY failure ended this observation.

| Role | Calls | Input tokens | Output tokens | Reported total tokens |
|---|---:|---:|---:|---:|
| creation | 1 | 1467 | 159 | 2122 |
| conscious | 15 | 68264 | 5060 | 91070 |
| subconscious | 48 | 281777 | 13783 | 295560 |
| narration | 1 | 5094 | 361 | 5455 |
| adjudication | 8 | 61353 | 240 | 64249 |

SDK-reported total: 458456. Use reported totals without inferring provider-specific token categories; cost remains unknown without verified pricing.

## Governing contract and producing condition

Accepted ADR0017 rules4/5/8 bind12publicturns, up to3beats perturn, HTTPadvance onebeat; turn-limit waits for lastbeat. Accepted ADR0054 retains36ticks/200physicalattempts. ADR0057 requires normal terminal rules and separately distinguishes36ticks and24publicadvances; it does not make24 a mandatory successful completion threshold.

The observed producing mismatch is the historical24HTTPadvance observation bound ending the driver before a full36combat-beat match can finish. Prologue uses tick0, combat uses combatTick+1. Oneprologue+36combat+oneaftermath fits a38-request observation allowance. The36tick protection itself rejects excess requests as incomplete; it does not produce a normal winner.

Smallest correction: derive normal observation default/strictupperbound as AwarenessNormalPolicy.maxTicks+2=38; align active Stage and Observe input default and upperbound, keep200physical/provider ceiling independent. Existing legacy provider projection1..30 and169default are not reinterpreted. Held stage-v3 workflows untouched. No normal policy, model, pacing, winner/terminal, narration, usage or incomplete acceptance change.

Alternatives:30still cannot cover36beats; reducingturns/raisingnormalpolicy changes owner behavior; forcingterminal/acceptingincomplete changes acceptance; earlyKO-only reruns do not remove the mismatch. Allowing38 does not promise completion if another model/deadline/budget gate fails.

Independent authority review confirms this is implementation conformance to Accepted turn/beat and normal completion contracts. Current phase: derived observation bound, strictvalidation and workflow consistency. Successor: immutable Stage then fresh public terminal/narration/ledger evidence. No localtest supplies that evidence.

[CLI reasoning](awareness-observation-advance-bound-repair-2026-10-06.think) audit fatal0/error0/warning0. Root preserves prior failedtags, all unrelatedWIP, actualwork intervals and ownerheldoldtrial. Verification pending implementation, regression, checks, CI and newStage.

Implementation review: no INSIDE findings; typed helper and matching activeworkflow bounds confirmed. Bothmodified testmodules carry responsibility comments. Workflowcontract tests are explicitly included in required test:awareness CI entry. Local fullbuild/workspace-and-deployment typecheck/staticchecks and sealed201tests passed; awareness289tests287passed2localPGskips and separateworkflow7passed. Combined required-entry run passed296tests294passed2explicitlocalPGskips0failed; actualPostgreSQL and immutableStage/public normal completion remain the evidence gates.
