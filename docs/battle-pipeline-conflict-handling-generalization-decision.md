# Conflict-Handling Held-Out Generalization PoC Decision

Decision: `supported`

Decided on: 2026-08-06

Plan task: `T_HELD_OUT_REPLAY_DECISION`

Protocol:
[battle-pipeline-conflict-handling-generalization-protocol.md](battle-pipeline-conflict-handling-generalization-protocol.md)

Frozen corpus:
[battle-pipeline-conflict-handling-held-out-fixtures-v1.json](evidence/battle-pipeline-conflict-handling-held-out-fixtures-v1.json)

Raw evidence:
[battle-pipeline-conflict-handling-held-out-evaluation-2026-08-06.json](evidence/battle-pipeline-conflict-handling-held-out-evaluation-2026-08-06.json)

## Result

固定済み30 classifier envelopeと6 integration extraction controlを各20回、計720 runsで
再生した。すべてのhard invariantとprimary effectiveness proxyが事前登録thresholdを満たしたため、
現行`conflictHandlingV2` classifierは、この限定held-out corpusに対して構造的効果を維持したという
`supported` evidenceとして採用する。

| Gate | Result |
|---|---:|
| schema validity | `720/720 = 1.00` |
| frozen lineage／source match | `1.00` |
| classifier input／source／authoritative mutation | `0 / 0 / 0` |
| legacy receipt mutation／canonical commit | `0 / 0` |
| integration dangling refs | `0` |
| external LLM／XAI calls | `0 / 0` |
| exact classifier labels | `30/30` |
| exact trigger-kind sets | `30/30` |
| each trigger-kind recall | `1.00` |
| trigger false negatives | `0/820` |
| no-trigger specificity | `4/4` |
| `missing` recall | `8/8` |
| handled accuracy | `18/18` |
| capability disposition | `30/30` |
| registered distribution parity | exact |
| multi-trigger interference | `6/6` |
| integration extraction controls | `6/6` |
| integration legacy projection parity | `6/6` |
| deterministic stability | `1 digest × 36 inputs` |
| classifier local p95 | `0.056833ms <= 5ms` |
| integration enrichment local p95 | `6.148826ms <= 50ms` |

5種類のtriggerそれぞれについて登録caseの全反復でexpected triggerを検出し、false negativeは
なかった。4 no-trigger caseはすべて`not_applicable`、8 missing caseはすべて`missing`、
18 handled caseはすべて`handled`だった。30 caseの実分布は固定期待分布と完全一致した。

integration controlでは、source battle state、authoritative outcome、元legacy receiptを変更せず、
`expectedBoundaries.allowedFallbacks`だけを変換した。enrichment後に`conflictHandlingV2`だけを除いた
projectionは、全120 runsで元legacy receiptと一致した。

## Evidence identity

| Item | Identity |
|---|---|
| raw evidence file SHA-256 | `3f9c0d2a0ce08cd425d3ad528228abce65c5304bc233e08f5bb0c48d047aa67b` |
| raw evidence content digest | `2f1a793ba6a2c674553bf00e9146b7f8438de7900929b0b0e90ad157362fa8ca` |
| frozen corpus file SHA-256 | `2c43d8becb3b2c55e7cac0acf2c3a5fea640372c82d199d2bcbcc60ab90f99a5` |
| frozen corpus content digest | `aa296ff12a672b074f582c18237b84ef403047b063d3dd7178fa009719e7d54f` |
| evaluator source SHA-256 | `656b4cb0184b7666b915136fc0a659e86c04a5dc9251954964ef8337e6b0d483` |
| classifier source SHA-256 | `f8561c8cda612d75ee5d6af592a1547d7cfbf5ad8d565c72baab75cd729b7905` |

raw evidenceはcanonical reportから`integrity`を除外した内容のSHA-256を保持し、protocol、evaluator、
corpus、corpus builder、classifier、receipt builderのfile hashを記録する。評価後の検証でcontent
digest、frozen lineage、current source identityはいずれも一致した。

## Scope boundary

このdecisionが支持するのは、以前の7 stratum外として独立に固定した30 envelopeと、固定turnに対する
6 capability transformにおけるlocal classifier semanticsである。classifier作者や評価者から完全に
blindな実世界sample、未登録full battle turn、実際のturn分布を代表するsampleではない。

次は支持しない。

- 戦闘結果の客観的正しさ
- 未登録full battle turnに対するrecall、specificity、precision
- 世界全体の無矛盾性または完全な競合検出
- psychology、experience、intent、world-process、narrationのsemantic quality
- live LLM call削減またはproduction latency
- runtime wiring、persistence、canonical write、release、deployment

generation tokensとgeneration latencyは未測定である。全gateがstructured deterministic comparisonで
あり、外部LLMまたはXAIによる意味評価は結果を強化しないため実行しなかった。

## Recommendation

このgeneralization PoCは完了とする。runtime採用へ進む場合は、この結果を直接production authorityへ
変換せず、実turnを用いたread-only shadow observation、分布ずれ監視、独立したruntime wiring承認を
別計画として先に定義する。classifier変更、DB、canonical write、release、deploymentも独立gateとする。
