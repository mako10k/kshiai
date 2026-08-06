# Integrated Shadow Turn Receipt Evaluation

Status: `revise`

Evaluated on: 2026-08-06

Plan task: `T_INTEGRATED_RECEIPT_EVAL`

Protocol: [battle-pipeline-integrated-shadow-protocol.md](battle-pipeline-integrated-shadow-protocol.md)

Implementation: [battle-pipeline-integrated-shadow-receipt-poc.md](battle-pipeline-integrated-shadow-receipt-poc.md)

Raw evidence: [battle-pipeline-integrated-shadow-receipt-evaluation-2026-08-06.json](evidence/battle-pipeline-integrated-shadow-receipt-evaluation-2026-08-06.json)

## 1. Decision

統合receiptはauthority、privacy、causal reference、temporal atomicityを壊さず、主要な
bounded proxyも満たした。しかし、事前登録した7 stratumのうち
`interrupted_expanded_action`が要求した最長成立prefixを保持できなかったため、結論を
`supported`にはせず`revise`とする。

原因は限定されている。凍結transcriptの詳細planはobservation basisだけを持ち、既存Adaptive
validatorが要求するpsychology／experience basisを欠く。そのため統合器はstep 1のapproachを
成立済みとして残さず、`invalid_character_plan`から`unknown`へ縮退した。receiptはこの失敗を
隠さず、effectもpatchも生成していない。

この結果は、最終戦闘結果が誤っていること、またはAdaptive validatorを緩和すべきことを意味しない。
凍結fixtureを既存plan契約へ適合させて同じ評価を再実行するか、plan basis契約そのものを別taskで
再検討する必要がある。

## 2. Fixed execution

- frozen corpus: 7 stratum
- deterministic repetitions: 20 per stratum
- total executions: 140
- evaluator external LLM calls: 0
- canonical commits: 0
- evaluator provenance SHA: `fcf992d7540418571f46fdf1c75c3c8006ab661b`
- provenance worktree: clean
- evaluation machine: Linux x64, Node `v25.1.0`

evaluatorは固定artifactのcontent digestを検証してから実行し、各runでsource BattleStateと
authoritative outcomeのdigestを前後比較した。出力は上書き禁止の`wx`で一度だけ生成した。

## 3. Hard invariants

| Metric | Result | Threshold |
|---|---:|---:|
| schema validity | `1.00` | `1.00` |
| source mutation | `0` | `0` |
| authoritative outcome change | `0` | `0` |
| canonical commit | `0` | `0` |
| observer canonical-ID leakage | `0` | `0` |
| out-of-scope repair mutation | `0` | `0` |
| dangling causal／component ref | `0` | `0` |
| temporal atomicity failure | `0` | `0` |

Hard invariantsはすべてpassした。これはshadow実行が固定sourceと現行authoritative resultへ
干渉しなかったことを示すが、runtime persistenceや同時commitの安全性は示さない。

## 4. Primary proxies and registered behavior

| Metric | Result | Threshold |
|---|---:|---:|
| minimum expected dependency recall | `1.00` | `1.00` |
| minimum component receipt coverage | `1.00` | `1.00` |
| explicit conflict／unknown handling | `1.00` | `1.00` |
| deterministic receipt digest stability | 各case `1` digest | 各case `1` digest |
| integrated local p95 | `32.624ms` | `<= 50ms` |
| registered stratum behavior | `6/7` (`0.857143`) | `7/7` |

protocolの主要proxyはすべてpassした。一方、scenario strataに固定したrequired behaviorは
統合効果の評価対象なので、6/7をsupportedへ読み替えない。

| Stratum | Behavior | p95 | Receipt bytes |
|---|---|---:|---:|
| ordinary fast action | pass | `44.445ms` | `47,080` |
| remote rejection | pass | `32.624ms` | `45,437` |
| simultaneous terminal action | pass | `29.483ms` | `51,533` |
| interrupted expanded action | **fail** | `19.682ms` | `43,510` |
| active world process | pass | `34.397ms` | `78,670` |
| blocking local conflict | pass | `22.296ms` | `49,853` |
| exhausted budget | pass | `28.810ms` | `43,390` |

全caseで20 runのreceipt digestは一種類だった。統合receipt全体は`43,390–78,670 bytes`、
projectionは`13,905–17,723 bytes`、component payloadは`54,196–91,756 bytes`だった。
これらは初回PoCの報告値であり、単独の合否閾値ではない。

## 5. Calls, tokens, and XAI decision

- current authoritative minimum calls: 4
- modeled ordinary shadow calls: 3
- shadow external LLM calls during evaluation: 0
- generation tokens: not measured
- generation latency: not measured

3-callはreceipt上のmodeled topologyであり、live call削減の実測ではない。tokenとgeneration
latencyも未測定なので、costまたはprovider latencyの改善を主張しない。

blind semantic reviewおよびXAIは使用しなかった。失敗箇所、validator reason、欠落basis、
completed step、effect、patchがstrict receiptから決定的に読めるためである。意味的な好みを
判定するLLM reviewを追加しても、この契約不一致を解決できず、再現可能な根拠を弱める。

## 6. Interaction effect and bounded revision hypothesis

component単体では、詳細plan validatorは必要basisを欠くplanを安全にrejectし、統合器も
unknown fallbackを保持した。この安全側挙動自体は有効である。統合時に初めて、凍結transcriptの
plan constructionとAdaptive plan basis契約の不一致が、事前登録した「最長成立prefix」評価を
妨げることが明確になった。

次のdecision taskで検討できる最小の修正仮説は、凍結されたcharacter psychology／experience
refsをinterrupted planのbasisへ明示的に接続し、他のinput、threshold、expected behaviorを変えず
7 case x 20 runを再実行することである。validatorを迂回するbasis捏造や、失敗caseの削除、
threshold緩和は許容しない。

## 7. Evidence integrity and non-claims

- raw file SHA-256: `1390c3db03707e9905cbb798b437b47705c4afcd5b0a742be76c1c7c703e145c`
- canonical report content digest: `dcba50ef201b7741a99a73473d67823703fdfa82a5014ff3ad94c42b3f5d1dd3`
- frozen transcript content digest: `bd047d71f4bee6736aa645a5fea690cede67b1c147654630c4f8ad63b7abd882`
- runtime integration references: `0`

この評価は最終戦闘結果の客観的正しさ、世界全体の無矛盾性、未知turnへの一般化、production
latency、persistence concurrency、provider failure、release、deploymentを保証しない。

## 8. Validation receipt

- backend evaluator regression: pass
- backend typecheck: pass
- 140-run raw evaluation: completed
- raw evidence content integrity: pass
- source／authoritative mutation: `0 / 0`
- external LLM／XAI calls: `0 / 0`
- full repository tests: `352/352 pass`（shared 225、backend 111、frontend 13、deployment 3）
- full typecheck: pass（全workspacesとdeployment）
- full build: pass（Viteの500 kB超chunk warningはnon-blocking）
- static authority regression: integrated shared-only sourceをruntime wiringと誤分類した既存3検査を
  修正し、対象回帰とfull suiteを再実行してpass
- PERT format／check／DAG／Plan Assurance: diagnostic `0`、current outcome
  `conformant`、next task `verified`
- runtime／DB／provider／network／canonical commit integration: `0`

次の推奨taskは`T_SHADOW_DECISION`（1p、現在のprovisional velocityでは`0.283d`）である。
評価taskの完了は、bounded revisionの実装、runtime統合、releaseを自動承認しない。
