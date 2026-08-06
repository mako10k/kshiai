# Conflict-Handling Held-Out Generalization PoC Protocol

Status: protocol fixed; corpus not implemented

Fixed on: 2026-08-06

Plan task: `T_HELD_OUT_PROTOCOL`

Plan:
[battle-pipeline-conflict-handling-generalization.pert](battle-pipeline-conflict-handling-generalization.pert)

Decision input:
[battle-pipeline-conflict-handling-applicability-decision.md](battle-pipeline-conflict-handling-applicability-decision.md)

## 1. Decision boundary

前PoCでsupportedとなった`conflictHandlingV2` classifierについて、以前の7 stratumには含まれない
input envelopeでtrigger recall、no-trigger specificity、`missing`検出、capability dispositionを維持
できるか検証する。

許可するのは、versioned held-out fixture、fixture construction wrapper、既存classifierをbyte変更せず
呼ぶevaluation wrapper、raw evidence、decision recordだけである。既存classifier、既存receipt、過去
evidence、authoritative result、runtime service、BattleState、canonical state、DB、provider設定は変更しない。

本PoCでいうheld-outは「前回7-stratum corpusとその実装taskに含まれなかった固定input envelope」を
意味する。classifier作者や評価者から完全にblindな実世界sample、または未登録full battle turnを意味
しない。この限界をdecisionで削除してはならない。

## 2. Cause and hypothesis

### Remaining uncertainty

前回評価は固定7 stratumを正確に分類したが、次は未検証である。

- capabilityあり／なしとtriggerあり／なしの交差
- triggerはあるが対応evidenceがなく`missing`になるcase
- handlingは成立してもfallback capabilityが使われないcase
- 複数triggerの一部だけにevidenceがあるinterference case
- 5種類のtriggerそれぞれのrecall

### Hypothesis

出力statusを入力へ循環させず、観測済みexecution factsだけを使う現行classifierが、独立に固定した
30 envelopeを正しく分類し、特に8件の`missing`と4件のno-trigger controlを誤魔化さないなら、
classifier semanticsは前回7 stratumの個別暗記より広い構造的効果を持つ。

## 3. Frozen lineage

| Artifact | Frozen identity |
|---|---|
| applicability decision | `docs/battle-pipeline-conflict-handling-applicability-decision.md` |
| decision SHA-256 | `7cd27aac40a43a32db7258411624260d119ee435bb76f4c499ed0b98dc25fac5` |
| applicability raw evidence | `docs/evidence/battle-pipeline-conflict-handling-applicability-evaluation-2026-08-06.json` |
| raw evidence SHA-256 | `facb46a9034a2c1cb81d1e7367d931c9f23e6e39ffb7b5826db90f0da58ed3fc` |
| raw evidence content digest | `9618c8153f3b7d169749b78d2f708aef66e662da381bd8d727df29968588449f` |
| classifier／v2 envelope source | `packages/shared/src/battle-conflict-handling-applicability.ts` |
| classifier source SHA-256 | `f8561c8cda612d75ee5d6af592a1547d7cfbf5ad8d565c72baab75cd729b7905` |
| applicability evaluator | `backend/src/scripts/evaluate-battle-conflict-handling-applicability.ts` |
| evaluator SHA-256 | `278a4386d779472f4e671ef3d5508e3ee19405fadbffad2ed6e76610b4e34134` |
| receipt construction wrapper | `backend/src/scripts/build-battle-conflict-handling-applicability-receipts.ts` |
| wrapper SHA-256 | `8b9c2a8f663f59c1c801011c761368e85f630c50870323f60921d03a6566cf4e` |

いずれかが一致しない場合は自動追従せずstopする。classifier defectが見つかっても、このprotocolの評価中に
classifierを修正しない。結果を`revise`または`unsupported`として固定した後、別versionで扱う。

## 4. Oracle separation

fixture artifactは次をliteral dataとして保持する。

```ts
type HeldOutApplicabilityCase = {
  caseId: string;
  family: string;
  input: ConflictHandlingApplicabilityInput;
  expected: {
    triggerKinds: ConflictHandlingTriggerKind[];
    applicability: "not_applicable" | "required";
    handling: "not_applicable" | "handled" | "missing";
    availability: "unavailable" | "available";
    disposition:
      | "unavailable"
      | "not_needed"
      | "used"
      | "available_unhandled";
  };
};
```

`expected`はclassifier出力から生成しない。corpus builderはclassifier／enricherをimportせず、次節の
登録表をdataへ転記するだけにする。evaluation wrapperだけがfixtureの`input`をclassifierへ渡し、
literal `expected`と比較する。

入力schemaによるvalidationは許すが、schema validation successを分類正解として数えない。fixtureと
classifier sourceのhashをraw evidenceへ記録する。

## 5. Pre-registered 30-case matrix

表の`trigger`と`evidence`はfixtureに投入する観測済みfactを示す。`none`は該当入力が空である。
`capability`は`allowedFallbacks`、`A/H/D`はapplicability／handling／dispositionの期待値である。

| ID | Family | Trigger input | Handling evidence | Capability | Expected trigger kinds | A / H / D |
|---|---|---|---|---|---|---|
| `N01` | no trigger | none | none | none | none | `not_applicable / not_applicable / unavailable` |
| `N02` | no trigger | none | none | unknown | none | `not_applicable / not_applicable / not_needed` |
| `N03` | no trigger | known precondition partial | none | intermediate, unknown | none | `not_applicable / not_applicable / not_needed` |
| `N04` | no trigger | ordinary custom completed | none | defense | none | `not_applicable / not_applicable / not_needed` |
| `S01` | selected fallback | defense proposal selected | selected proposal | defense | selected fallback proposal | `required / handled / used` |
| `S02` | selected fallback | defense proposal selected | selected proposal | defense, intermediate | selected fallback proposal | `required / handled / used` |
| `S03` | selected fallback | defense proposal selected | selected proposal | defense, weak | selected fallback proposal | `required / handled / used` |
| `S04` | selected fallback | defense proposal selected | selected proposal | defense, unknown | selected fallback proposal | `required / handled / used` |
| `C01` | contested claim | contested claim | none | none | contested claim | `required / missing / unavailable` |
| `C02` | contested claim | contested claim | none | unknown | contested claim | `required / missing / available_unhandled` |
| `C03` | contested claim | contested claim | unknown fallback fact | unknown | contested claim | `required / handled / used` |
| `C04` | contested claim | contested claim | weak fallback fact | weak | contested claim | `required / handled / used` |
| `R01` | conflicted read | conflicted read | conflicted read | none | conflicted read | `required / handled / unavailable` |
| `R02` | conflicted read | conflicted read | conflicted read | unknown | conflicted read | `required / handled / available_unhandled` |
| `R03` | conflicted read | conflicted read | conflicted read, open issue | unknown | conflicted read | `required / handled / available_unhandled` |
| `R04` | conflicted read | conflicted read | conflicted read, unknown fallback fact | unknown | conflicted read | `required / handled / used` |
| `D01` | degraded | degraded indeterminate | none | none | degraded indeterminate | `required / missing / unavailable` |
| `D02` | degraded | degraded indeterminate | none | unknown | degraded indeterminate | `required / missing / available_unhandled` |
| `D03` | degraded | degraded indeterminate | unknown fallback fact | unknown | degraded indeterminate | `required / handled / used` |
| `D04` | degraded | degraded indeterminate, conflicted read | conflicted read | unknown | degraded indeterminate, conflicted read | `required / handled / available_unhandled` |
| `B01` | exhausted | budget exhausted | none | none | budget exhausted, degraded indeterminate | `required / missing / unavailable` |
| `B02` | exhausted | budget exhausted | none | intermediate | budget exhausted, degraded indeterminate | `required / missing / available_unhandled` |
| `B03` | exhausted | budget exhausted | intermediate fallback fact | intermediate | budget exhausted, degraded indeterminate | `required / handled / used` |
| `B04` | exhausted | budget exhausted | weak fallback fact | weak | budget exhausted, degraded indeterminate | `required / handled / used` |
| `M01` | interference | selected defense, contested claim | selected proposal only | defense | selected fallback proposal, contested claim | `required / missing / used` |
| `M02` | interference | contested claim, conflicted read | conflicted read | none | contested claim, conflicted read | `required / handled / unavailable` |
| `M03` | interference | degraded, budget exhausted | unknown fallback fact | unknown | budget exhausted, degraded indeterminate | `required / handled / used` |
| `M04` | interference | selected defense, separate degraded receipt | selected proposal only | defense | degraded indeterminate, selected fallback proposal | `required / missing / used` |
| `M05` | interference | contested claim, degraded, conflicted read | conflicted read, open issue | unknown | conflicted read, contested claim, degraded indeterminate | `required / handled / available_unhandled` |
| `M06` | interference | all five trigger kinds | selected proposal, conflicted read, open issue, unknown fallback fact | defense, unknown | all five trigger kinds | `required / handled / used` |

期待分布は固定する。

```text
total                         30
not_applicable                4
required                      26
handled                       18
missing                       8
handling not_applicable       4
disposition unavailable       6
disposition not_needed        3
disposition used              14
disposition available_unhandled 7
multi-trigger interference    6
```

case数、期待分布、labelをcorpus実装後に変更しない。

`AdaptiveActionKindSchema`と`allowedFallbacks`が合法に共有する値は現行sourceでは`defense`だけなので、
selected-fallback familyはすべてdefense proposalを使い、追加capabilityの違いを変数にする。
`intermediate`、`weak`、`unknown`はproposal action kindとして捏造せず、fallback fact strengthまたは
capabilityとしてだけ使用する。

## 6. Six integration extraction controls

classifier-level corpusだけでは`turnInput + legacyReceipt -> conflictHandlingV2`の抽出を検証できないため、
前回のfrozen seven-stratum constructionから次の6 counterfactual controlを作る。authoritative outcome、
source battle state、legacy receipt本体は変更せず、`expectedBoundaries.allowedFallbacks`だけを明示変換し、
enricher後に`conflictHandlingV2`だけを除去したlegacy projectionが元receiptと一致することを要求する。

| ID | Base | Allowed fallback transform | Expected A / H / D |
|---|---|---|---|
| `I01` | `ordinary_fast_action` | none → unknown | `not_applicable / not_applicable / not_needed` |
| `I02` | `interrupted_expanded_action` | intermediate, unknown → none | `not_applicable / not_applicable / unavailable` |
| `I03` | `blocking_local_conflict` | unknown → none | `required / handled / unavailable` |
| `I04` | `exhausted_budget` | intermediate → none | `required / handled / unavailable` |
| `I05` | `remote_rejection` | defense → unknown | `not_applicable / not_applicable / not_needed` |
| `I06` | `interrupted_expanded_action` | intermediate, unknown → defense | `not_applicable / not_applicable / not_needed` |

これらはfull battle turn generalizationを示さない。固定turn envelopeに対するcapability/applicability分離と
legacy projectionのmetamorphic controlである。

## 7. Replay and metrics

30 classifier casesと6 integration controlsを各20 repetitions実行する。合計は720 runsとする。

### Hard invariants

| Metric | Threshold |
|---|---:|
| schema validity | `1.00` |
| frozen lineage/source match | `1.00` |
| source／authoritative mutation | `0` |
| legacy receipt mutation | `0` |
| canonical commit | `0` |
| external LLM／XAI call | `0` |
| dangling applicability ref in integration controls | `0` |

### Primary effectiveness proxies

| Metric | Threshold |
|---|---:|
| exact classifier label accuracy | `30/30` |
| exact trigger-kind set accuracy | `30/30` |
| each registered trigger-kind recall | `1.00` |
| no-trigger specificity | `4/4` |
| `missing` recall | `8/8` |
| handled accuracy | `18/18` |
| capability disposition accuracy | `30/30` |
| expected distribution parity | exact |
| multi-trigger interference accuracy | `6/6` |
| integration extraction controls | `6/6` |
| integration legacy projection parity | `6/6` |
| deterministic stability | `1 digest per case over 20 runs` |
| classifier local p95 | `<= 5ms` on evaluation machine |
| integration enrichment local p95 | `<= 50ms` on evaluation machine |

fixture bytes、receipt bytes、calls、測定可能なlatencyを報告する。generation tokens／generation latencyは
このdeterministic corpusでは対象外であり、未測定をpassへ変換しない。

## 8. Decision rubric

| Label | Meaning |
|---|---|
| `supported` | hard invariantsとprimary effectiveness proxiesがすべてpass |
| `revise` | boundedなclassifier／fixture／extraction gapがあり、固定rubricのまま別versionで修正可能 |
| `unsupported` | authority／mutation boundary違反、またはtrigger false negativeが固定corpusの20%以上 |
| `indeterminate` | fixture、hash、sample、measurement、comparisonのいずれかが不足 |

`unsupported`条件はprimary thresholdを緩める理由に使わない。1件でもprimary failureなら最低でも
`revise`であり、supportedにはしない。

## 9. Stop conditions

- frozen lineageのhash／digest不一致
- classifier source、既存v2 receipt、過去evidenceの変更が必要
- expected labelをclassifier出力から生成する必要がある
- case削除、期待分布変更、threshold低下が必要
- runtime wiring、persistence、canonical writeが必要
- external LLM／XAIによる意味判定が必要

stop時はartifactを都合よく修復せず`indeterminate`または該当decisionを記録する。

## 10. Non-claims

- 未登録full battle turnに対する実世界recall／specificity
- 実際のturn分布で重み付けしたprecision、recall、false-positive rate
- 戦闘結果の客観的正しさ
- 世界全体の無矛盾性
- psychology／experienceのsemantic grounding
- runtime、persistence、release、deployment readiness
- production latencyまたはlive LLM call削減

このPoCがsupportedでも、runtime採用には実turn shadow observationと独立した承認gateが必要である。
