# Integrated Shadow Turn Decision Record

Status: decision recorded

Decision date: 2026-08-06

Plan task: `T_SHADOW_DECISION`

Input evaluation: [battle-pipeline-integrated-shadow-receipt-evaluation.md](battle-pipeline-integrated-shadow-receipt-evaluation.md)

## 1. Decision

```text
Integrated receipt result: revise
Bounded corrective experiment: justified
Runtime integration: not authorized
Production readiness: not established
Objective battle-result correctness: not established
```

次に進める価値があるのは、`interrupted_expanded_action`のplan basis不一致だけを修正した
versioned transcriptを作り、同じprotocol、7 stratum、20 repetitions、thresholdで再評価する
限定実験である。

現在のreceiptを`supported`へ読み替えない。hard invariantsとprimary proxiesはpassしたが、
事前登録したrequired behaviorは`6/7`である。`interrupted_expanded_action`が最長成立prefixを
保持できるまで、統合receipt全体のdecision lockは`revise`のままとする。

## 2. Evidence basis

| Evidence | SHA-256 | Role |
|---|---|---|
| [Fixed protocol](battle-pipeline-integrated-shadow-protocol.md) | `37550e589f0898cd9632cedc3b366a5228b484bdb2dce5cd19a17c197d1b84e6` | authority boundary、scenario、threshold、rubric |
| [Frozen v1 transcript](evidence/battle-pipeline-integrated-shadow-transcript-baseline-2026-08-06.json) | `1b9c9e3b502b9e32bc96e5848ab5228f9f0d1c44ab4310a7b21dd268c6ed689a` | immutable failing input and authoritative control |
| Integrated receipt implementation | `e70d95ab45f42c00eb6b28387985121bf72c5e40fe13780dd5301b48ba9cc2b3` | shared-only composition under test |
| Evaluation harness | `4f054462ca928bf48d9f45fab1e7287a54b025acea5702e8bf7a2c3b51b29a69` | deterministic measurement and decision rubric |
| [Raw 140-run report](evidence/battle-pipeline-integrated-shadow-receipt-evaluation-2026-08-06.json) | `1390c3db03707e9905cbb798b437b47705c4afcd5b0a742be76c1c7c703e145c` | observed metrics and failed behavior |

raw reportはclean-tree commit `fcf992d7540418571f46fdf1c75c3c8006ab661b`上で生成された。
canonical report content digestは
`dcba50ef201b7741a99a73473d67823703fdfa82a5014ff3ad94c42b3f5d1dd3`である。

## 3. What remains supported

今回のintegration failureで、個別componentの次の限定証拠は失効しない。

| Boundary | Integrated observation | Decision effect |
|---|---|---|
| authority | source mutation、authoritative outcome change、canonical commitがすべて`0` | shadow-only境界を維持 |
| privacy | observer canonical-ID leakが`0` | observer projection境界を維持 |
| dependency | minimum recall `1.00`、component coverage `1.00` | 固定corpus内の必要参照を保持 |
| causal／temporal | dangling refとatomicity failureが`0` | 固定receiptのtraceと同時窓を維持 |
| conflict／budget | explicit conflict／unknown handling `1.00` | 安全側fallbackを維持 |
| determinism | 各case 20 runでdistinct digest `1` | failureを含め再現可能 |

これらは統合receiptの一部境界が機能した証拠であり、最終結果の正しさや世界全体の整合性を
証明しない。

## 4. Integration effect

Adaptive componentは、schema-validな詳細planに対して最長成立prefixと実行由来costを保持する
単体回帰を持つ。一方、v1 integrated transcriptではproposalの`characterBasis`に
observation／psychology／experience refsがあるにもかかわらず、両stepの`basisRefs`は
observationだけだった。

Adaptive validatorはplan全体が三categoryを使用することを要求するため、統合実行では
precondition評価へ到達せず、次となった。

```text
resolution: degraded
outcome: indeterminate
failureReason: invalid_character_plan
completedSteps: []
effects: []
costs: []
fallback: unknown
```

したがって、観測されたfailureは「最長prefixアルゴリズムが誤った」という証拠ではなく、
transcript plan constructionと既存grounding contractが統合時に接続していないという証拠である。
ただし、実際の心理・経験内容ではなくref categoryだけを扱うため、次の限定実験が証明できるのも
structural basis wiringまでである。

## 5. Selected next gate

次gateを`versioned plan-basis corrective replay`とする。開始前に別planでprotocolとtask basisを
受け入れる必要があり、このdecision record自体は実装開始の権限を持たない。

### Allowed change

- v1 artifactを上書きせず、v2 transcriptまたは明示的versioned deltaを作る。
- `interrupted_expanded_action`のstep basisだけを、既にproposalへ固定されたobservation、
  psychology、experience refsへ接続する。
- 6つの非対象stratum、BattleState、authoritative result、facts、steps、effects、costs、
  thresholds、decision rubricは変更しない。
- evaluatorはv1とv2のinput digestとfield-level deltaを報告する。

### Required replay evidence

- 7 stratum x 20 deterministic repetitions
- hard invariantsとprimary proxiesを同一thresholdで再判定
- registered behavior `7/7`
- interrupted caseでapproach stepのみcompleted、strike stepはprecondition failure
- approach由来effectとexposure costを保持し、strike effectを生成しない
- 他6 caseのsemantic receipt digestがv1から変わらないか、version metadataだけの差を明示
- external LLM／XAI calls `0`

### Stop conditions

- basis refを既存proposal scope外から捏造する必要がある。
- validator、threshold、failed behaviorの定義を緩和しなければpassしない。
- authority、privacy、causal、temporal、conflict、budgetの既存passがregressionする。
- v2が対象外のauthoritative inputまたは他stratumを変更する。

いずれかに該当した場合は、実験結果を`revise`または`unsupported`として止め、runtime統合へ
進めない。

## 6. Rejected alternatives

| Alternative | Decision | Reason |
|---|---|---|
| `unknown` fallbackをrequired behaviorのpassにする | rejected | failureを成功へ読み替えるため |
| Adaptive validatorからpsychology／experience coverageを外す | rejected | character grounding境界を弱めるため |
| failed stratumをcorpusから除外する | rejected | 事前登録scenarioを事後変更するため |
| XAIでfixtureの妥当性を多数決する | not required | strict fieldsが欠落categoryと停止stageを決定的に示すため |
| integrated receiptをruntimeへshadow wiringする | rejected at this gate | v1 decisionが`revise`で、provider／persistence影響も未評価のため |
| canonical graphまたはpatchをcommitする | rejected | authority、transaction、rollback evidenceがないため |

## 7. Calls, quality, and unresolved questions

current authoritative minimum 4 callsとmodeled ordinary shadow 3 callsは比較記録のままであり、
live call削減は`indeterminate`である。generation tokensとgeneration latencyも未測定である。

corrective replay後も次は未解決のまま残る。

- LLM生成planが実際の心理、経験、意図へ意味的にgroundedしているか
- 未知turnでdependencyを欠落しないか
- world concretizationとcharacter planの生成品質
- Narrator ConsistencyAlertを含むend-to-end修復loop
- concurrent commit、persistence、provider failure、production latency
- 最終戦闘結果の客観的正しさと世界全体の無矛盾性

## 8. Point estimate and velocity

次の限定実験候補は3pと見積もる。

| Candidate task | Points | Deliverable |
|---|---:|---|
| freeze revision protocol and v2 delta contract | 1p | immutable delta、同一threshold、stop condition |
| build versioned corrective replay | 1p | v2 artifact、field-delta receipt、regression |
| run and decide replay | 1p | 140-run raw evidence、same-rubric decision |

新しい独立したperson-day実績がないため、velocityは`453p/128d`（約`3.539p/day`）から変更しない。
3pのforecastは約`0.848d`である。これは次planのprovisional forecastであり、deadline、実績時間、
または開始承認ではない。

## 9. Decision lock

`T_SHADOW_DECISION`が閉じた時点で、現在のintegration resultは`revise`、許容される次gateは
versioned plan-basis corrective replayで固定する。新しいmaterial evidenceと明示的な計画変更が
ない限り、runtime integration、persistence、provider-order change、release、deploymentを
候補へ昇格しない。

## 10. Validation receipt

- focused Adaptive／integrated receipt／evaluator tests: `13/13 pass`
- raw evaluation content digest verification: pass
- full repository tests: `352/352 pass`（shared 225、backend 111、frontend 13、deployment 3）
- full typecheck: pass（全workspacesとdeployment）
- full build: pass（Viteの500 kB超chunk warningはnon-blocking）
- external LLM／XAI calls: `0 / 0`
- runtime／DB／provider／canonical state changes: `0`
- PERT format／check／DAG／Plan Assurance: diagnostic `0`、`5/5` tasks verified and
  conformant、remaining recommended task `0`
