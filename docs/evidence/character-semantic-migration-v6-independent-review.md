# キャラクター意味マイグレーション要件 改訂6 — Step 3独立レビュー

- 結果: `completed`
- 日付: 2026-09-10
- Step 2でオーナーが選択した経路: `REVIEW`
- 追加されたオーナー質問: なし
- 次のlifecycle段階: Step 4 第二オーナーレビュー
- 本レビューによる要件本文の変更: なし
- 本レビューが許可しないもの: 要件acceptance、後継ADR、設計、実装、deployment、provider利用、
  production migration、pointer変更

## 固定レビュー対象

### 英語正本

- Path: `docs/character-v2-compatibility-requirements-v6.md`
- SHA-256: `c3e19e53c48f159c2c8379c81c645fa64b0293f67694d5880f53c8088de9b6e4`
- Seal: `da2f3a272a1110efa775f8312a6b0e34462270286538715f187e762ecce28718`
- Review後の同一性: 同じSHA-256およびSeal source contentとの一致を再確認する

### 日本語レビュー入力

- Path: `docs/evidence/character-v2-compatibility-requirements-v6-owner-review.md`
- SHA-256: `47fc18615673c196cbd0e8045f8d772f52e6bb3d09737ceaa3613a8a27910cd8`
- Seal: `d6773021e83cd3f45027633b32a3d12f8667bd8a677ab545fb8fc5294914af55`
- 位置づけ: 英語正本全体の日本語review supportであり、第二の規範正本ではない

## 結論

要件本文との矛盾、またはAcceptedな上位authorityとの矛盾は見つからなかった。改訂5で残った
provider-operation identityの曖昧さと、意味的repair closureのauthority不足は、改訂6で要件レベルの
解消に至っている。

現時点の証拠ギャップは、本番復旧がまだ実行・readbackされていないこと、および現行実装が改訂6の
新contractへ適合済みではないことの2件である。いずれも要件本文の矛盾ではなく、要件が明示的に
分離している後続段階のproof obligationである。

## Material findings

### F1 — contradiction

- 分類: contradiction
- 件数: 0
- 結論: なし

### F2 — 本番8件の実復旧は未証明

- 分類: evidence gap or unresolved unknown
- Severity: High
- 最早期の段階: production executionおよびreadback

改訂6は8件復旧を目的とし、正確な8件の凍結manifestとproduction-shaped fixtureを要求する
（要件15–28行、160–165行、340–344行）。しかし、production provider work、owner acceptance、
generation append、pointer migration、readbackが実行されたことは証明しない。これらは要件297–300行と
407–412行で別作用として保留されている。

したがって、この証拠ギャップは「改訂6が再びfixed-mapで8件を排除する」という要件欠陥ではない。
要件acceptanceと、後続の実装・deployment・provider利用・production pointer変更を分離しているため、
現段階では実復旧の証拠が存在しないという限界である。

### F3 — 現行実装の改訂6適合は未証明

- 分類: evidence gap or unresolved unknown
- Severity: Medium
- 最早期の段階: 後継ADR・設計および実装検証

現行compatibilityはglobalな4-state結果のままである
（`packages/shared/src/structured-assets.ts` 155行以降、
`backend/src/repositories/character-assets-v2.ts` 1005行以降）。consumer-qualified readiness、
preservation capsule、provider-request単位receipt、V3 semantic migrationは現行実装済みの事実ではなく、
改訂6が後続作業へ要求するcontractである。

これは既存実装を要件authorityとして扱わないための区別であり、要件本文の矛盾ではない。

### F4 — 後継ADRに残る具体設計

- 分類: optional or future candidate
- Severity: Medium
- 最早期の段階: 後継ADR

次は要件388–405行で明示的に後継ADRへ委譲されている。

- migrated mechanical fallbackのqualified identity/schema
- capsuleの物理保存、上限、retention、export、削除policy
- compiler capabilityとdeferred markerのqualified表現
- semantic-review、repair、provider-request contract identityおよびretry上限
- batch owner-review UIと、別途承認されるautomatic-acceptance policy
- V3 basic-action source表現
- authoring-policyの永続化・activation方式

これらはR1–R25を弱めたり、既存identityを意味変更して再利用したりしない範囲で具体化できる。

### F5 — 本レビューの対象外

- 分類: out of scope
- Severity: Informational

deployment、traffic/policy activation、live provider-backed migration、pointer rollback、no-state 16件の
migration、別件response-schema修正のlive xAI検証は要件407–412行で別権限としている。本レビューは
これらを受入条件へ追加せず、実行も許可しない。

## 改訂5の指摘の再評価

### Provider request・attempt・replay identity

解消済みと判断する。

- 1つの`migrationAttemptId`がoperation inputを凍結する。
- provider呼出ごとに異なる`providerRequestId`、digest、parent relation、accounting record、receiptを持つ
  （167–174行）。
- success receiptがprovider-request receipt集合を束縛する（265–272行）。
- 未完了attemptの限定repairは追加requestを発行できる。
- 完了attemptのreplayはprovider requestもgenerationも追加しない。
- 異なる意味結果を意図して再生成する場合は、新attemptと新review candidateを作る（274–281行）。

改訂5では「provider operation」がattemptとrequestのどちらを指すか一意でなかった。改訂6はidentityを
分離したため、その曖昧さを残していない。

### Repair closure authorityと意味的一貫性

解消済みと判断する。

LLMが提案するsemantic dependantsはrepair closureの1入力にすぎない。closureは次の和集合である
（205–219行）。

- serverが把握する構造的依存
- LLMが提案する意味的依存
- 独立したcandidate全体の意味的一貫性reviewが指定する追加field

merge後はcandidate全体を構造面・意味面の両方で再検証し、必要ならclosureを再拡張する。未解決の
不整合candidateはactivationできない。これにより、LLM自身のdependant申告だけをauthorityとして
扱う構造を避けている。

## 不変部分の確認

次の領域に新たなmaterial contradictionは見つからなかった。

- ADR-0010/0011を変更するには後継ADRが必要であり、不変generation、validation、owner review、
  per-asset CAS、旧V2 readabilityを維持する（35–71行）。
- ADR-0027のruntime責務とADR-0028のqualified namespaceを保持する（73–102行）。
- LLMはmigration candidateのauthorであり、runtime rule、disclosure、compatibility、activationの
  authorityにはならない（54–59行、80–82行、176–227行）。
- 6 operation、sourceのsilent loss禁止、capsuleの通常compiler非消費、future migration consumer限定を
  維持する（137–143行、176–219行、319–322行）。
- consumer単位deferによりglobal eligibility dead endを避け、selection/search/battle create・retry・
  resume・replayでproviderを呼ばない（145–151行、231–250行）。
- selectorless soft guidanceとmechanical fallbackを別々に計上する（130–135行、190–196行）。現行schemaと
  compilerでも`fallbackActionRef`はselectorから独立したfieldとして扱われている。
- disclosure grantを拡大しない（198–203行、323–324行）。
- owner/batch acceptance、asset単位failure isolation、append-only CAS、後続revision後の履歴receiptを
  維持する（221–281行）。
- cutoverはqualifiedかつ明示的であり、cutover後のcreate/revisionはstrict V3、履歴restore/import/
  derivedはsemantic migrationを利用する（285–300行、355–359行）。

## LLMThink監査

独立レビューの因果判断をcommand-line `llmthink dsl audit`で監査した。

- fatal: 0
- error: 0
- warning: 0
- hint: 36

hintはshared-premiseおよび可読性に関する非blockingな指摘として保持した。事実証拠の追加や置換には
使用していない。

## Step 4 オーナー判断

推奨は、正確な改訂6 bytesに対する`ACCEPT`である。これは要件だけのacceptanceであり、後継ADR、
設計、実装、deployment、provider利用、production migration、8件復旧済みという主張を承認しない。

オーナーが選択できる経路は次の3つである。

- `ACCEPT`: この正確な改訂6 snapshotを要件としてacceptし、後継ADRを別途開始する。
- `REVISE`: 規範本文へ変更を加える場合、改訂7を作りStep 1から再開する。
- `REREVIEW`: 要件bytesを変えず、質問を追加・変更して再度Step 3へ送る。

`REREVIEW`は本文変更の代替ではない。本文を変更する場合は必ず`REVISE`を選ぶ。
