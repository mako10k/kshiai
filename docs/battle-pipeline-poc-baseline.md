# 戦闘パイプラインPoC baseline

Status: frozen local baseline
Frozen on: 2026-08-06
Plan task: T_BASELINE
Design: [battle-pipeline-revised-design.md](battle-pipeline-revised-design.md)
PoC plan: [battle-pipeline-revision.pert](battle-pipeline-revision.pert)

## 1. 結論と限界

後続PoCとの比較に使うcorpus、評価指標、閾値、判定規約、現行ローカル出力を固定した。
このbaselineは、最終的な戦闘結果が客観的に正しいことを保証しない。

- schema、権限、privacy、atomicity、因果参照、side-neutralityはhard invariantとして
  pass/failで扱う。
- 納得性、局所整合性、因果の分かりやすさはproxyであり、blind comparisonによって
  後続PoCと比較する。
- 人手評価は、比較対象となるPoC出力がまだないため unmeasured とした。0点やpassへ
  読み替えない。
- live XAIは再実行していない。2026-08-05に固定済みの主系証跡をSHA-256確認の上で
  historical evidenceとして参照した。
- production state、provider設定、DB、release、deploymentは変更していない。

## 2. 固定artifact

| Artifact | 用途 | SHA-256 |
|---|---|---|
| [battle-pipeline-poc-corpus-v1.json](evidence/battle-pipeline-poc-corpus-v1.json) | scenario、指標、閾値、判定規約 | c467fd9d3e76f4a72d09efe171ee36181ed468d9c883482436312ae77f9b9740 |
| [battle-pipeline-poc-baseline-2026-08-06.json](evidence/battle-pipeline-poc-baseline-2026-08-06.json) | 現行pipelineの測定結果 | 1617cc68535ace9af570a826cee8a916075f81ee3200c4c03b51c8f76bf90e1b |
| backend/src/scripts/evaluate-battle-pipeline-baseline.ts | 再実行可能なlocal harness | de9ac6f8bc87618e859a2cf87d5f39d8620bff6f414febc622dfbb73fec3fdab |
| [perception-xai-grok-4-fast-non-reasoning-v10-20260805-fit-gap.json](evidence/perception-xai-grok-4-fast-non-reasoning-v10-20260805-fit-gap.json) | 既存XAI primary evidence | b42c572fbb926f08f5e86e10c2c48fb8130a5a755127d74d5a4d921981d07052 |

corpusまたはharnessを後から変えた場合、同じbaseline名を使い続けない。versionを上げ、
旧artifactを保持し、比較不能になったmetricを明記する。

## 3. 評価プロトコル

### 3.1 判定label

| Label | 意味 |
|---|---|
| supported | 適用対象のhard invariantがすべてpassし、primary proxyが事前閾値を満たし、cost ceilingを超えない |
| revise | 方向性は有用だが、局所的欠陥、閾値不足、cost超過に対する限定的な修正仮説がある |
| unsupported | genuine hard invariant違反、primary proxyの悪化、または宣言scopeで有用な効果がない |
| indeterminate | 未測定、標本不足、測定矛盾、noise、または施策単独の効果を分離できない |

revise、unsupported、indeterminate の場合は後続PoCを自動開始しない。
計画上の次施策はblockedのままにし、corpusや仮説を黙って変更せず再計画する。

### 3.2 比較方法

1. corpus、harness、baseline artifactのhashを確認する。
2. 変更前後を同じscenarioと反復数で実行する。
3. hard invariantを先に評価し、proxy改善で相殺しない。
4. 決定的経路は20反復のoutcome digestとlatency分布を比較する。
5. LLM経路は最低3反復を行い、provider、model、call error、token、latencyを分離する。
6. 納得性はbaseline/PoCの由来を隠した最低20組のpairwise reviewで比較する。
7. scenario単位の生データを保持し、aggregateだけで結論を出さない。

blind reviewでは次を問う。

- 既知の世界factとruleに、どちらがよりよく従っているか。
- action、effect、失敗代償の因果を、どちらが理解しやすいか。
- unsupported factが少ないのはどちらか。
- unknownな状態を無理に断定していないのはどちらか。

同点と判断不能を許容する。選好率だけで客観的正しさを主張しない。

## 4. 固定scenario

### 4.1 Local harness

| Scenario | 主な境界 |
|---|---|
| ordinary_attack | 通常action、event ID、mechanical evidence、raw数値非開示 |
| remote_out_of_range | 別area、到達不能、fallback、遠隔damage非発生 |
| simultaneous_mutual_ko | 同一snapshot、相討ち、atomic bucket |
| faster_interruption | 速度順、後続revalidation、skip |
| environment_hit_both | character由来でない環境effect、target別因果 |
| invalid_world_transition_atomic | invalid transition、revision維持、部分commit禁止 |
| legacy_compatibility | world/perception再構築、由来不明speech破棄 |
| narration_style_independence | 表示styleからmechanicsへのfeedback禁止 |
| side_swap_symmetry | A/B入替え時のlogical outcome同値 |

### 4.2 Existing evidence / test references

| Scenario | 現時点の扱い |
|---|---|
| combined_perception_primary | 固定済みXAI primary evidenceをhash検証して参照 |
| provider_failure_fallback | local fallback・consumer isolation testで検証 |
| ambiguous_free_action_concretization | local free-action・causality testで検証 |
| narrative_plausibility | historical contextのみ。blind comparisonまでは unmeasured |

## 5. 現行baseline結果

Local harnessは9 scenarioを各20回、合計180回実行した。

| Metric | Baseline |
|---|---:|
| hard check pass | 1040 |
| hard check fail | 0 |
| schema validity | 1.0 |
| authority violation | 0 |
| privacy leak | 0 |
| atomicity failure | 0 |
| causal reference gap | 0 |
| side-swap mismatch | 0 |
| unsupported structured claim | 0 |
| scenarioごとのdistinct outcome digest | すべて1 |
| external LLM call | 0 |
| human plausibility | unmeasured |
| new projection bytes | null |

このpassは、fixtureで調べたhard invariantに対するbaselineである。未発見矛盾がないこと、
自由記述の結果が正しいこと、または現行pipelineが新設計より優れていることを意味しない。

local p95は約2.9–16.3ms、serialized BattleState はscenarioにより約12.9–13.5KBだった。
legacy reconstructionだけは約6.2KBのlegacy入力から約13.0KBへ補完された。latencyは
測定machine固有であり、同じ環境での相対比較にだけ使う。

## 6. 現行LLM call/cost baseline

通常turnのcontract topologyは、fixed narration focusの場合でも最低4 callである。

    semantic world + sensory  1
    character A               1
    character B               1
    narrator                  1

次は条件付きで追加される。

- fluid narration focus: +1
- free-action adjudication: +1
- turn-limit adjudicationとpresentation: +2

既存XAI combined perception evidenceは9 sampleで、schema/correctness/coverageが1.0、
attribution errorとidentity leakageが0、call errorが0だった。mean latencyは
6632.11ms、p95は9861ms、mean total tokensは4464.89である。この値は
2026-08-05の固定証跡であり、現在のlive性能として更新確認した値ではない。

## 7. 再実行

    npm run eval:battle-pipeline-baseline --workspace=backend
    npm run eval:battle-pipeline-baseline --workspace=backend -- \
      --output docs/evidence/<new-baseline-name>.json

--output は既存fileを上書きしない。比較用に再実行する場合は新しいartifact名を使う。

今回の検証:

    npm run typecheck --workspace=backend
    node --import tsx --test \
      backend/src/scripts/evaluate-battle-pipeline-baseline.test.ts
    node --import tsx --test \
      backend/src/llm/fallback.test.ts \
      backend/src/services/battle-consumer-wiring.test.ts
    node --import tsx --test \
      backend/src/services/free-action-service.test.ts \
      packages/shared/src/battle-causality.test.ts
    perttool document check docs/battle-pipeline-revision.pert --format json
    perttool dag analyze docs/battle-pipeline-revision.pert --format json

## 8. 次の判断境界

BASELINE_READY の次は T_PROJECTION_POC である。Projection PoCでは現行結果を
authoritative controlとして維持し、read-only adapterだけを追加する。最初に測るのは、

- decisive fact recall
- irrelevant fact/byte reduction
- observer isolationとcanonical ID leakage
- baseline outcome mismatch
- projection生成latencyとsize bound

である。Projection PoCの構築自体は有効性の証拠ではなく、その後の
T_PROJECTION_EVAL が継続判断を行う。
