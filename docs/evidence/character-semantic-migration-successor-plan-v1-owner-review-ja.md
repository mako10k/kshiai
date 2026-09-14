# キャラクター意味マイグレーション後続計画 改訂1 — オーナーレビュー用日本語訳

- 状態: オーナーレビュー用提案
- 日付: 2026-09-10
- 根拠: 受入済みキャラクター意味マイグレーション要件 改訂6
- 範囲: 計画のみ。ADR受入、provider呼出し、deployment、policy有効化、
  本番migration、pointer変更は含まない
- 正本: `docs/character-semantic-migration-successor-plan-v1.md`

## 1. 成果と現在の基準

原因とauthorityを混同せず、次の2つのユーザー可視な復旧を実現する。

1. 別件のresponse-schema identity修正を完了し、新規キャラクター作成を復旧する。
2. 恒久V2 reader例外を設けず、凍結したready V2キャラクター8件を、レビュー済み・
   append-only・LLM支援型の意味マイグレーションでstrict V3へ移して復旧する。

既存の顕在意識主体性実装と、その品質比較は別のdelivery streamとして維持する。
本計画は完了済み履歴を書き換えず、ローカルでschemaがvalidであることをモデル品質の
証拠にはしない。

## 2. 計画上の判断

### 2.1 協調する2レーン

レーンAは、着手済みのキャラクターauthoring response-schema修正を完了させる。
レーンBは意味マイグレーションの設計と実装を行う。レーンAは意味マイグレーションの
全設計を待たない。ただしcutover後のauthoring契約は、最終的にレーンBが選ぶschema版を
出力しなければならない。

### 2.2 ADRの系譜

Proposed ADR-0029改訂1は受け入れない。その恒久V2互換readerは受入済み要件と衝突する。
推奨処置は、その提案をRejectedとし、ADR-0010とADR-0011を明示的にrefineする新番号の
後継ADR packageを作ることである。ADR-0029をそのまま改訂する案も可能だが、却下された
reader案と新しいmigration案が同じidentityを共有して分かりにくくなるため推奨しない。

最初の草案で一つのADRではレビュー可能性を保てないと判明した場合、次の2つの連携ADRを使う。

- semantic asset契約: `CharacterDefinitionV3`、conscious guidance、qualified mechanical
  fallback、compiler/capability identity、deferred marker、capsuleの役割とdisclosure境界。
- migration transaction契約: 凍結attempt/provider request、change-set/semantic repair、
  review diff、receipt、idempotency、asset別append/CAS、cutover、rollback。

この分割は草案作成上の境界であり、相互契約が不整合なまま片方だけを受け入れる許可ではない。
両方で依存関係と、組合せとしての正確な受入状態を明示する。

### 2.3 効果の境界

ローカル実装、deployment、schema 3 authoring-policy有効化、有料providerによるcandidate生成、
candidate digestのowner受入、本番append/CAS、本番readbackは別々の効果である。前段タスクは
後段タスクのauthorityを与えない。

## 3. 順序付き作業package

| ID | 作業package | 依存 | 完了証拠 | authority境界 |
| --- | --- | --- | --- | --- |
| A1 | WIPにあるresponse-schema identity修正を完了 | 受入済みRCAと現在のWIP | focused regression、全typecheck/test/build/duplication/Lizard、code review、Seal readback | ローカル修正のみ。provider/deploymentなし |
| A2 | 実provider routeでauthoring修正を検証 | A1 | 凍結request/schema identity、限定call receipt、response分類、未承認retryなし | 別途範囲を限定した有料provider承認が必要 |
| A3 | deployして新規作成を検証 | A1、deployment準備。release判断がlive-provider証拠を要求する場合はA2 | deployment identity、health/readback、create flow結果、rollback準備 | deploymentと本番利用の別承認が必要 |
| B1 | ADR系譜を解決し、後継ADR packageを作成 | 受入済み要件v6 | ADR-0029処置、完全な`.think`/`.md`候補、CLI LLMThink audit、`adr:check`、impact preview | Proposedのみ。実装authorityなし |
| B2 | 正確な後継ADR packageをaccept/revise/reject | B1 | 完全な日本語レビュー範囲、対案、risk、unknown、owner判断、受入Seal系譜 | owner判断が必要 |
| B3 | V3 semantic asset契約とcompiler境界を実装 | B2 | strict V3 parse、historical V2 read、qualified tuple拒否、guidance/mechanics分離、capsuleをruntime/public compilerから除外 | ローカル実装のみ |
| B4 | durable migration attemptとpreservationを実装 | B3 | 凍結source/request identity、operation網羅、bounded capsule、disclosure check、crash/retry fixture | ローカル実装のみ |
| B5 | 限定semantic生成・review・repairを実装 | B4 | 6 operation、candidate全体semantic review、拡張repair closure、request別receipt、全体再検証、owner向けsemantic diff | fixture/test doubleのみ。有料callなし |
| B6 | append-only activation、replay、drift、rollback controlを実装 | B5 | candidate受入の厳密なbinding、asset別atomic append/CAS、完了replay idempotency、source/pointer drift、旧battle読込、rollback fixture | ローカル実装のみ |
| B7 | 統合local release gateを実行 | B6 | production-shapedなready 9件fixture、対象8件/soft entry 21件、no-state 16件除外、全typecheck/test/build/duplication/Lizard/ADR check/Seal stale review/fsck | ローカル契約だけを証明 |
| B8 | schema 3を有効化せずdual V2/V3 readをdeploy | B7 | deployed revision readback、historical V2/new V3 compatibility probe、migration resume能力、rollback準備 | 別deployment承認。provider/pointer writeなし |
| B9 | 本番migration manifestを凍結・レビューし、no-provider/no-write dry-run | B8 | 8件のlogical/generation/content identity、drift/already-complete、予想provider work/上限、call/write 0 | 本番ReadOnly authorityとowner manifest review |
| B10 | provider-backed migration candidateを生成 | B9 | 承認済みmodel/route/budget、request別receipt、構造/意味結果、owner review diff、failureはnon-current | 別有料provider承認。activationなし |
| B11 | asset別または厳密batchでcandidateを受入 | B10 | accepted candidate digest set、decline/unresolvedを明示 | owner判断が必要。pointer writeなし |
| B12 | accepted V3 generationをappendし、asset別にpointer移動 | B11 | asset別atomic receipt/CAS、partial failure分離、failure不変、rollback target | 別本番write承認 |
| B13 | 復旧を検証し、schema 3 authoring cutoverを判断 | B12 | 対象8件の結果、selector一覧/battle binding readback、旧battle読込、capsule非消費、failure報告 | 先にreadback。policy有効化は後のowner判断 |
| B14 | strict schema 3 authoringを有効化しcreate/revisionを検証 | B13、A1。A3のdeployment状態と整合 | qualified policy receipt、新create/revisionはV3、restore/importはmigration経由、rollback演習/準備 | 別の本番policy変更承認 |

## 4. 依存とcritical path

意味マイグレーションのcritical pathは次の通り。

`B1 -> B2 -> B3 -> B4 -> B5 -> B6 -> B7 -> B8 -> B9 -> B10 -> B11 -> B12 -> B13 -> B14`

レーンAのローカル完了はB1-B7を待たずに進められる。A3とB14ではdeployed authoring契約を
照合し、一時修正を最終V3 cutoverと誤認しないようにする。既存の顕在意識主体性タスク`t029`は
独立して最終完了レビューを受ける。予定済み`t030`-`t032`のmodel品質比較は意味マイグレーションを
証明せず、B1の前提でもない。

## 5. 検証戦略

B3-B6の各sliceは、次のsliceへ進む前にfocused behavioral testを追加する。B7が最初の統合local claimで、
受入要件の全criterionをtraceability tableで網羅する。testでは次を区別する。

- source-cause修正とescape/detection check。
- structural validityとsemantic consistency。
- attempt、provider request、candidate、generation、current pointerのidentity。
- guidance効果と決定論的mechanical効果。
- current consumer compatibilityとdeferred future capability。
- local/test-double証拠とlive provider/production証拠。

受入済み要件を本計画の明示的CauseとしてSealする。受入ADRまたは実装sliceごとに、変更前`impact`、
正確なsource/verification evidenceのlink、stale frontier review、レビュー済みartifactだけのreseal、最後の
`fsck`を行う。stale 0は意味的承認ではない。

## 6. 対案とtradeoff

### 一つの復旧タスクへ統合

計画作業は減るが、小さなauthoring修正を、未確定architecture、有料model挙動、本番writeへ結合する。
failureの帰属と承認境界が曖昧になる。推奨しない。

### 恒久V2 compatibility readerを先行

selectorを早く戻せる可能性はあるが、受入済み目的と直接衝突し、V2の二重意味を残す。
受入済み基準により却下。

### レーンAもmigration設計後に行う完全直列

scheduleは単純だが、独立して修正できる新規作成障害を遅らせる。同等の安全上の利点がない。
推奨しない。

### 協調2レーンと段階的migration

独立修正できる新規作成経路を早く戻し、不可逆または有料の効果をすべてgateできる。
A3/B14の調整コストとtest matrix増加はある。推奨する。

## 7. riskと未確定design decision

- 後継ADR packageは2記録になる可能性がある。正確な分割は文書量だけでなく、reviewabilityとatomic consistencyで決める。
- capsule retention/export/deletion/sensitive-data取扱いは未確定。
- qualified compiler/capability/fallback/provenance/prompt/response/repair contract identityは未確定。
- retry回数、token/cost上限、semantic-review独立性、model drift処理は未確定。
- 正確なdeployment/production rollback routeはlocal testでは確立しない。
- 8 generation manifestはB9直前に更新が必要。2026-09-10観測は歴史的証拠であり、永続する現在状態ではない。
- partial successを想定し、B13 readbackで各targetを証明するまで「8件復旧」と表示しない。

## 8. 計画受入と次の行動

本計画が受け入れられた場合、最初にdelivery PERTとbacklogへB1-B14と明示的authority gateを追加する。
その後、次のローカル修正としてA1、次のarchitecture taskとしてB1を実行する。計画受入は将来ADRの受入や、
A2/A3/B8-B14の効果を承認しない。

判断正本: `docs/evidence/character-semantic-migration-successor-plan-v1.think`。
CLI LLMThink監査: fatal 0、error 0、warning 0、info 1。infoは未確定designとproduction proof obligationを
残すものであり、計画を弱めるものではない。
