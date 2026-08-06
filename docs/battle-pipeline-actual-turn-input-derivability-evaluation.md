# Actual-Turn Applicability Input Derivability Evaluation

Status: evaluation recorded

Decision date: 2026-08-06

Decision: `revise`

Plan task: `T_INPUT_DERIVATION_EVAL`

Protocol:
[battle-pipeline-actual-turn-input-derivability-protocol.md](battle-pipeline-actual-turn-input-derivability-protocol.md)

Raw evidence:
[battle-pipeline-actual-turn-input-derivability-evaluation-2026-08-06.json](evidence/battle-pipeline-actual-turn-input-derivability-evaluation-2026-08-06.json)

## 1. Result

```text
transformation feasibility: pass
ordinary runtime authoritative availability: 0/5
decision: revise
capture authority: not granted
runtime source authoring: not authorized
```

固定20ケースを各20回、計400 runsで評価した。全ての変換hard gateは
通過した。明示された5種類のsource artifactが存在する場合、導出器は
推論やhidden defaultを使わず、完全なprovenance付きclassifier inputを
生成できる。sourceが欠落、重複、digest不一致、または参照不整合を含む
場合はclassifier inputを返さずfail closedした。

一方、レビュー済み通常ランタイムは5領域の正準source artifactを1件も
生成していない。合成fixtureの完全入力をruntime availabilityへ数えては
ならないため、`supported`条件である`5/5`は未達である。各不足領域は
所有stageと必要artifactを限定できるため、固定rubricに従い
`unsupported`や`indeterminate`ではなく`revise`とした。

## 2. Hard metrics

| Metric | Result | Gate |
|---|---:|---:|
| registered cases | `20/20` | pass |
| repetitions | `20/case`, `400 total` | pass |
| expected disposition | `20/20 cases` | pass |
| complete runs | `160` | informational |
| provenance coverage | `800/800 = 1.00` | pass |
| inferred fields | `0` | pass |
| missing-source rejection | `160/160 = 1.00` | pass |
| ambiguous-source rejection | `20/20 = 1.00` | pass |
| forbidden proxy used as source | `0` | pass |
| dangling reference accepted | `0` | pass |
| input digest changes | `0` | pass |
| deterministic output | `1 digest/case`, `20/20 cases` | pass |
| runtime-service imports | `0` | pass |
| classifier invocations | `0` | pass |
| DB/network/provider/external LLM/XAI | `0/0/0/0/0` | pass |
| battle/canonical/persistence writes | `0/0/0` | pass |

評価器はlineage確認のためprotocol、評価器、導出器、fixture corpusの4つの
repository source fileを読み取った。導出器自身のrepository readは0であり、
実battle、user data、DB、networkへはアクセスしていない。

## 3. Runtime source gap

| Output field | Required authoritative artifact | Reviewed ordinary runtime |
|---|---|---:|
| `allowedFallbacks` | `turn_fallback_policy` | absent |
| `proposals` | `coarse_proposal_registry` | absent |
| `adaptive` | `adaptive_stage_receipt` | absent |
| `reads` | `purpose_read_set` | absent |
| `issues` | `consistency_issue_snapshot` | absent |

不足を解消する候補は、各semantics ownerが自分のturn stageで明示的かつ
completeなartifactをauthorすることに限定できる。resolved action、event、
narration、speech、cognition、fallback outcome、sliceのみの情報、または
issue snapshotを伴わないblocking refからの逆算は引き続き禁止する。

このbounded source-authoring記述は、実装計画やruntime変更権限ではない。

## 4. Evidence identity

| Evidence | SHA-256 |
|---|---|
| protocol | `9ce6e1f62e7051ba8420e7ebb5aa2ee9591cece002700c4c990eeb2471f2f69b` |
| pure derivation module | `44485e3f69df8246a8cd0cd7a1b848ba05a8b86cffb1f23ed6064a00e07aac63` |
| fixed fixture corpus | `8a3f826f3aa44b9d72673373a62dac42b130f3722ed9e352ac28fa92dc4a1344` |
| evaluator | `305a77ff10ed9bed23e09c62135d0e12943353d10a17980105ed997099190797` |
| raw evidence file | `950312d2ca7493ec0cfb73727bbb324462a2553140d87e3b51252a9279c6ca73` |
| raw evidence content digest | `7027cb4f88287a75501b03eb507e7dfb60c6fc61bc37423895088fd3a1801cac` |

raw evidenceは、`integrity`を除いたcanonical reportのSHA-256を内部に保持
する。評価器、protocol、導出器、fixture corpusのcurrent file identityも
検証対象である。

## 5. Why no XAI review was used

全gateはstrict schema、SHA-256、exact field path、reference membership、
fixed expected dispositionから決定できる。外部semantic reviewはmissing
artifactを正準sourceへ昇格できず、`0/5`を改善しない。したがってXAIまたは
他のLLMを呼んでも判定根拠は強くならず、provider callは0とした。

classifierも呼んでいない。この評価はclassifierの精度ではなく、classifier
inputを正準sourceから推論なしで組み立てられるかを測っている。

## 6. Non-claims and authority boundary

この`revise`判定は次を意味しない。

- 通常ランタイムがcapture可能であること
- classifier accuracy、precision、recall、またはoracle correctness
- 戦闘結果の客観的正しさ
- unseen turnへの一般化
- 世界全体の無矛盾性
- runtime hook、source authoring、capture、DB、persistenceの承認
- classifier変更、runtime採用、release、deploymentの承認

## 7. Next gate

PERT上の次タスクは`T_CAPTURE_AUTHORITY_REVIEW`である。そこでこのevidenceと
将来のcapture候補を固定し、ユーザーの新しい明示判断を得る。

ただし現状の`0/5`では、通常turnから完全なcapture envelopeを生成できない。
capture authorityを与えるだけでは入力不足は解消しないため、reviewでは
captureを直ちに開始する案と、runtime source-authoringの別planへ変更する案を
区別しなければならない。

## 8. Decision lock

`T_INPUT_DERIVATION_EVAL`の決定は`revise`で固定する。変換可能性は支持されるが、
通常ランタイム準備状況は`0/5`である。新しいevidenceと明示的な計画・権限判断が
ない限り、合成fixtureの成功をruntime readinessへ読み替えず、runtime hook、
actual sampling、source authoring、persistence、release、deploymentへ進まない。
