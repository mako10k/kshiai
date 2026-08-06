# Actual-Turn Read-Only Shadow Observation PoC Protocol

Status: protocol fixed; implementation and capture not authorized

Fixed on: 2026-08-06

Plan task: `T_OBSERVATION_PROTOCOL`

Plan:
[battle-pipeline-actual-turn-shadow-observation.pert](battle-pipeline-actual-turn-shadow-observation.pert)

Decision input:
[battle-pipeline-conflict-handling-generalization-decision.md](battle-pipeline-conflict-handling-generalization-decision.md)

## 1. Decision boundary

held-out generalization PoCで`supported`となった`conflictHandlingV2`について、固定fixtureではなく実際に
解決されたturnから、戦闘結果、LLM call topology、canonical state、DBを変更せず、privacy-safeな
observation envelopeを取得・検証・集計できるかを調べる。

このPoCが判定するのはobservation方式の成立性と観測分布である。実turnにoracle labelは存在しないため、
classifierの客観的accuracy、recall、specificity、戦闘結果の正しさは判定しない。

計画全体を承認しても、runtime capture hookの実装・有効化は承認されない。offline adapter完成後に、
exact hook point、取得field、最大件数、保存先、失敗時挙動、rollbackを固定し、
`T_CAPTURE_AUTHORITY_DECISION`でuserの明示判断を得る。承認されなければsample capture以降へ進まない。

## 2. Confirmed source limitation

現在のpersisted `BattleTurnRecord`は、turn、temporal resolution、world impact、resolved actions、
free-action receipt、events、parameter change、character cognitionを保持する。一方、
`ConflictHandlingApplicabilityInput`に必要な次は保持しない。

- adaptive receiptのresolution、outcome、failure reason、fallback fact
- contested claim refs
- purpose-scoped read coherence result
- blocking consistency issue refsとissue lifecycle
- turn時点の`allowedFallbacks`

また`BattleState`は最新50 turn recordsまでを保持するが、各turnの完全なbefore-state snapshotは保持しない。
したがって、persisted final `BattleState`または`BattleTurnRecord`だけから不足fieldを推測して
classifier inputを再構築してはならない。

offline adapterは既存stateを読んだ場合、取得可能fieldと不足fieldを明示し、完全なobservation envelopeを
作れないrecordを`insufficient_source`とする。public narration、event prose、character cognitionから
不足fieldを意味推論しない。

## 3. Frozen lineage

| Artifact | Frozen identity |
|---|---|
| held-out decision | `docs/battle-pipeline-conflict-handling-generalization-decision.md` |
| decision SHA-256 | `39c83f57c4f93b1ba555240f20d61e7257a186a4165726169cfbc04c49a2c6de` |
| held-out raw evidence | `docs/evidence/battle-pipeline-conflict-handling-held-out-evaluation-2026-08-06.json` |
| raw evidence SHA-256 | `3f9c0d2a0ce08cd425d3ad528228abce65c5304bc233e08f5bb0c48d047aa67b` |
| raw evidence content digest | `2f1a793ba6a2c674553bf00e9146b7f8438de7900929b0b0e90ad157362fa8ca` |
| classifier source | `packages/shared/src/battle-conflict-handling-applicability.ts` |
| classifier SHA-256 | `f8561c8cda612d75ee5d6af592a1547d7cfbf5ad8d565c72baab75cd729b7905` |
| persisted turn contract | `packages/shared/src/battle.ts` |
| persisted turn contract SHA-256 | `2bc0bbb4372168d1a12abd9332c8e00f0e86f42c143eaf0800e7e40b59d3e494` |
| authoritative battle service | `backend/src/services/battle-service.ts` |
| battle service SHA-256 | `65604abce2bdb4ae828a321611be41337451a7259c8cfa27aac21152678d0a10` |
| battle repository | `backend/src/repositories/battles.ts` |
| battle repository SHA-256 | `2bd12b2d08f84fb583a7866ce39c978b68a5ec162043ba6a03462976379da344` |

protocol、adapter、evaluationはこのlineageを自動更新しない。いずれかが変わった場合はstopし、別versionで
re-baselineする。classifier defectを見つけてもobservation中に修正しない。

## 4. Observation envelope

runtime captureが別途承認された場合だけ、authoritative resolution後かつpersistence前のimmutable inputから
次のserver-only envelopeを作る。

```ts
type ActualTurnShadowObservationEnvelope = {
  schemaVersion: 1;
  observationId: string;

  source: {
    battleRefHash: string;
    turn: number;
    capturedAt: string;
    captureVersion: string;
  };

  applicabilityInput: ConflictHandlingApplicabilityInput;

  authorityEvidence: {
    sourceBeforeDigest: string;
    sourceAfterDigest: string;
    authoritativeOutcomeDigest: string;
    battleResultChanged: false;
    canonicalCommitCount: 0;
    persistenceWriteCount: 0;
    addedExternalLlmCalls: 0;
    addedXaiCalls: 0;
  };

  privacyEvidence: {
    canonicalIdentifiersIncluded: false;
    characterNamesIncluded: false;
    speechOrNarrationIncluded: false;
    promptOrProviderPayloadIncluded: false;
    mediaUrlsIncluded: false;
  };
};
```

`battleRefHash`はexportごとのsaltを用いたopaque hashとする。salt、元battle ID、user ID、character ID、
name、speech、narration、prompt、provider response、media URLはcommitted artifactへ含めない。

raw envelopeは明示されたlocal ignored pathにだけ保存し、Gitへcommitしない。committed evidenceは
aggregate、schema version、source file digest、case-local opaque ID、classifier output、構造的counterだけに
限定する。

## 5. Offline adapter contract

offline adapterは明示的な`--input` local fileだけを読む。次を禁止する。

- repository moduleを介したDB query
- `DATABASE_URL`、Supabase、production、stagingへの接続
- HTTP、provider、external LLM、XAI call
- input file、BattleState、canonical state、DBの変更
- public proseからの欠落field補完
- raw sourceのGit保存

adapterはinput SHA-256を処理前後で比較し、read-onlyを証明する。完全envelopeと既存persisted recordの
どちらもschema上で識別し、後者はfield sufficiency auditだけを返す。

## 6. Sample registration

actual sample captureは`T_CAPTURE_AUTHORITY_DECISION`がconformantで、userがexact capture actionを
承認した場合だけ行う。固定sample要件は次とする。

```text
eligible turns                    >= 50
distinct battles                  >= 10
distinct capture dates            >= 2
maximum eligible turns            500
repetitions per envelope           20
raw source committed              0
```

sample selectionはcapture順の先着eligible envelopeとし、classifier output、trigger、handling、dispositionを
見て選別しない。invalid、duplicate、insufficient sourceは件数と理由だけを記録する。

50 turns、10 battles、2 capture datesのいずれかを満たさない場合、evaluationは`indeterminate`とする。
不足をfixture追加、synthetic turn、同一turnの複製で補わない。

## 7. Metrics

### Hard invariants

| Metric | Threshold |
|---|---:|
| envelope schema validity | `1.00` |
| frozen lineage/source match | `1.00` |
| raw input digest change | `0` |
| battle result/source/canonical mutation | `0` |
| persistence write | `0` |
| added external LLM／XAI call | `0 / 0` |
| committed raw source | `0` |
| committed direct identity／prose／prompt／media leak | `0` |
| inferred missing classifier field | `0` |

### Observation effectiveness proxies

| Metric | Threshold |
|---|---:|
| eligible turns | `>= 50` |
| distinct battles | `>= 10` |
| distinct capture dates | `>= 2` |
| complete applicability input among eligible | `1.00` |
| classifier schema validity | `1.00` |
| deterministic stability | `1 digest per envelope over 20 runs` |
| extraction deterministic stability | `1 digest per envelope` |
| dangling structural refs | `0` |
| adapter local p95 | `<= 10ms per envelope` |
| classifier local p95 | `<= 5ms per run` |

### Descriptive distribution

次をcountとrateで報告するが、pass/fail thresholdへ変換しない。

- five trigger-kind frequencyとco-occurrence
- `not_applicable / required`
- `not_applicable / handled / missing`
- capability availabilityとdisposition
- input completeness failure reasons
- persisted-record-only insufficiency rate
- held-out fixture分布との差

held-out fixture分布は実turn母集団ではないため、分布差をclassifier defectまたはsupportの証拠として扱わない。

## 8. Decision rubric

| Label | Meaning |
|---|---|
| `supported` | hard invariantとobservation effectiveness proxyがすべてpassし、read-only observation方式が成立 |
| `revise` | privacy・authority違反なしで、boundedなadapter／envelope gapが固定thresholdのまま修正可能 |
| `unsupported` | privacy leak、source／result／canonical／persistence mutation、無承認network／provider accessが発生 |
| `indeterminate` | authority未承認、actual sample不足、lineage不一致、measurement不足、input derivability不足 |

`supported`はclassifier accuracyを意味しない。actual sampleには独立oracleがないため、観測された
`handled`や`missing`を正解labelとして数えない。

## 9. Capture authority decision

`T_CAPTURE_AUTHORITY_DECISION`では、実装前に次を固定してuserへ提示する。

- exact hook pointと呼出順
- read field allow-list
- zero-write enforcement
- local ignored destination
- maximum envelope countと期間
- pseudonymizationとredaction
- latency timeoutとfail-open behavior
- disable／rollback手順
- permitted environmentとaccount identity

一般的な「進めてください」をproduction、staging、DB、provider、runtime capture有効化の承認へ拡張しない。
exact actionが明示承認されるまでoffline implementationとsynthetic testだけに留める。

## 10. Stop conditions

- frozen lineageまたはsource hash不一致
- persisted recordから不足fieldの推測が必要
- raw user data、identity、prose、prompt、media URLのcommitが必要
- DB、network、providerへの未承認accessが必要
- authoritative result、call topology、persistence、canonical stateの変更が必要
- classifier、runtime contract、historical evidenceの変更が必要
- actual sampleの選別をclassifier outputに合わせる必要
- sample thresholdまたはlatency thresholdの緩和が必要

stop時はunknownやinsufficientを保持し、synthetic dataをactual sampleとして混入しない。

## 11. Non-claims

- classifierの客観的accuracy、recall、specificity、precision
- 実turn全体または将来分布の代表性
- 戦闘結果の客観的正しさ
- 世界全体の無矛盾性または完全な競合検出
- psychology、experience、intent、world-process、narrationのsemantic quality
- production latency、availability、cost、LLM call削減
- runtime adoption、persistence、release、deployment readiness
