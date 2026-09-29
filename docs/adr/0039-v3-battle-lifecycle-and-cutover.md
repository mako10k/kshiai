# ADR-0039: V3対戦の不変リビジョンとライフサイクル・切替境界

- Status: Proposed
- Revision: 1
- Date: 2026-09-29
- Decision owner: プロダクトオーナー
- Authority: 同名 `.think` が判断の正本。本書は日本語の投影。
- Related: [要件revision 2](../character-v3-battle-cutover-requirements-v2.md)、[基本・詳細設計revision 2](../battle-lifecycle-boundary-design-v2.md)、[計画revision 13](../character-semantic-migration-plan-revision-13.md)、cc305/cc319、vt102/vt109/vt110

## Context

商品上の方針は既決である。新規はV3同士で、必須consumer集合は `battle-mechanics@3`。作成時の不変リビジョンで進行し、切替前の未完了対戦は物理削除、完了履歴は保持する。対戦ドメインと狭いライフサイクル境界へ責務を集める方針も維持する。

現行コードではHTTP保存応答が対戦存在確認に先行し、進行保存にもINSERT付きupsertを使う。削除した対戦の古い応答や遅延処理を扱うため、削除だけでなく再送・保存の契約を揃える必要がある。[経路・データ調査](../evidence/cc305-v3-lifecycle-design-inventory-2026-09-29.md)を根拠とする。

保存枝 `77ed6a01b9f6bea8d68702ab53839ef45ee78efd` の `docs/adr/0032-bind-v3-characters-to-versioned-battles.*` と、現行の[authoring時間境界ADR-0032](0032-separate-authoring-time-boundaries.md)は別の決定が同じ番号を使っている。保存枝のV4 binding判断を出所付きで引き継ぎ、後発の旧対戦破棄決定と整合させる。本ADRを0039として採番し、現行0032を保持する。

## Decision drivers

- 最終的なプログラムの複雑さを最小にし、状態規則の変更理由を一か所へ集める。
- 不変入力と正史の所有権を、登録、対戦、実況で明確にする。
- 全入口で物理削除後の結果を一致させ、旧対戦の継続実装を整理する。
- 完了済み履歴と費用計測の証拠を保持する。

## Considered options

| 案 | 得られるもの | 費用・限界 |
|---|---|---|
| エンジン全体のクラス化 | 大規模な構造統一 | 今回の不変条件以外の戦闘規則まで変更面が広がる |
| routeごとの判定追加 | 個別箇所を早く直せる | HTTP/SSE/alias/workerに同じ規則が分散する |
| **狭いBattleLifecycleと既存adapter（推奨）** | 共通の適格性、固定入力、保存・再送境界 | 小さなportとtransaction境界の実装が必要 |
| 旧Battleをinactiveで保持 | 旧対戦の記録を残せる | 状態・表示・再送の特例が続く |
| **本体削除＋IDだけの削除記録（推奨）** | 同じ旧キーによる再作成まで識別できる | 小さな記録表と照合が増える |
| 作成キーへ切替epochを追加 | 旧キーを新APIで識別できる | クライアント契約とtoken配布が増える |

## Decision（採用候補）

### D1 リビジョン固定

新規用に `BattleAssetManifestV4` を区別し、両者はV3 generation、`CharacterBattleCompilerInputsV4`、exact ID/digest/snapshotを保存する。dialogue・rule・compilerの完全な識別組を検証する。キャラクターの参加資格に追加する必須consumerは `battle-mechanics@3` のみであり、schema妥当性・開示規則も別途検証する。

作成は所有者が確定したcurrent generationを読む。進行・再送・再読込・実況・表示は保存したbindingを読む。既存V1–V3 manifestは、完了済み履歴を記録当時の意味で読むために保持する。

### D2 操作・保存・再送

副作用を持たないBattle/BattleBinding規則、小さなBattleLifecycleユースケース、storage/compiler/replay/narrationのportに分ける。HTTP・SSE・action aliasは同じadvance操作を使う。

作成は新規IDへのINSERT、進行は既存行へのrevision/lease照合付きUPDATEに分ける。読込・認可・適格性確認をキャッシュ応答より先に行う。workerも公開・保存の直前に存在と所有権を確認する。

削除と同じtransactionで、**削除済みBattle IDと切替identityだけ**を記録する。旧対戦の本文・状態・snapshotを保存する代替状態ではない。作成IDは現在、ユーザー・キー・要求hashから決まるため、この最小記録によりHTTP保存応答が欠落した古い要求も識別できる。同じ削除済みIDの作成は利用終了として扱う。

### D3 切替

初回切替は**ゲーム入口とtask投入を閉じ、旧処理を停止・収束させてから一括削除し、読戻して開く**方式にする。全旧revision/workerが停止したことを確認し、対象・バックアップを固定する。

削除対象は、未完了Battle本体、presentation、実況入力・公開event・outbox、該当HTTP応答本文。キャラクターgeneration、完了履歴、provider/balanceの会計・観測記録は保持する。残るactiveな会計runは収束後にfailedとして終える。保持する会計記録には再開権限を与えない。すでに送信したprovider要求の結果は会計を完結できるが、新たな呼出し・対戦保存・公開には使わない。

入口を開く前の失敗は、入口を閉じたまま整合したsnapshotへ戻せるようにする。開いた後は新しいV3対戦を保持する前進復旧を選び、旧snapshot全体の上書きは別の影響評価と権限を要する。

### D4 過去ADRとの関係

採用時には、**切替前作成かつ切替時点にfinished以外というR3の対象だけ**について、次の既存句の適用を物理削除へ置換する。

- ADR-0010 Decisionの「既存対戦は記録済みlegacy manifestを保持する」と、Compatibilityの「既存対戦・version-1 manifestはembedded snapshotで読み取れる」。
- 保存枝ADR-0032 Decision 4の「既存対戦を移行しない」と、Consequencesの「既存V2/dialogue-V3対戦は従来通り継続する」。

これらの一次句自体はfinished/unfinishedを区別していない。今回、R3集合へ適用する範囲を限定する。**finished履歴には従来の不変binding・意味・可読性を継承する。** authoringの義務と、現行authoring時間境界ADR-0032の判断も継続する。受入時に限定置換と相互リンクを記録する。

ADR-0038のFragment・結果表示は別のProposed判断である。この初回V3試行の採用によって、その実装・受入まで完了扱いにしない。

## Consequences

**効果:** 参加資格と再送の意味を共通化できる。進行保存は存在する対戦だけを更新し、旧継続用の状態機械を維持せずに済む。

**費用・リスク:** 削除済みIDの最小記録と全入口の照合、insert/update分離が必要。一時的なゲーム停止を伴う。旧workerや外部queueの取り残しは副作用の原因になり得るため、切替の実行証拠に含める。Stageの実データ件数・停止所要時間は実行前調査で確定する。

## Compatibility and migration

完了履歴は既存のread経路を使い、実際に記録された値を表示する。旧・未完了対戦は物理削除する。完了履歴の移行が必要な場合、ADR-0038側と共有する**合計30分**の実作業枠を測り、超過見込み時に対象と損失が明確な削除等の案を提示する。履歴削除の採否は所有者の判断となる。

Stage/productionの配備・データ操作、releaseの選定は別の実行権限で行う。今回の変更セットは文書・PERTである。

## Verification

- vt109: 既存Accepted R18・ADR-0010/0014に従い、正確な候補レビュー、所有者確定、原子的有効化、重複／競合／失敗、SQLite/PostgreSQL契約を確認。本ADRの採否と独立して実装できる。
- vt102: V3同士の作成、途中のcharacter編集後も全consumerでbindingが固定されること。
- vt110: 物理削除、古い作成キーとHTTP/state再送、遅延UPDATE、worker、一覧・詳細・実況の終了扱い、完了履歴の保持。
- vt103: 実際の登録・選択・作成・進行・再読込・結果までの一戦。
- vt104–vt108: 正確なrelease、対象件数、停止・回復枠、権限、適用後の独立readback。

fixtureのschema試験と直接登録は、これらの一部を支える証拠として扱う。完了判定は対応する実経路を確認して行う。

## Review and acceptance

現在の審査対象は、既決要件を満たす責務・I/O・再送・保存・切替方式と、既存ADRとの整合性である。Stage件数・SQLの実行値・停止時刻は後続の実行準備に割り当てる。

cc319で採否を求める具体案は、**狭い共通ライフサイクル＋削除済みIDの最小記録＋作成INSERT/進行UPDATEの分離＋停止して切り替える方式**である。独立レビュー結果は[レビュー記録](../evidence/cc305-v3-lifecycle-review-2026-09-29.md)に保存する。既決の商品方針はそのまま採用判断の入力とする。
