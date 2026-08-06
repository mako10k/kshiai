# Integrated Shadow Turn Receipt PoC

Status: shared-only implementation complete; effectiveness not yet evaluated

Implemented on: 2026-08-06

Plan task: `T_INTEGRATED_RECEIPT_POC`

Protocol: [battle-pipeline-integrated-shadow-protocol.md](battle-pipeline-integrated-shadow-protocol.md)

Frozen input: [battle-pipeline-integrated-shadow-transcript-baseline.md](battle-pipeline-integrated-shadow-transcript-baseline.md)

## 1. Outcome

固定済み7 transcriptを、次の一つのstrict receiptへ連結するshared-only関数を実装した。

```text
source BattleState
  -> immutable Canonical Graph view
  -> A/B Observation + Adjudication + Consistency projections
  -> Adaptive / World shadow resolution in one execution window
  -> bounded CanonicalPatch conversion and audit
  -> ConsistencyIssue registration
  -> purpose-scoped read check and disabled repair preview
  -> dependency / component / causal-reference / authority receipt
```

入口は`runIntegratedShadowTurnPoc`、契約は`IntegratedShadowTurnInputSchema`と
`IntegratedShadowTurnReceiptSchema`である。実装は`packages/shared`内に留め、runtime service、
DB、provider、canonical commitへ接続していない。

## 2. Receipt boundary

receiptは次を保持する。

- transcript、source BattleState、authoritative outcomeの既存digest
- A/B Observation、Adjudication、Consistency projectionのbounded digestとbytes
- graph query receiptとindex statistics
- adaptive／world component receipt、patch audit、issue、read-coherence preview
- proposal、effect、process、fact間のcausal trace
- exact dependency recallとdangling reference
- component coverage、conflict／fallback明示、call／token／latency測定状態
- `sourceMutated=false`
- `authoritativeOutcomeChanged=false`
- `canonicalCommitPerformed=false`
- `externalLlmCallsMade=0`

component digestはlocal安定性確認用の`fnv1a32`であり、artifact provenance用SHA-256や
security integrityを置き換えない。authoritative digestは固定transcriptから引き継ぐだけで、
shadow outcomeとの同値性を主張しない。

## 3. Implementation decisions

### Empty stages remain explicit

character proposalまたはworld projectionがないcaseでは、空の擬似proposalを作らず
`skipped` receiptを返す。これによりcomponent schemaの`min(1)`を迂回して結果を捏造しない。

### Adaptive effects become bounded shadow patches

成立したadaptive effectだけをshadow CanonicalPatchへ変換する。同じcanonical slotの現在factは
graph viewから読み、更新時だけretractする。fallback fact、failed step、未実行stepはpatchへ
昇格しない。

### Repair stays disabled

read-coherenceは全ConsistencySliceを検査するが、このtaskではrepair planを生成せず
`allowShadowRepair=false`とする。したがってblocking conflictは`conflicted / unresolved`として
残り、範囲外の修復mutationは発生しない。

### Existing world causal gap was corrected

統合patch auditにより、World Process PoCのprior fact retractionに`ended` causal linkがないことを
検出した。world shadow patch生成側で終了因果を追加し、すべてのretractionに対応する
`ended` linkがあることを単体testで固定した。authoritative world stateやruntime挙動は変更して
いない。

## 4. Seven-transcript regression smoke

primary evaluation前の実装回帰として、7 caseを各2回実行してreceiptの完全一致を確認した。
これはprotocolの20-run evaluation、p95測定、最終decisionではない。

| Check | Smoke result |
|---|---:|
| schema-valid integrated receipts | `7/7` |
| exact dependency recall | 全case `1.00` |
| component receipt coverage | 全case `1.00` |
| source / outcome / commit interference | `0 / 0 / 0` |
| observer canonical-ID leakage | `0` |
| out-of-scope repair mutation | `0` |
| dangling causal/component refs | `0` |
| temporal atomicity failure | `0` |
| external LLM calls | `0` |
| projection truncation | `0` |
| patch audits | `4/4 no_issue_found` |
| fixed conflict exposure | `conflicted / unresolved` |
| final receipt JSON size | `43,390–78,670 bytes` |

World caseはcharacter proposalとworld processをturn 1の同じ`execution` windowへ置く。
ordinaryとsimultaneous caseはadaptive effectからpatchを生成し、world caseはworld patchを監査する。
remote rejectionは固定済みdefense proposal、exhausted budgetは`intermediate` fallback、blocking
conflictはopen issueとunresolved readとして明示された。

## 5. Known interaction effects and non-claims

- interrupted planとblocking conflict planは、固定fixtureのstep basisがpsychology／experience
  categoryを満たさないためAdaptive PoCで`invalid_character_plan`となり、`unknown`へ縮退する。
  統合器はbasisを補作せず、この状態をreceiptへ残す。これがfixture修正かcomponent契約修正かは
  次の評価taskで判定する。
- receiptの安定性は固定inputに対するlocal deterministic smokeであり、未知turnへの一般化ではない。
- source／authoritative objectの非mutationは確認するが、最終戦闘結果が正しいことは確認しない。
- current 4-call topologyとmodeled 3-call topologyは記録するだけで、live削減を測定しない。
- tokenとgeneration latencyは未測定のままである。
- persistence、同時commit、production latency、provider failureは範囲外である。

## 6. Validation receipt

- Shared typecheck: pass
- Shared tests: `225/225 pass`
- Frozen 7-transcript integrated regression: pass
- Integrated receipt schema parse: `7/7 pass`
- Deterministic equality in implementation smoke: `7/7 pass` over two runs
- Source transcript file mutation: `0`
- Full repository tests: `351/351 pass`（shared 225、backend 110、frontend 13、deployment 3）
- Full typecheck: pass（全workspacesとdeployment）
- Full build: pass（Viteの500 kB超chunk warningはnon-blocking）
- PERT format／check／DAG／Plan Assurance: diagnostic `0`、current outcome
  `conformant`、next task `verified`
- Runtime／DB／provider／network／canonical commit integration: `0`

## 7. Next gate

次候補は`T_INTEGRATED_RECEIPT_EVAL`（2p）である。20-run raw evidenceと事前登録thresholdにより、
実効性を`supported / revise / unsupported / indeterminate`のいずれかで判定する。このPoC実装完了は
評価結果、runtime統合、releaseを自動承認しない。
