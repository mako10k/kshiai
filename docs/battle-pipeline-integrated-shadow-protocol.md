# Integrated Shadow Turn PoC Protocol

Status: protocol fixed; transcript capture not started  
Fixed on: 2026-08-06  
Source synthesis: [battle-pipeline-poc-synthesis.md](battle-pipeline-poc-synthesis.md)  
Plan: [battle-pipeline-integrated-shadow.pert](battle-pipeline-integrated-shadow.pert)

## 1. Decision boundary

このPoCは、既存のauthoritative battle resultを変更せず、既存の各shadow PoCを一つの
turn receiptへ連結できるかを評価する。

```text
Fixed turn transcript
  -> compact Observation / Adjudication / Consistency slices
  -> derived Canonical Graph view
  -> Adaptive and World proposals in one temporal window
  -> bounded Patch / Issue / Read-coherence previews
  -> Integrated Shadow Turn Receipt
```

このprotocolが許可するのはlocal fixtureとshadow計算だけである。runtime service wiring、
provider順変更、canonical commit、BattleState mutation、DB migration、release、deploymentは
許可しない。

## 2. Hypotheses and non-claims

### Primary hypothesis

現在supportedとなっている限定PoCを同じ固定turn上で連結しても、observer privacy、
authority、因果参照、同時時間窓、budget degradationを維持し、authoritative outcomeへ
干渉しない統合receiptを生成できる。

### Secondary hypotheses

- compact sliceは、統合後も決定に必要なdependencyを欠落させない。
- component間のreferenceはdanglingせず、effectからsource proposal／process／factへ辿れる。
- conflictがあるcaseは、既知issue、repair refusal、またはunknown fallbackとして明示される。
- deterministic caseではexternal LLM callを追加せず、call／token要求をreceiptで測定できる。

### Non-claims

- 最終戦闘結果の客観的正しさ
- 世界全体の無矛盾性
- 通常turnのlive 4-callから3-callへの削減
- LLM生成planまたはworld concretizationの品質
- production latency、cost、concurrency、persistence safety

## 3. Frozen transcript contract

次task `T_TRANSCRIPT_BASELINE` は、同じversionのJSON artifactとして次を固定する。

| Field | Requirement |
|---|---|
| `sourceBattleState` | turn実行前のschema-valid BattleState |
| `authoritativeResult` | 現行resolverが生成したactions、events、mechanical evidence、after-state digest |
| `characterInputs` | A／Bの固定coarse proposalと、caseで必要な場合だけ固定plan |
| `worldInputs` | active process、trigger fact、concretization。非該当caseは空配列 |
| `expectedDependencies` | sliceに必要なentity／fact／rule／process refs |
| `expectedBoundaries` | 禁止identifier、mutation禁止、commit禁止、許容fallback |
| `callModel` | current authoritative callsとshadow追加要求を別々に記録 |
| `provenance` | source artifact、git SHA、evaluator SHA、artifact SHA-256 |

artifactは生成後に上書きしない。contractまたはscenarioを変える場合はversionを上げ、旧版を
比較証拠として残す。

## 4. Scenario strata

最低7 caseを固定する。既存baselineと各component fixtureから再構成するが、期待出力を
component aggregateから推測せず、現行resolverを再実行してauthoritative controlを得る。

| Stratum | Required behavior |
|---|---|
| ordinary fast action | fast path、mechanical Patch、観測slice、結果非干渉 |
| remote rejection | reachability rule、fallback、遠隔damage不発生 |
| simultaneous terminal action | 同一snapshot、atomic temporal bucket、相討ち保持 |
| interrupted expanded action | 最長成立prefix、実行由来cost、後続step未実行 |
| active world process | character proposalとの共通時間窓、process causal link |
| blocking local conflict | issue接続、causal-first repairまたはunknown、範囲外mutation禁止 |
| exhausted budget | 詳細化からweak／unknownへの縮退、勝敗の強制確定禁止 |

train／tune用caseは置かない。threshold確定後に全caseを一度だけprimary evaluationへ使う。
実装中のregression testで同じfixtureを読むことは許すが、評価閾値を結果に合わせて変更しない。

## 5. Integrated receipt requirements

receiptは少なくとも次を保持する。

- transcript refとsource／authoritative outcome digest
- A／B ObservationSlice、AdjudicationSlice、ConsistencySliceのdigestとsize
- derived graph query receipt
- temporal window上のcharacter／world proposal refs
- adaptive／world execution receipt
- Patch audit、ConsistencyIssue、Read-coherence previewのrefs
- effectからproposal／process／factへのcausal trace
- calls、tokens、latency、truncation、unknown fallbackの計測値
- componentごとのschema validation結果
- `sourceMutated=false`
- `authoritativeOutcomeChanged=false`
- `canonicalCommitPerformed=false`

receiptは完成後の世界全体を返さず、既存authoritative resultをshadow resultで置き換えない。

## 6. Metrics and pre-registered thresholds

### Hard invariants

一件でも失敗した場合はproxyで相殺せず、decisionを`unsupported`または原因が限定できる場合の
`revise`とする。

| Metric | Threshold |
|---|---:|
| schema validity | `1.00` |
| source mutation | `0` |
| authoritative outcome change | `0` |
| canonical commit | `0` |
| observer canonical-ID leakage | `0` |
| out-of-scope repair mutation | `0` |
| dangling causal／component ref | `0` |
| temporal atomicity failure | `0` |

### Primary proxies

| Metric | Supported threshold |
|---|---:|
| expected dependency recall | `1.00` |
| component receipt coverage | `1.00` |
| explicit conflict／unknown handling | `1.00` |
| deterministic outcome digest stability | `1 distinct digest per case over 20 runs` |
| integrated local p95 | `<= 50ms` on the evaluation machine |

slice bytes、combined receipt bytes、projected calls、tokensは必ず報告するが、この初回PoCでは
単独の合否閾値にしない。通常turn 3-call化はlive wiringなしでは`indeterminate`のままとする。

## 7. Decision rubric

| Label | Meaning |
|---|---|
| `supported` | hard invariantが全passし、全primary proxyが閾値を満たす |
| `revise` | boundedな原因と再検証可能な限定修正仮説がある |
| `unsupported` | genuine authority／privacy／causal failure、または統合効果がない |
| `indeterminate` | fixture、measurement、sample、またはcomponent境界が不足する |

`revise`、`unsupported`、`indeterminate`を成功へ読み替えない。評価前にproduction統合計画を
作らず、結果に応じて次gateを別途決める。

## 8. Execution milestones

| Task | Points | Deliverable |
|---|---:|---|
| `T_SHADOW_PROTOCOL` | 1p | このprotocolとassured PERT |
| `T_TRANSCRIPT_BASELINE` | 2p | versioned transcript corpus、capture harness、baseline receipt |
| `T_INTEGRATED_RECEIPT_POC` | 3p | shared-only integrated shadow receiptとregression tests |
| `T_INTEGRATED_RECEIPT_EVAL` | 2p | 20-run raw evidence、threshold判定、必要時blind review |
| `T_SHADOW_DECISION` | 1p | limitation、interaction effect、次gateのdecision record |

合計は9p。現在のprovisional velocity `453p/128d`では約2.54日だが、同日内のPoC cycleから
得た低信頼推定であり、deadlineまたは実績時間として扱わない。

## 9. Protocol acceptance checks

- hypothesis、non-claim、authority boundaryが明記されている。
- transcript contractがbefore／authoritative after／proposal／world／dependencyを分離する。
- hard invariantとproxyを分離し、閾値がartifact生成前に固定されている。
- call／token計測がcurrent authoritative pathとshadow要求を混同しない。
- `unknown`と未測定live 3-call化をpassへ読み替えない。
- PERTはGrammar 6／CLI Contract 7でwarning-freeであり、current taskはassurance
  verified、未開始の後続taskはaccepted basisを持つconditionalである。

## 10. Completion receipt

- `T_SHADOW_PROTOCOL`: conformant
- PERT format／check／DAG／Plan Assurance: diagnostic `0`
- Plan Assurance: `T_SHADOW_PROTOCOL`と次の`T_TRANSCRIPT_BASELINE`がverified、後続3 taskは
  accepted basisを持つconditional
- Full repository tests: `349/349 pass`（shared 225、backend 108、frontend 13、deployment 3）
- Typecheck: pass（全workspacesとdeployment）
- Build: pass（Viteの500 kB超chunk警告はnon-blocking）
- Runtime／DB／provider／canonical state changes: `0`

次の推奨taskは`T_TRANSCRIPT_BASELINE`（2p）である。このreceiptはその開始や、後続の
統合実装を自動承認しない。
