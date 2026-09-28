# 対戦ライフサイクル境界 — 設計候補 revision 1

- 状態: Proposed（設計レビュー用。要件・ADR の受入または実装許可ではない）
- 日付: 2026-09-28
- 対象コード: `codex/cc304-focused-revise` の `082cb9b`
- 対象作業: 親計画 `cc305`、V3 Stage 子計画 `vt102`。選択候補の実装は隣接する `vt101`。
- 上位根拠: オーナー指示「新規対戦は V3 同士」「切替前から途中の対戦は破棄し、その継続のための余分な実装を作らない」、[Accepted ADR-0010](adr/0010-structured-selectable-asset-envelope.md)、[キャラクター互換要件 revision 6](character-v2-compatibility-requirements-v6.md) とその[オーナー受入記録](character-v2-compatibility-requirements-v6-acceptance.md)。要件本文の作成時ヘッダーは候補のままだが、後続の受入記録が正確な snapshot を Accepted としている。[切替要件候補 revision 1](character-v3-battle-cutover-requirements-v1.md) の物理削除方式は Proposed のまま扱う。

## 今回決める境界

この設計で決めるのは、対戦の作成、読込、進行、再送、破棄に共通する状態規則の所在と、HTTP・永続化・非同期処理の責務境界である。新規 V3 対戦の両者について、作成時に確定した世代 ID・digest・対戦用 snapshot を進行と表示の根拠にする。切替前の未完了対戦は、採用される破棄方式にかかわらず継続対象から外す。完了済み履歴の既存記録は読み取り対象に残す。

保存行を物理削除するか、記録を残して再開を止めるかは要件・データ保持の決定である。実データの件数、削除 SQL、関連表の処理、運用時刻、障害回復手順は後続の設計・適用で確定する。例えば「進行中旧対戦を次のターンへ進めない」は今回のライフサイクル境界に属し、「どの表から何行を消すか」は選ばれた保存方式の適用に属する。

## 現行経路と変更理由

| 操作 | 現行の所在 | 観測した分散 |
| --- | --- | --- |
| 新規作成・同一キー再送 | [API route](../backend/src/routes.ts) の `POST /battles`、[battle-service](../backend/src/services/battle-service.ts) の `startBattle` | route が HTTP 再送を扱い、service が既存 battle の再送、V2 世代読込、manifest、保存を扱う。現行の実経路は V2 envelope を読む。 |
| 一覧・詳細 | route、[battles repository](../backend/src/repositories/battles.ts) | repository が一覧の状態変換を扱い、詳細 route が manifest snapshot と現在の character row の選択を扱う。 |
| ターン進行・再送 | 通常 HTTP、SSE、旧 `/action` alias、`advanceTurn` | 三つの route に HTTP 再送処理があり、service 内にも完了済み operation の再送がある。 |
| 破棄・関連記録 | `DELETE /battles/:id`、repository、[DB 定義](../backend/src/db.ts) | 現行の個別削除は battle 行を消す。関連表には cascade と battle ID のみの記録が混在する。 |

特に advance route は battle の存在・状態を読む前に保存済み HTTP 応答を返せる。破棄後の再送と、切替と同時進行のターンを同じ境界で扱う必要がある。これは[既存の実経路監査](evidence/cc318-v3-battle-cutover-audit-2026-09-28.md)を、切替後の設計に読み替える際の追加論点である。同監査の未完了旧対戦を継続する提案は、今回の後発オーナー指示に対する実装義務として用いない。

## 提案する責務

1. **対戦ドメイン `Battle` / `BattleBinding`**: 対戦状態と作成時に固定した両者の世代 ID・digest・snapshot を一組として扱う。新規 V3 対戦の参加資格、状態遷移、継続可否を副作用のない規則で表す。battle manifest の版と character definition の版を別の識別子として検証する。既存の完了済み履歴を新しい V3 意味へ結び直さない。
2. **アプリケーション層 `BattleLifecycle` 境界**: `create`、`get/list`、`advance`、`discard` の共通入口を提供する。各操作は小さなユースケースに分け、共通の認可・切替適格性を使う。HTTP と state 内の二層の再送、lease、保存時の revision 照合、非同期 narration の投入を決まった順序で調停する。通常 HTTP、SSE、旧 `/action` alias は同じ `advance` 操作を使い、出力形式だけを各 route で変える。
3. **既存 adapter**: repository は DB 読書き、transaction、CAS と lease fence を担当する。character reader / compiler は正確な V3 世代を選択・検証して immutable binding を返す。narration worker と provider accounting は既存の非同期・外部作用の境界に残す。ドメインオブジェクトは DB 接続や provider を所有しない。

この分割では、状態の意味を対戦ドメインに集め、複数の資源をまたぐ操作をライフサイクル境界に集める。一つの巨大なクラスへ戦闘エンジンを移す設計ではない。TypeScript の `class` と module のどちらを使うかは、公開する操作と不変条件を固定した後の実装選択とする。

## 各操作の共通契約案

| 操作 | ライフサイクル境界で保証すること |
| --- | --- |
| `create` | 両者の current V3 世代の参加資格を検証し、exact ID・digest・snapshot と compiler identity を固定する。同一キー再送は同一 battle を指し、切替前の旧 battle を再生成しない。 |
| `get/list` | 完了済み履歴は記録済みの意味で提示する。対戦一覧・詳細、キャラクター別対戦履歴、narration の snapshot/events/follow/receipt は同じ破棄判定に従う。 |
| `advance` | 認可・継続適格性を確かめたうえで二層の再送を処理する。切替後の旧対戦は、保存済み応答も新しいターンも返さない。V3 対戦は作成時 binding を使う。通常 HTTP、SSE、alias の結果は同じ状態遷移に従う。 |
| `discard` | 対象の確定、同時進行する advance との排他、採用された保存方式による適用、再送・全 read surface・非同期 worker の読戻しを一つの切替手順として調停する。正確な DB 操作は保存方式の決定後に設計する。 |

切替には、ある時点以降に対象 battle が利用可能な応答や新しい副作用を生成しない**一本の確定点**を設ける。HTTP の idempotency 行、state 内 operation replay、narration の outbox/worker、provider 記録は battle 行と同じ寿命とは限らない。各入口は確定点後の適格性を保存済み応答より先に確認するか、その応答を確定点で原子的に無効化する。物理削除と記録保持のどちらでも、この結果を同じ試験で確かめる。

## 比較した設計

| 案 | 利点 | 費用・限界 |
| --- | --- | --- |
| **A: 対戦エンジン全体をクラスへ変換** | 長期の構造変更を一括で行える。 | 戦闘規則・provider・永続化に広く触れ、初回 Stage 試行前の回帰面積が大きい。今回の切替問題だけから全面変換の価値は立証できない。 |
| **B: 対戦ドメインとライフサイクル境界を狭く導入（推奨候補）** | 切替条件と二層の再送を一つの操作入口へ集め、既存エンジン・repository・worker を活用できる。 | 現行 route の重複を移す際に同一応答と同時実行の確認が要る。保存方式の決定は別に残る。 |
| **C: 現行 route ごとに切替判定を追加** | 各変更を小さく開始できる。 | 通常 HTTP、SSE、alias、HTTP 再送、state 再送に同じ規則を維持する費用が続く。 |

## 影響と検証

- `vt101` は候補 read model と UI / random / auto から V3 世代を選ぶ。`vt102` は直接 API の最終ゲート、battle binding、全 consumer、共通ライフサイクル境界を担当する。`cc305` は Stage で必要な切替・履歴条件と release 経路をレビューする。
- 既存の create / advance / idempotency 試験を基準に、V3×V3 作成、V2×V2・混在の新規拒否、両者の固定 ID・digest・snapshot、編集後の GET・turn・HTTP/state 再送を実経路で検証する。
- 未完了旧対戦について、通常 HTTP・SSE・alias・作成再送・advance 再送・対戦一覧・詳細・キャラクター別履歴・narration snapshot/events/follow/receipt を横断して継続・復活を防ぐ。idempotency 行、outbox/worker、provider 記録が確定点後に新しい対戦応答や副作用を生成しないことを確認する。完了済み履歴の可読性を別に確認する。切替と進行の競合を一つの代表例で確認する。
- 採用する保存方式と関係表の保持・削除方針は、対象環境の件数・依存記録の読み取り後に確定する。実データへの適用は別の権限と事前・事後の読戻しを要する。

## 見積りと更新点

| 範囲 | 現在の根拠 | 今回の見通し |
| --- | --- | --- |
| `vt102` V3 binding と全 consumer | 子 PERT の 3 / 4 / 5 Point。実作業は suspended。 | 既存の相対見積りを基準として保持する。境界抽出による増減は、最初の V3 実経路の実測後に更新する。 |
| `vt101` 登録・選択 | 子 PERT の 2 / 3 / 4 Point。 | `vt102` と異なる作業として実測し、選択側の変更量を更新する。 |
| `vt101`–`vt107` 初回 Stage 子計画全体 | 資源制約込み 13 Point、3 Point/日。三つの小規模な同日作業から移した速度。 | 全 Stage 経路の現行スコープ計算は約 4.3 作業日。`vt101`/`vt102` の設計対象だけの見積りではない。切替適用と外部承認待ちは別に計上する。 |
| 親 `cc305` の Stage 経路レビュー | 親 PERT の 1 Point。 | 子計画の 13 Point に加算し、初回 Stage の現行計画は計 14 Point。 |
| 旧・進行中対戦の切替 | 対象件数、非 cascade 関連記録、保存方式が未確定。 | 作業量は未算定。対象環境の件数と、物理削除・保存の双方で必要な変更点を確認してから見積もる。 |

次の測定点は、要件の保存方式を確定した後の最初の `vt102` V3 実経路作業の開始・終了、および切替対象件数の読取りである。2026-09-29 を最短の再見積りチェックポイントとし、担当者の稼働日、外部承認・配備待ちを分けて日付を更新する。既存の 3 Point/日は小規模作業の標本であり、V3 戦闘実装の実測値ではない。

## レビュー判定と次の権限

- **INSIDE（今回の設計）:** 参加資格・固定 binding・継続適格性・二層の再送・通常 HTTP/SSE/alias の単一操作境界を整合させる。
- **OUTSIDE（後続の実装・適用）:** 正確な class/module 名、SQL、既存コードの移動順、Stage/production データ操作、配備・受入を決める。
- **BOUNDARY_DISPUTE（上位の要件判断）:** 未完了旧対戦を物理削除するか、保存したまま再開対象から外すか。方式ごとに関連記録と履歴閲覧の意味が変わる。オーナーの方式決定を受け、必要な後継 ADR とこの設計を整合させてから実装する。

この候補はオブジェクト指向の責務集約を提案するもので、保存方式・要件候補・ADR を受入済みにするものではない。
