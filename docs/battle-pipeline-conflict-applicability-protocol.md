# Conflict-Handling Applicability PoC Protocol

Status: protocol fixed; v2 receipt not implemented

Fixed on: 2026-08-06

Plan task: `T_APPLICABILITY_PROTOCOL`

Plan: [battle-pipeline-conflict-applicability.pert](battle-pipeline-conflict-applicability.pert)

Decision input:
[battle-pipeline-plan-basis-corrective-replay-decision.md](battle-pipeline-plan-basis-corrective-replay-decision.md)

## 1. Decision boundary

このPoCは、`allowedFallbacks`という利用可能な能力を、conflict／unknown handlingが必要だったという
事実へ変換している現行contractを置き換えられるかだけを検証する。

```text
fallback capability
  != handling applicability

observed conflict／unknown trigger
  -> applicability
  -> matching handling evidence
  -> handled／missing
```

許可するのは、local shadow receiptへのversioned additive envelope、deterministic classifier、unit fixture、
evaluation wrapper、versioned raw evidence、decision recordだけである。既存v1 receipt fieldと過去evidenceは
変更しない。runtime service wiring、BattleState mutation、canonical commit、DB、provider、release、deploymentは
対象外とする。

## 2. Cause and hypothesis

### Observed cause

現行実装は次の式で`required`を作る。

```ts
const conflictHandlingRequired = allowedFallbacks.length > 0;
```

corrective v2 replayでは、`interrupted_expanded_action`が既知のprecondition failureによる正当な
`partial`を返し、fallbackを必要としなかった。一方でfixtureに`intermediate`と`unknown`の利用許可が
あるため`required=true`、handling evidenceがないため`explicit=false`となった。これにより7 stratum、
20 repetitionsの140 runs中120 runsだけがpassし、rateは`0.857143`だった。

### PoC hypothesis

能力、適用トリガー、handling evidenceを別fieldとして記録し、事前登録した7 stratumを正しく分類すれば、
実際にconflict／unknown handlingが必要なcaseを除外せず、不要なcaseを偽陰性にせずに評価できる。

### Non-claims

- 戦闘結果の客観的正しさ
- 未登録turnへの分類一般化
- 世界全体の無矛盾性
- semantic psychology grounding
- production latencyまたはlive LLM call削減
- runtime、persistence、release、deployment readiness

## 3. Frozen evidence and lineage

| Evidence | Frozen identity |
|---|---|
| corrective decision | `docs/battle-pipeline-plan-basis-corrective-replay-decision.md` |
| decision SHA-256 | `5dfeb6b55f47d72357139dfde4a3898bbe0c5534c6dfc11c19df58e124857fb4` |
| corrective v2 evaluation | `docs/evidence/battle-pipeline-plan-basis-corrective-replay-evaluation-v2-2026-08-06.json` |
| evaluation SHA-256 | `55f5312726c0c425f106f50a80d042d4424249a15e5b8dd36370561b8e313e73` |
| evaluation content digest | `524fad02bc27c9c87b1a2e62b238a79813d4d3e375dabcd38ad568a7ddc7074e` |
| integrated receipt implementation | `packages/shared/src/battle-integrated-shadow-turn.ts` |
| implementation SHA-256 | `e70d95ab45f42c00eb6b28387985121bf72c5e40fe13780dd5301b48ba9cc2b3` |
| integrated evaluator | `backend/src/scripts/evaluate-battle-integrated-shadow-turn.ts` |
| evaluator SHA-256 | `1503277d2c23baad60541de2c081e430912f56e30f84347580b79df86eb2f970` |
| corrective wrapper | `backend/src/scripts/evaluate-battle-plan-basis-corrective-replay.ts` |
| wrapper SHA-256 | `c0f7c546b3222c20db429c597d2d4fc56fc46e58984511b2a4de83a6789bec09` |

評価SHAは実ファイル、content digestはreportの`integrity.contentDigest`を指す。いずれかが一致しない場合、
自動追従せずfail closedする。

## 4. Versioned receipt contract

次taskでは現行`conflictHandling`を削除または再解釈せず、既存integrated receiptを包むlocal derived
receiptへ次のenvelopeを追加する。

```ts
type IntegratedShadowTurnReceiptV2 = IntegratedShadowTurnReceipt & {
  conflictHandlingV2: ConflictHandlingV2;
};
```

既存`buildIntegratedShadowTurnReceipt`、既存schema、既存evaluator、既存corrective wrapperはbyte変更しない。
新しいdeterministic classifier／enricherと新しいevaluation wrapperだけを追加し、frozen parent sourceを
そのまま呼び出す。legacy parityではderived receiptから`conflictHandlingV2`だけを除去し、frozen
evaluation内のrepresentative receiptとcanonical digestを比較する。

```ts
type ConflictHandlingV2 = {
  schemaVersion: 2;

  capability: {
    allowedFallbacks: string[];
    availability: "unavailable" | "available";
    disposition:
      | "unavailable"
      | "not_needed"
      | "used"
      | "available_unhandled";
  };

  applicability: {
    status: "not_applicable" | "required";
    triggerKinds: ConflictHandlingTriggerKind[];
    triggerRefs: string[];
  };

  handling: {
    status: "not_applicable" | "handled" | "missing";
    evidenceKinds: ConflictHandlingEvidenceKind[];
    evidenceRefs: string[];
  };
};

type ConflictHandlingTriggerKind =
  | "selected_fallback_proposal"
  | "contested_claim"
  | "conflicted_read"
  | "degraded_indeterminate"
  | "budget_exhausted";

type ConflictHandlingEvidenceKind =
  | "selected_fallback_proposal"
  | "fallback_fact"
  | "conflicted_read"
  | "consistency_issue";
```

arrayは重複を除き安定sortする。refは既存receipt内で実在するproposal、claim、slice、fact、issueを
参照し、dangling refを許可しない。

## 5. Applicability rules

`allowedFallbacks`は能力を表すだけで、単独ではtriggerにならない。次の観測済み実行事実だけを
applicability triggerにする。

| Trigger | Deterministic evidence |
|---|---|
| selected fallback proposal | proposalの`actionKind`が`allowedFallbacks`のaction-kind entryと一致 |
| contested claim | Adaptive resultの`contestedClaimRefs`が非空 |
| conflicted read | canonical readのconsistency levelが`conflicted` |
| degraded indeterminate | Adaptive receiptが`resolution=degraded`かつ`outcome=indeterminate` |
| budget exhausted | Adaptive receiptの`failureReason=budget_exhausted` |

triggerが1件以上なら`required`、0件なら`not_applicable`とする。`precondition_failed`、`partial`、
expanded action、同時実行、active world processそれ自体はtriggerではない。

handling statusは次のように求める。

- trigger 0件: `not_applicable`
- trigger 1件以上、かつ対応するproposal／fallback fact／conflicted read／issue evidenceあり: `handled`
- trigger 1件以上、かつ対応evidenceなし: `missing`

`degraded_indeterminate`または`budget_exhausted`という結果ラベルだけをhandling evidenceに使わない。
これらは必要性を示すが、fallback fact、conflicted read、issue等がなければ`missing`である。

capability dispositionは次のように求める。

- allowed 0件: `unavailable`
- allowedあり、applicabilityなし: `not_needed`
- allowedあり、対応fallback proposalまたはfallback factあり: `used`
- allowedあり、applicabilityあり、対応fallbackなし: `available_unhandled`

能力がない場合でも実際のconflict／unknown triggerを除外しない。

## 6. Pre-registered seven-stratum classification

| Stratum | Capability | Disposition | Applicability | Handling | Fixed reason |
|---|---|---|---|---|---|
| `ordinary_fast_action` | unavailable | unavailable | not_applicable | not_applicable | triggerなし |
| `remote_rejection` | available | used | required | handled | `defense` fallback proposalを選択 |
| `simultaneous_terminal_action` | unavailable | unavailable | not_applicable | not_applicable | contested claim、conflicted read、degradationなし |
| `interrupted_expanded_action` | available | not_needed | not_applicable | not_applicable | 既知precondition failureのpartialでfallback不要 |
| `active_world_process` | unavailable | unavailable | not_applicable | not_applicable | character proposalとconflict／unknown triggerなし |
| `blocking_local_conflict` | available | used | required | handled | contested claim、conflicted read、unknown fallback |
| `exhausted_budget` | available | used | required | handled | budget exhaustionとintermediate fallback |

applicable caseは正確に3 stratumとする。分類実装後にこの期待値、分母、thresholdを変更しない。

## 7. Counterexample fixtures

unit testは最低限、次の独立caseを固定する。

1. allowedあり、既知precondition failure、partial、fallbackなし
   → `not_applicable`／`not_needed`
2. contested claimあり、能力なし、handling evidenceなし
   → `required`／`missing`
3. contested claimとunknown fallback factあり
   → `required`／`handled`
4. degraded indeterminate、能力あり、fallback factなし
   → `required`／`missing`／`available_unhandled`
5. triggerなし、能力なし
   → `not_applicable`／`unavailable`

classifierの返したstatusをclassifier自身の入力へ使う循環判定は禁止する。

## 8. Replay and metrics

final taskはcorrective v2 transcriptを同じ7 stratum、各20 repetitions、計140 runsで評価する。

### Hard invariants

| Metric | Threshold |
|---|---:|
| schema validity | `1.00` |
| source mutation | `0` |
| authoritative outcome change | `0` |
| canonical commit | `0` |
| observer canonical-ID leakage | `0` |
| out-of-scope repair mutation | `0` |
| dangling causal／component／applicability ref | `0` |
| temporal atomicity failure | `0` |
| external LLM／XAI call | `0` |

### Primary applicability proxies

| Metric | Threshold |
|---|---:|
| pre-registered classification accuracy | `7/7` |
| applicable stratum count | exactly `3` |
| applicable handling rate | `handled / required = 1.00` |
| capability disposition accuracy | `7/7` |
| legacy receipt parity after removing only `conflictHandlingV2` | `7/7` |
| registered battle behavior | `7/7` |
| deterministic stability | `1 distinct digest per case over 20 runs` |
| integrated local p95 | `<= 50ms` on the evaluation machine |

旧`explicitConflictOrUnknownHandlingRate`は比較用diagnosticとして残すが、新contractのprimary gateには
使用しない。これは旧decisionを遡及的にsupportedへ変更するものではない。新protocol、新receipt、
新raw evidenceに対してだけ新rubricを適用する。

receipt、projection、component payload bytes、calls／tokens測定状態を報告する。generation tokensと
generation latencyを未測定からpassへ変更しない。

## 9. XAI rule

本PoCはstructured receiptの分類問題なので、protocol、実装、replayでXAIまたは外部LLMを呼ばない。
free-textの意味判定が必要になった場合は自動で呼ばず、このPoCをstopして別protocolへ切り出す。

## 10. Decision rubric and stop conditions

| Label | Meaning |
|---|---|
| `supported` | hard invariantsとprimary applicability proxiesがすべてpass |
| `revise` | boundedなclassifier／fixture不足があり、固定rubricのまま再検証可能 |
| `unsupported` | authority、privacy、causal regression、または限定修正で効果なし |
| `indeterminate` | artifact、measurement、comparison、またはsampleが不足 |

次の場合は実装または評価を止める。

- frozen evidenceのhash／digest不一致
- thresholdを下げる、applicable caseを除外する、または期待分類を書き換える必要がある
- `allowedFallbacks`単独または出力statusへの循環参照でしか分類できない
- legacy receipt parityまたはhard invariantが失敗する
- 既存v1 field、過去raw evidence、authoritative resultの変更が必要
- external LLM／XAI、runtime wiring、persistence、canonical writeが必要

`not_applicable`は「handlingが成功した」を意味しない。`not_needed`は「利用可能なfallbackを実行時に
使う必要がなかった」というcapability dispositionだけを意味する。
