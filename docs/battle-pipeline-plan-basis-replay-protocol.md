# Versioned Plan-Basis Corrective Replay Protocol

Status: protocol fixed; v2 delta artifact not created

Fixed on: 2026-08-06

Plan task: `T_REVISION_PROTOCOL`

Plan: [battle-pipeline-plan-basis-replay.pert](battle-pipeline-plan-basis-replay.pert)

Decision input: [battle-pipeline-integrated-shadow-decision.md](battle-pipeline-integrated-shadow-decision.md)

## 1. Decision boundary

この実験は、integrated shadow v1で`revise`となった
`interrupted_expanded_action`のstructural plan-basis wiringだけをversioned deltaで修正し、
同じ7 stratum、20 repetitions、threshold、rubricで再評価する。

```text
immutable v1 transcript
  + strict v2 plan-basis delta
  -> derived in-memory v2 transcript
  -> unchanged integrated shadow evaluator
  -> v1/v2 field and semantic-control comparison
  -> same-rubric decision
```

許可するのはlocal fixture、in-memory derived input、shadow receipt、versioned raw evidenceだけである。
v1 artifactの上書き、Adaptive validatorの変更、runtime service wiring、BattleState mutation、
canonical commit、DB migration、provider順変更、release、deploymentは許可しない。

## 2. Hypothesis and non-claims

### Corrective hypothesis

proposalに既に固定されているobservation／psychology／experience refsを二つの既存stepへ明示的に
接続すれば、Adaptive validatorを変更せずにplanがstructural grounding contractを満たし、
approachまでの最長成立prefix、実行由来effect、exposure costを保持したpartial receiptになる。

### Control hypothesis

delta対象外の6 stratumは、fixture-version lineageを正規化したsemantic receipt digestがv1と一致し、
hard invariant、dependency、component、conflict、temporal、call-budget evidenceを維持する。

### Non-claims

- psychology／experience refの背後にある内容がstepへ意味的にgroundedしていること
- LLM生成planの品質または未知turnへの一般化
- 最終戦闘結果の客観的正しさ
- 世界全体の無矛盾性
- live 4-callから3-callへの削減
- production latency、persistence、provider、release、deployment readiness

この実験が確認できるのは、既存ref categoryと詳細planのstructural wiringだけである。

## 3. Immutable parent evidence

| Evidence | Frozen identity |
|---|---|
| v1 transcript path | `docs/evidence/battle-pipeline-integrated-shadow-transcript-baseline-2026-08-06.json` |
| v1 fixture version | `battle-pipeline-integrated-shadow-transcripts-v1` |
| v1 file SHA-256 | `1b9c9e3b502b9e32bc96e5848ab5228f9f0d1c44ab4310a7b21dd268c6ed689a` |
| v1 content digest | `bd047d71f4bee6736aa645a5fea690cede67b1c147654630c4f8ad63b7abd882` |
| v1 evaluation SHA-256 | `1390c3db03707e9905cbb798b437b47705c4afcd5b0a742be76c1c7c703e145c` |
| v1 evaluation content digest | `dcba50ef201b7741a99a73473d67823703fdfa82a5014ff3ad94c42b3f5d1dd3` |
| integrated implementation SHA-256 | `e70d95ab45f42c00eb6b28387985121bf72c5e40fe13780dd5301b48ba9cc2b3` |
| v1 evaluator SHA-256 | `4f054462ca928bf48d9f45fab1e7287a54b025acea5702e8bf7a2c3b51b29a69` |

delta loaderはfile SHAとcontent digestを適用前に検証する。どちらかが一致しない場合はfail closedし、
近似parentや最新ファイルへ自動追従しない。

## 4. Versioned delta contract

次taskはfull v1 reportを複製保存せず、小さなstrict delta artifactを作る。

```ts
type PlanBasisReplayDelta = {
  schemaVersion: 1;
  mode: "integrated_shadow_plan_basis_delta";
  deltaVersion: "battle-pipeline-integrated-shadow-plan-basis-delta-v2";

  parent: {
    path: string;
    fixtureVersion: "battle-pipeline-integrated-shadow-transcripts-v1";
    fileSha256: string;
    contentDigest: string;
  };

  targetFixtureVersion: "battle-pipeline-integrated-shadow-transcripts-v2";
  operations: PlanBasisAppendOperation[];
  unchangedScenarioIds: string[];
  provenance: Record<string, unknown>;
  integrity: {
    algorithm: "sha256";
    basis: "canonical delta excluding integrity";
    contentDigest: string;
  };
};

type PlanBasisAppendOperation = {
  operation: "append_basis_ref";
  scenarioId: "interrupted_expanded_action";
  proposalRef: "proposal.interrupted.a";
  stepId: string;
  basisCategory: "psychology" | "experience";
  expectedBefore: string[];
  addedRef: string;
  expectedAfter: string[];
};
```

schemaはstrictとし、unknown field、重複operation、重複ref、parent外ref、対象不在、複数対象matchを
rejectする。artifactは`wx`相当で新規作成し、上書きしない。

## 5. Exact permitted domain delta

operationは次の2件を、この順序で固定する。

| Step | Category | Before | Added ref | After |
|---|---|---|---|---|
| `step.interrupted.approach` | psychology | `observation:proposal.interrupted.a` | `psychology:character.a` | observation、psychology |
| `step.interrupted.strike` | experience | `observation:proposal.interrupted.a` | `experience:character.a` | observation、experience |

JSON-levelでは、各stepの`basisRefs`末尾へ1 refずつ追加する。既存observation refの削除、並べ替え、
置換は行わない。追加refは同じproposalの`characterBasis`内の対応categoryに既に存在しなければ
ならない。

次はdomain deltaに含めない。

- step、branch、abort conditionの追加または削除
- precondition、fact、effect、cost、exclusive claimの変更
- proposal、intent、latent hint、expansion reason、budgetの変更
- source BattleState、authoritative result、world input、consistency inputの変更
- expected dependency、boundary、scenario hypothesis、thresholdの変更

## 6. Derived v2 construction

loaderは次の順序を守る。

1. v1 file SHA-256とcanonical content digestを検証する。
2. delta schemaとdelta content digestを検証する。
3. v1をdeep cloneし、parent objectをmutationしない。
4. stable IDでscenario、proposal、stepを各1件だけ解決する。
5. `expectedBefore`完全一致とcategory membershipを検査する。
6. 2 operationを適用する。
7. `fixtureVersion`を同長の`battle-pipeline-integrated-shadow-transcripts-v2`へ変更する。
8. derived reportのintegrity content digestを再計算する。
9. allowed field list以外のv1/v2差分が0件であることを検査する。

derived v2は評価器のin-memory inputであり、v1のcapture provenanceを置き換えない。evaluation
report側へbase path／SHA／content digestとdelta path／SHA／content digest、derived content digest、
field-level diffを別々に記録する。

## 7. Unchanged controls

対象外の6 stratumを固定する。

- `ordinary_fast_action`
- `remote_rejection`
- `simultaneous_terminal_action`
- `active_world_process`
- `blocking_local_conflict`
- `exhausted_budget`

これらのscenario input objectはv1とbyte-equivalentなcanonical JSONでなければならない。

receipt比較では、全string value内のfixture-version token
`battle-pipeline-integrated-shadow-transcripts-v1|v2`だけを
`battle-pipeline-integrated-shadow-transcripts-vN`へ置換してからcanonical SHA-256を求める。
他fieldを削除、丸め、弱化しない。target versionをv1と同長に固定するため、size metricの差も
version文字列長で相殺しない。

6 controlすべてでnormalized semantic receipt digestがv1と一致しなければ、対象外regressionとして
stopする。

## 8. Registered interrupted behavior

v2の`interrupted_expanded_action`は次をすべて満たす必要がある。

```text
level: 2
resolution: expanded
outcome: partial
completedSteps: [step.interrupted.approach]
failedStep: step.interrupted.strike
failureReason: precondition_failed
effects: [effect.interrupted.approached]
costs: [cost.interrupted.exposure]
fallbackFact: absent
```

さらに、`input-fact.interrupted.approached`だけをassertする1 bounded shadow patch、
`no_issue_found` audit、approach stepからfactへのcreated causal linkを要求する。strike effect、HP loss、
後続step、canonical commitは0でなければならない。

protocol固定前のread-only feasibility checkでは、この2 ref追加だけで上記receiptへ到達することを
1回確認した。これはprimary evaluationではなく、threshold調整、artifact生成、20-run測定、
supported判定には使用しない。

## 9. Unchanged evaluation thresholds

v1 protocolのthresholdを変更しない。

### Hard invariants

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

### Primary proxies and corrective gates

| Metric | Threshold |
|---|---:|
| expected dependency recall | `1.00` |
| component receipt coverage | `1.00` |
| explicit conflict／unknown handling | `1.00` |
| deterministic stability | `1 distinct digest per case over 20 runs` |
| integrated local p95 | `<= 50ms` on the evaluation machine |
| registered behavior | `7/7` |
| normalized unaffected-control parity | `6/6` |
| unexpected v1/v2 input field delta | `0` |

receipt、projection、component payload bytesとcalls／tokens測定状態は必ず報告するが、閾値を
追加しない。generation tokensとgeneration latencyを未測定からpassへ変更しない。

## 10. XAI and review rule

protocol、delta construction、deterministic replayではexternal LLMとXAIを呼ばず、期待値をstrict
fieldから判定する。今回の問いは文章品質や意味的好みではなく、固定ref category、実行prefix、
effect、cost、patch、control parityで決定できる。

XAIを呼ばないことは、心理・経験の意味的groundingを確認済みとする根拠ではない。その品質は
実contentを含む別protocolの対象とする。

## 11. Decision rubric and stop conditions

| Label | Meaning |
|---|---|
| `supported` | hard invariants、primary proxies、7/7 behavior、6/6 control parity、delta contractがすべてpass |
| `revise` | 新しいbounded causeがあり、rubricを変えず再検証できる |
| `unsupported` | authority／privacy／causal regression、delta逸脱、または限定修正で効果がない |
| `indeterminate` | artifact、measurement、sample、またはcomparisonが不足する |

次の場合は実装または評価を止める。

- v1 hash／digest不一致
- exact 2-operation以外のdomain deltaが必要
- validatorまたはthresholdを緩和しなければ期待prefixへ到達しない
- 6 controlのnormalized parity failure
- hard invariant failure
- external LLM、runtime、persistence、canonical writeが必要

`unknown`、`revise`、`indeterminate`をsupportedへ読み替えない。

## 12. Execution plan and forecast

| Task | Points | Deliverable |
|---|---:|---|
| `T_REVISION_PROTOCOL` | 1p | このprotocol、assured PERT、exact delta contract |
| `T_VERSIONED_CORRECTIVE_REPLAY` | 1p | strict delta、loader、v1/v2 diff、regression |
| `T_REPLAY_EVAL_DECISION` | 1p | 7×20 raw evidence、control parity、same-rubric decision |

velocityは新しい独立person-day実績がないため`453p/128d`のまま維持する。全3pは約`0.848d`、
各1pは約`0.283d`である。forecastはdeadline、実績時間、または後続taskの開始承認ではない。

## 13. Validation receipt

- immutable parent file SHA／content digest: pass
- exact pre-delta basis arrays and source category membership: pass
- read-only one-run construction feasibility: expected partial prefix observed
- full repository tests: `352/352 pass`（shared 225、backend 111、frontend 13、deployment 3）
- full typecheck: pass（全workspacesとdeployment）
- full build: pass（Viteの500 kB超chunk warningはnon-blocking）
- external LLM／XAI calls: `0 / 0`
- v2 delta／derived transcript／primary evaluation artifact created: `0 / 0 / 0`
- runtime／DB／provider／canonical state changes: `0`
- PERT format／check／DAG／Plan Assurance: diagnostic `0`、current outcome
  `conformant`、next task `verified`

次の推奨taskは`T_VERSIONED_CORRECTIVE_REPLAY`（1p、約`0.283d`）である。このprotocol完了は
delta artifact生成、replay実装、140-run評価を自動承認しない。
