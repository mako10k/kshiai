# Battle Pipeline Revision PoC Evidence Synthesis

## 1. 結論

```text
Scope: frozen local and shadow PoC evidence only
Overall decision: supported for a bounded next engineering experiment
Production readiness: not established
Objective battle-result correctness: not established
Global consistency: not established
```

PoCは、次の設計方向に局所的な実効性があることを支持した。

- observer／用途別に小さく取得するcompact Projection
- 権限を持たない限定CanonicalPatchと早期audit
- purpose blockingを持つConsistencyIssue lifecycle
- 因果強度をrecencyより優先するbounded read repair
- BattleStateから都度構築するin-memory derived graph view
- fast／coarse／expandedを分けるshadow adjudication
- character proposalと同じ時間窓へ置くrule-based world proposal

ただし、初版Projectionと初版Read Repairはそのままでは採用できず、固定protocolで
`revise`となった後、限定revisionでのみ`supported`へ到達した。独立graph persistence、
実canonical commit、live prompt wiring、通常turn 3-call化、LLMが生成する詳細planと
world concretization、任意proseからの矛盾発見、production負荷は評価していない。

したがって、このPoCが支持するのは「限定されたshadow境界を保った次実験」であり、
既存BattleState authorityの置換、DB migration、provider順変更、release、deploymentでは
ない。

## 2. Evidence basis

| Evidence | SHA-256 | Role |
|---|---|---|
| [Frozen baseline](evidence/battle-pipeline-poc-baseline-2026-08-06.json) | `1617cc68535ace9af570a826cee8a916075f81ee3200c4c03b51c8f76bf90e1b` | current-pipeline hard invariant and outcome control |
| [Projection v1](evidence/battle-pipeline-projection-eval-2026-08-06.json) | `a11e634446a8735c4d9465651a44028d08bab9fc24068b746b3bb56b265bdf3e` | initial bounded-slice evaluation |
| [Projection revision](evidence/battle-pipeline-projection-revision-eval-2026-08-06.json) | `e4a64f01e4fe76e298cfa8612b8197cd482fd2cb27c497f70e8935d8d24ccdbe` | compact representation re-evaluation |
| [CanonicalPatch](evidence/battle-pipeline-patch-eval-2026-08-06.json) | `e4a2a18895fcd2ee315c26f60f52936ac321c7dca8a049eb97db32c87d7f5d07` | parity and bounded audit evaluation |
| [ConsistencyIssue](evidence/battle-pipeline-consistency-issue-eval-2026-08-06.json) | `bf920df6add877cb7bb5f201333e59abaed258bd93fc5138a9cd3dd1e7ded911` | lifecycle and purpose-blocking evaluation |
| [Read coherence v1](evidence/battle-pipeline-read-coherence-eval-2026-08-06.json) | `35f744b69dcbcba127729428570083dcdca99065feb5c3c044fdaec5f08c0bfb` | initial repair evaluation and causal failure evidence |
| [Read coherence revision](evidence/battle-pipeline-read-coherence-revision-eval-2026-08-06.json) | `2680b48e5c70570fd7cdbbde34ec1b70902f210ae868f7cc8b2d3e2f2cede00e` | causal-first selection re-evaluation |
| [Canonical graph](evidence/battle-pipeline-canonical-graph-eval-2026-08-06.json) | `e7b0def3d86ac8eace634d0b36fe37fa403551e3b987a4dece00e615c1a63c7a` | derived-view parity, cost, and rollback evaluation |
| [Adaptive adjudication](evidence/battle-pipeline-adaptive-adjudication-xai-2026-08-06.json) | `06935207075c933d66f224796aac0fc38f091a97f6fec6cfb9800022f86b3264` | deterministic and blinded semantic evaluation |
| [World process](evidence/battle-pipeline-world-process-xai-2026-08-06.json) | `b51f66b04ba5aeeacde0043a376ede8191da8f16d0757fbba16f2dd539873f87` | continuity, timing, causal, and blinded semantic evaluation |

これらのhashはsynthesis時にworkspace上のartifactから再計算した。Baseline reportだけは
`workingTreeDirty=true`の実行由来を持つため、clean-tree実行証明には使わず、固定corpus、
hard metric、後続reportから参照されたhashの一致を比較基準とする。

## 3. Intervention evidence matrix

| Intervention | Hypothesis and prototype scope | Control / primary evidence | Observed effect | Hard invariants | Decision | Failure mode, uncertainty, and next experiment |
|---|---|---|---|---|---|---|
| Projection v1 | BattleStateからObservation／Adjudication／Consistency sliceをread-only生成すれば、必要factを保持しつつcontextを削減できる | frozen BattleState、6 fixtures、20 repetitions | decisive-fact recall `1.00`、identity leak `0`、outcome mismatch `0`。weighted byte reductionは`0.047069`で30%閾値未達 | pass | `revise` | server-side fact envelopeの重複で多くのfixtureが拡大した。observer-local boundaryは保持し、compact DTOへ限定revisionする仮説を採用した |
| Compact Projection revision | 重複factをcompact purpose DTOへ変えればrecallを落とさず削減できる | v1と同一fixture、threshold、20 repetitions | recall `1.00`、byte reduction `0.663010`、p95 `2.652334ms`、outcome mismatch `0` | pass | `supported` | seeded claim以外の暗黙dependencyは未証明。次は実turn transcriptを使うshadow prompt-input comparisonでmissed dependencyとtoken差を測る |
| CanonicalPatch and early audit | subsystem authorityを変えず限定diffへ変換し、bounded auditで欠陥を検出できる | mechanical／semantic／world／free-action frozen transitions | classification、post-state parity、causal parity、seeded-defect recallがすべて`1.00`。scope byte reduction `0.718705`、false rejection `0` | pass | `supported` | implicit cross-object conflictと実commitは未測定。次はisolated transactional replay storeで原子的commit／rollback／concurrent patch conflictを測る。production DBは対象外 |
| ConsistencyIssue lifecycle | alertを直接mutationさせず、dedupe／defer／resolve／purpose blockingを決定論的に管理できる | seeded issue and non-issue stream | detection、dedupe、blocking、lifecycle、actionabilityが`1.00`、false positive `0`。unique issueあたり`773.9 bytes` | pass | `supported` | arbitrary proseからの矛盾発見とblocking classifierの汎化は未測定。次はblind labeled conflict corpusでdetector／classifier qualityとhuman review timeを測る |
| Read coherence v1 | complete purpose slice上で局所矛盾を検査・repairすればusable readを増やせる | 7 frozen scenarios、20 repetitions | detection `1.00`、blocking reduction `0.80`、usable read `1.00`だが、correct selection `0.50`、incorrect selection `20`、causal regression `20` | authority／scope／history hard checksはpass | `revise` | bare recencyが因果的に弱いfactを選んだ。初版select rankingは採用しない |
| Causal-first read revision | causal strengthをrecencyより前に置き、比較不能時selectを拒否すればharmを除ける | v1と同一fixture、threshold、20 repetitions | correct selection `1.00`、causal regression `0`、blocking reduction `0.80`、unknown fallback `0.50`、p95 `2.693444ms` | pass | `supported` | direct structured slot conflictに限定。次は複数conflict、循環／不完全因果、authority同順位を含むadversarial corpusとunknown consumer semanticsを評価する |
| In-memory Canonical Graph view | BattleState上のderived indicesでprojection／patch contextを同値のまま取得できる | direct adapter and deterministic BattleState control | projection／query／restart／outcome／rollback parityが`1.00`。p95 query `1.009445ms`、serialized dual representation growth `2.113748x` | pass | `supported` for derived view | 独立永続化はこの証拠では`unsupported`。まずfull-rebuild derived viewを維持し、必要ならread-only incremental cacheのinvalidationsとmemory ceilingを別実験する |
| Adaptive adjudication | fast／coarse／expandedを分け、最長成立prefixと実行由来costを保持すれば曖昧行動の局所納得性を改善できる | 7 frozen scenarios、20 deterministic repetitions、20 blinded XAI comparisons | fast parity、trigger precision／recall、prefix、causal trace、budget degradationが`1.00`。adaptive preference `0.95`、explanation delta `+2.95`、order consistency `0.80` | pass | `supported` for frozen shadow receipts | plan、coarse outcome、world refinementはpre-authored。順序整合性は最弱passing metric。次はreal ObservationSliceからLLMが生成するplanをblind reviewし、grounding、calls、tokens、latencyを測る |
| Active world processes | rule-based processをcharacter proposalと同じ時間窓へ置けばcontinuityと因果をside-neutralに保持できる | no-active-process control、9 scenarios、20 repetitions、20 blinded XAI comparisons | progression／trigger／propagation／conflict／causal／symmetry／atomicity／terminalが`1.00`。preference `1.00`、continuity delta `+3.35`、p95 `0.780132ms` | pass | `supported` for frozen shadow rules | controlが意図的にinactiveなのでsemantic差は強い。process発見、recursive propagation、conflict resolution、LLM concretizationは未測定。次はbounded active-process extractionとtwo-hop propagationを別fixtureで評価する |

## 4. Interaction effects and superseded measurements

### 4.1 Revisionによって置き換わった結果

- Projection v1の`4.71%`削減は、compact revision後の最終representationの性能値として
  は使わない。ただし、envelope重複が有害だったfailure evidenceとして保持する。
- Read coherence v1のselection `0.50`と20件のcausal regressionは、causal-first revision
  後の最終結果ではない。ただし、recency-first selectを再導入しないregression evidenceで
  ある。
- revision後のsupported判定は、元の失敗を「なかったこと」にせず、同一fixtureと閾値で
  原因仮説を検証した結果としてだけ扱う。

### 4.2 後続PoCが依存する前提

```text
Compact Projection
  -> bounded Patch
  -> Issue lifecycle
  -> causal-first Read Repair
  -> derived Graph View
  -> Adaptive Adjudication
  -> Active World Process
```

後続結果はこの順序のcurrent revisionへ依存する。例えばGraph parityはcompact
Projectionとcausal-first repairを前提に測られ、AdaptiveとWorld Processはpre-authored
detailを使う。各aggregateを独立施策の一般効果として加算してはならない。

### 4.3 比較できないsemantic score

AdaptiveとWorld Processは同じXAI modelを使うが、context、control、rubricが異なる。
`0.95`と`1.00`のpreferenceを施策間ランキングに使わない。World Process controlは
active processを除いた強いcontrastであり、live systemに対する効果量ではない。

## 5. Cross-cutting hard invariants

Frozen evidence全体で、対象fixtureについて次は0件だった。

- schema failure
- source mutation
- canonical commit
- runtime integration reference
- observer identity leakage／isolation violation
- out-of-scope repair mutation
- public-history rewrite
- unexplained state change
- side-swap mismatch
- unsupported structured environmental invention

これらはwhole-program proofではない。synthesis時のstatic auditでは、PoC modulesが
`zod`と既存shared domain modulesだけをimportし、filesystem、network、databaseへ直接
依存しないこと、Adaptive／World receiptが`canonicalCommitPerformed=false`をschemaで
強制すること、PoC entry functionsが`backend/src/services`、`frontend/src`、`infra`から
参照されていないことを再確認する。

## 6. LLM call and cost conclusion

設計目標の通常turn topologyはCharacter A、Character B、Narratorの3 callsである。一方、
frozen current-pipeline baselineはsemantic world + sensoryを含む最低4 callsを記録した。

AdaptiveとWorld Process harnessが報告した3-call modelは、pre-authored plan／world detailを
消費するshadow modelであり、live semantic/sensory callを除去した実測ではない。したがって、

```text
通常turn 4 calls -> 3 callsの実現性: indeterminate
expanded turnの生成call／token／latency: indeterminate
```

とする。XAI judge callsは評価costであってbattle-turn costへ混ぜない。

## 7. Recommended next experiment

次に行う価値があるのは、production mutationを伴わないintegrated shadow-turn実験である。

1. 既存battle serviceの固定turn transcriptからcompact Observation、Adjudication、
   Consistency sliceを生成する。
2. authoritative current resultは変更せず、shadow側でPatch／Issue／Read／derived Graph／
   Adaptive／World proposalを一つのturn receiptへ連結する。
3. decisive dependency recall、privacy、authority、outcome non-interference、calls、tokens、
   latency、budget degradationを測る。
4. LLM生成plan／world detailを使うcaseとdeterministic caseを分け、blinded humanまたは
   複数judge reviewを行う。
5. shadow mismatch、unknown fallback、repair refusal、provider failureをraw evidenceとして
   保存する。

この実験でもcanonical commit、DB migration、release、deploymentは別gateとする。
独立graph persistenceは候補に含めない。

## 8. Explicit unknowns and non-claims

- 最終戦闘結果の客観的正しさ
- 世界全体の無矛盾性
- arbitrary prose内の全矛盾検出
- live LLM character-plan grounding
- live world-process discovery／recursive propagation
- Narrator ConsistencyAlertのend-to-end repair loop
- concurrent canonical commitとrollback safety
- production DB、network、provider、load下のlatencyとcost
- long-running issue retentionとhuman operator burden
- release、migration、deployment readiness

`unknown`はfailでもpassでもない。弱い主張へ縮退する設計判断を残し、実測前に確定しない。

## 9. Validation receipt

この節はsynthesis完了時の再検証結果を記録する。

- Focused harness: `55/55 pass`（14 suites）
- Full repository tests: `349/349 pass`（shared 225、backend 108、frontend 13、deployment 3）
- Typecheck: pass（全4 workspaces）
- Build: pass（Viteの500 kB超chunk警告は既知のnon-blocking warning）
- Static privacy audit: runtime integration reference `0`、observer schema内のcanonical
  identifier `0`
- Static authority audit: external I/O／DB／provider import `0`、write authority match `0`、
  `canonicalCommitPerformed=false` guard `11`
- PERT check／DAG／Plan Assurance: pass（diagnostic `0`、21/21 verified and
  conformant、recommended task `0`）

Validationが失敗した場合、matrixのsupported判定で相殺せず、`T_SYNTHESIS`を完了しない。
