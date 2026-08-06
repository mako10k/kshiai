# Plan-Basis Corrective Replay Decision Record

Status: decision recorded

Decision date: 2026-08-06

Plan task: `T_REPLAY_EVAL_DECISION`

Protocol: [battle-pipeline-plan-basis-replay-protocol.md](battle-pipeline-plan-basis-replay-protocol.md)

Raw evaluation: [battle-pipeline-plan-basis-corrective-replay-evaluation-v2-2026-08-06.json](evidence/battle-pipeline-plan-basis-corrective-replay-evaluation-v2-2026-08-06.json)

## 1. Decision

```text
Corrective replay result: revise
Structural plan-basis correction: effective on the frozen corpus
Integrated primary proxy set: not accepted
Runtime integration: not authorized
Objective battle-result correctness: not established
```

2件のplan-basis ref追加は、`interrupted_expanded_action`をinvalid planから期待したpartial receiptへ
変更し、registered behaviorを`6/7`から`7/7`へ改善した。対象外controlも`6/6`で一致した。

ただし、既存の`explicitConflictOrUnknownHandlingRate >= 1.00`は`0.857143`となった。protocolは
threshold、rubric、failed metricの事後変更を禁止しているため、behavior改善をもって全体を
`supported`へ読み替えない。最終decisionは`revise`で固定する。

## 2. Evidence basis

| Evidence | SHA-256 | Role |
|---|---|---|
| [Fixed corrective protocol](battle-pipeline-plan-basis-replay-protocol.md) | `6b98974e9c81cba6d16d2beaa7ce37aa17b5d267ff5b3efbb9b0b8ab99ca5f80` | immutable delta、threshold、rubric、stop condition |
| [Strict v2 delta](evidence/battle-pipeline-integrated-shadow-plan-basis-delta-v2.json) | `ada23e26a34ac5081a5a73c814e46d06c7203ec807fc0069469475a0f684d69e` | exact two-operation change |
| [Construction evidence](evidence/battle-pipeline-plan-basis-corrective-replay-construction-v2-2026-08-06.json) | `9582102ef5e282fcbc8b14a6ff8ee5c4d99fe9aed3a488d7dc684cb91b8827f5` | field delta、6 control parity、target receipt |
| [Raw 140-run evaluation](evidence/battle-pipeline-plan-basis-corrective-replay-evaluation-v2-2026-08-06.json) | `55f5312726c0c425f106f50a80d042d4424249a15e5b8dd36370561b8e313e73` | unchanged-rubric measurement and decision |

raw evaluationのcanonical content digestは
`524fad02bc27c9c87b1a2e62b238a79813d4d3e375dabcd38ad568a7ddc7074e`、
derived v2 content digestは
`dc1e0810c917bdb9605d8e1921d95b183e4e41d8b182810c6ba10ef1a715036d`である。

## 3. Confirmed results

| Gate | Result |
|---|---:|
| scenarios x repetitions | `7 x 20 = 140` |
| exact permitted field differences | `4/4` |
| unexpected field differences | `0` |
| normalized unaffected-control parity | `6/6` |
| registered behavior | `7/7` |
| schema validity | `1.00` |
| source mutation／authoritative change／canonical commit | `0 / 0 / 0` |
| observer leak／repair mutation／dangling ref／atomicity failure | `0 / 0 / 0 / 0` |
| dependency recall／component coverage | `1.00 / 1.00` |
| deterministic digest stability | `1.00` |
| local p95 | `28.94ms <= 50ms` |
| explicit conflict／unknown handling | `0.857143 < 1.00` |
| external LLM／XAI calls | `0 / 0` |

中断actionの20 receiptはすべて次と一致した。

```text
resolution: expanded
outcome: partial
completedSteps: [step.interrupted.approach]
failedStep: step.interrupted.strike
failureReason: precondition_failed
effects: [effect.interrupted.approached]
costs: [cost.interrupted.exposure]
fallbackFact: absent
patch: one assertion for input-fact.interrupted.approached
strike effect: absent
```

## 4. Newly exposed proxy conflict

確認できたstrict fieldは次である。

```text
interrupted expectedBoundaries.allowedFallbacks: non-empty
interrupted conflictHandling.required: true
interrupted adaptive outcome: partial
interrupted fallbackFactRefs: []
interrupted conflictedReadRefs: []
interrupted defense handling: false
interrupted conflictHandling.explicit: false
```

現行integrated receiptは`allowedFallbacks.length > 0`だけで`required=true`とし、fallback fact、
conflicted read、defenseのいずれかがある場合だけ`explicit=true`とする。今回の正常なpartial receiptは
fallbackを必要としなかったため、1 stratumの20 runすべてがproxy分子から外れた。

この結果から「実際のconflict／unknownを黙って処理した」とは確定できない。現在確定できるのは、
fallbackの許可、handlingの必要性、handlingの実施を現行contractが区別できず、plan-basis修正後に
proxyの適用条件が結果へ影響したことである。したがって、metric bugと断定して直すのではなく、
次gateで意味を事前固定する必要がある。

## 5. What remains supported

- exact two-ref deltaは期待した最長成立prefixを回復した。
- approach由来effectとexposure costは残り、strike／HP effectは生成されなかった。
- v1は不変で、derived v2はメモリ内だけに存在する。
- 6 control inputと正規化receiptは変化していない。
- authority、privacy、causal、temporal、determinismのhard boundaryは維持された。

これらは固定corpusにおけるstructural correctionの有効性であり、心理・経験の意味的grounding、
未知turn、runtime品質、最終戦闘結果の正しさを証明しない。

## 6. Selected follow-up boundary

候補となる次gateは`conflict-handling applicability contract`の限定PoCである。開始前に別planと
protocolを作り、少なくとも次のどちらを意味として採用するか固定する必要がある。

1. `allowedFallbacks`は能力の許可にすぎず、実際のconflict／unknownがないreceiptは
   `not_applicable`としてproxy分母から外す。
2. fallbackが許可されたproposalは、fallback不要で完了した場合も明示的な`not_needed` evidenceを
   receiptへ持ち、handling完了として数える。

どちらも現時点では未採用である。thresholdを`0.857143`へ下げる、対象stratumを除外する、
`explicit=true`を根拠なく強制する、または`revise`を`supported`へ読み替えることは許可しない。

## 7. Candidate point estimate

独立したperson-day実績がないため、velocityは`453p/128d`（約`3.539p/day`）のままとする。

| Candidate task | Points | Deliverable |
|---|---:|---|
| freeze applicability semantics | 1p | `required`／`not_applicable`／`not_needed` contract and fixtures |
| implement bounded receipt／metric correction | 1p | strict schema、regression、v1/v2 comparison |
| replay and decide under the fixed contract | 1p | 140-run evidence and decision |

候補全体は3p、約`0.848d`である。これはprovisional forecastであり、開始承認、runtime統合、release、
deploymentの権限ではない。

## 8. Decision lock

`T_REPLAY_EVAL_DECISION`完了時点のcorrective replay resultは`revise`である。structural plan-basis
correctionは限定的に有効だが、primary proxy setは未達である。新しいprotocolと明示的な計画変更が
ない限り、metric変更、runtime integration、persistence、provider-order change、release、deploymentへ
進まない。
