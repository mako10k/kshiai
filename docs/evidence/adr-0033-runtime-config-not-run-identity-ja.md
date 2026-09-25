# ADR-0033: Transport／Worker Configをdurable Run identityにしない

- 状態: Accepted
- Revision: 1
- 日付: 2026-09-15
- 決定者: プロダクトオーナー
- 関連: ADR-0032、受入済み共通semantic-authoring基盤要件v3、実装設計revision 5、
  PERT task `cc309`と`cc304`
- 正本: `docs/adr/0033-runtime-config-not-run-identity.think`
- 正本SHA-256: `ae8b736857b59188880acbf397e2da941caf5c102539b2410ddd7011fd1f529a`

## 文脈

受入済み共通基盤は、失敗attemptを終了し、明示retryによってfrozen sourceから新attemptを
再構築することを許している。in-memory candidate、model context、Worker checkpointの永続化は
必須ではない。それにもかかわらず、受入済み実装設計revision 5は、provider transportとWorker
execution policyのrevision identityを全durable Runへ追加した。

これらのidentityはcheckpoint recoveryを可能にしない。processまたはWorker lease喪失時には、
現在Runを終了し、遅延resultをfenceし、ownerが新Runを明示的に作る。新Runは、その新しい実行で
選択されたruntime Configを使用する。

## 判断材料

- 重複Worker、遅延provider result、retryに対する正しさを維持する。
- 共通persistence契約を、durable outcomeの再構築または説明に必要な事実へ限定する。
- 具体的なreplay、compliance、billing、service-level要件なしにversioned Config registryを作らない。
- ADR-0032で受理された時間境界の分離を維持する。

## 検討した選択肢

1. 両方のConfig revision identityを全Runへ保存する。過去のConfigを特定しやすいが、失敗Runの
   再開には使わないschema・lifecycle結合を追加する。
2. Transport／Worker Configの完全snapshotを保存する。exact replayは可能になるが、source-based
   new-run recoveryと合わず、不要なConfig retention・互換義務を作る。
3. Transport／Worker値はruntime Configとし、正しさに必要なrequest、accounting、fence、outcomeの
   事実だけを永続化する。これを選択する。

## 判断

Provider transportとWorker executionの値は起動時runtime Configとして扱い、durable
`SemanticAuthoringRunV1` identityの一部にしない。共通Run recordにtransport／Worker Configの
revision ID、Config registry、Config snapshotを必須としない。

次は引き続き永続化する。run/source identity、target contract、adapterと意味資源policyのidentity、
pricing/token-estimator identity、provider request lifecycle、reservation/receipt、owner/fencing
token/run version、question/answer、technical outcome、family所有のfinal candidate metadata。

同一Run内のprovider transport recoveryはlive実行が保持するimmutable Configを使用できる。
processまたはWorker lease喪失時は、そのRunを回復可能なtechnical outcomeで終了する。明示retryは、
sourceから新Runを作り、その新実行で有効なConfigを使用する。route、platform、timeout、leaseは
任意のbounded operational telemetryへ記録できるが、replay契約またはsemantic correctness条件には
しない。

## 結果

### 利点

- 運用Config世代のためだけのDB migration・durable registryを追加しない。
- persistence modelがstatelessなsource-based new-run retryと一致する。
- 正しさはConfig labelではなく、明示request state、単調なaccounting、fencingで維持する。

### 欠点とリスク

- 過去Runだけから全運用設定を再現できない。
- exact timeout／leaseを必要とする診断はexecution environmentのbounded telemetryに依存する。
- 将来complianceまたはexact replayが必要になれば、別のpersistence判断が必要になる。

## 互換・migration

既存保存rowには提案中の二つのConfig identity列が存在しないため、それらを未実装設計から外す
data migrationは不要である。既存fence、request、accounting、outcome recordは変更しない。
ADR-0032のprovider、Worker、semantic progress、累積resource境界の分離は維持する。

## 検証

- Run契約とDB schemaがTransport／Worker Config IDを必須にしない。
- Worker/process喪失が現在Runを終了し、遅延writeをfenceし、source-based new-run retryを提示する。
- Provider request state、reservation、receipt、accountingが単調性を維持する。
- runtime起動時にはtimeout／lease Configの欠落・不正値を引き続き拒否する。

## 実装参照

- `packages/shared/src/semantic-authoring.ts`
- `backend/src/llm/semantic-authoring-provider.ts`
- `backend/src/services/semantic-authoring/durable-execution.ts`
- `docs/structured-semantic-authoring-kernel-implementation-design-v1.md`

## Reviewと受理

正確な受理前ADR revisionと適合する実装設計revision 6の正式reviewは、P0〜P3指摘なしでPASSした。
Review reasoning SHA-256は
`cdd328284fd76310ef28dfaff0f59c2e7cf559828c738a3a71c85839be1567d3`である。

2026-09-15、PASS結果と完全な日本語review範囲の提示直後、製品オーナーは`ACCEPT`と回答した。
受理前ADR SHA-256は
`ae8b736857b59188880acbf397e2da941caf5c102539b2410ddd7011fd1f529a`、適合する設計revision 6の
SHA-256は`a0f2ba909d3c71fb7de2235bd84125b420663f6f8b5400c4236eaf92e832ebff`である。

この受理は具体的なConfig値を選択せず、実装、commit、push、provider call、deployment、
migration、activation、rollback、releaseを認可しない。
