# Conflict-Handling Applicability PoC Decision

Decision: `supported`

Decided on: 2026-08-06

Plan task: `T_APPLICABILITY_REPLAY_DECISION`

Protocol: [battle-pipeline-conflict-applicability-protocol.md](battle-pipeline-conflict-applicability-protocol.md)

Raw evidence:
[battle-pipeline-conflict-handling-applicability-evaluation-2026-08-06.json](evidence/battle-pipeline-conflict-handling-applicability-evaluation-2026-08-06.json)

## Result

固定済みcorrective-v2の7 stratumを各20回、計140 runsで再生した。すべてのhard invariantと
primary applicability proxyが固定thresholdを満たしたため、versioned additive
`conflictHandlingV2` contractをこの限定PoCの範囲で`split applicability` hypothesisの
supported evidenceとして採用する。

| Gate | Result |
|---|---:|
| schema validity | `1.00` |
| source／authoritative mutation | `0 / 0` |
| canonical commit | `0` |
| observer leak／repair mutation | `0 / 0` |
| legacy causal・component／applicability dangling ref | `0 / 0` |
| temporal atomicity failure | `0` |
| external LLM／XAI calls | `0 / 0` |
| registered classification | `7/7` |
| applicable strata | `3/7` |
| applicable handling | `60/60 = 1.00` |
| capability disposition | `7/7` |
| legacy receipt parity | `7/7` |
| registered battle behavior | `7/7` |
| deterministic stability | `1 digest × 7 cases` |
| integrated local p95 | `46.162677ms <= 50ms` |

applicableだったのは`remote_rejection`、`blocking_local_conflict`、`exhausted_budget`の
3 stratumだけであり、全60 runsが`handled`だった。既知precondition failureでpartialとなる
`interrupted_expanded_action`は、fallback能力を保持していても`not_applicable／not_needed`に
分類された。

## Evidence identity

| Item | Identity |
|---|---|
| raw evidence file SHA-256 | `facb46a9034a2c1cb81d1e7367d931c9f23e6e39ffb7b5826db90f0da58ed3fc` |
| raw evidence content digest | `9618c8153f3b7d169749b78d2f708aef66e662da381bd8d727df29968588449f` |
| frozen parent evaluation SHA-256 | `55f5312726c0c425f106f50a80d042d4424249a15e5b8dd36370561b8e313e73` |
| frozen parent content digest | `524fad02bc27c9c87b1a2e62b238a79813d4d3e375dabcd38ad568a7ddc7074e` |

raw evidenceはcanonical reportから`integrity`を除外した内容のSHA-256を保持し、評価器、protocol、
classifier、construction wrapper、frozen parent evaluationのfile hashも記録する。評価後の検証で
content digestとcurrent source identityはいずれも一致した。

## Legacy diagnostic and prior decision

旧`explicitConflictOrUnknownHandlingRate`は`120/140 = 0.857143`のままである。これは
`allowedFallbacks`をhandling applicabilityへ変換する旧contractの診断値であり、新rubricのprimary
gateには使用しない。

この結果は、既存のcorrective replayに対する`revise`判定を遡及的に`supported`へ変更しない。
新protocol、新v2 envelope、新raw evidenceに対してだけ`split applicability`をsupportedと判断する。

## Scope boundary

このdecisionが支持するのは、固定7 stratumにおいてcapability、observed applicability trigger、
handling evidence、dispositionを分離するadditive local receipt contractである。次は支持しない。

- 戦闘結果の客観的正しさ
- 未登録turnへの分類一般化
- 世界全体の無矛盾性
- psychology／experienceのsemantic grounding
- live LLM call削減またはproduction latency
- runtime wiring、persistence、canonical write、release、deployment

generation tokensとgeneration latencyは未測定のままである。XAIはstructured gateを強化しないため
実行しなかった。

## Recommendation

次段階へ進む場合は、このPoC結果をruntime採用の根拠へ直接変換せず、未登録turnを含む別protocolで
classifier recallと`missing` dispositionを先に検証する。runtime wiring、DB、release、deploymentは
それぞれ独立した承認gateとして扱う。
