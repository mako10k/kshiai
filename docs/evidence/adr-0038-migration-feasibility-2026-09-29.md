# ADR-0038 既存 Battle 移行の30分判定

- 対象: [ADR-0038 revision 3 候補](../adr/0038-narration-fragment-commit-and-result-reveal.md)における既存 Battle・完了履歴の適用範囲
- 判断基準: オーナー指示（2026-09-29）。最終的なプログラムの複雑さを最小化し、移行の調査・実施・検証の総作業時間を30分以内に収める。超える場合は消去などの代案と影響を提示する。
- 方法: 現行スキーマと読取経路の読み取り。実データへの変更や件数調査は実施していない。

## 観測した保存形式と利用先

- Battle 本体は `battles.state_json` に保存される（[初期スキーマ](../../backend/migrations/0001_initial_postgres.sql)）。
- 既存の実況は `battle_narration_entries` の `(battle_id, receipt_id)` と terminal narrative を単位とし、表示本文も `battle_presentations` の同じ receipt 単位で保存される（[実況スキーマ](../../backend/migrations/0014_ordered_narration_worker.sql)、[表示スキーマ](../../backend/migrations/0013_battle_presentations.sql)）。これらに、新 Fragment の source coverage、ナレータメモリ遷移、終局を実際に語った検証結果は独立した項目として保存されていない。
- 履歴一覧の結果ラベルは Battle の状態から作られ（[Battle 一覧](../../backend/src/repositories/battles.ts)）、結果カードも `battle.status === "finished"` から表示される（[Battle 画面](../../frontend/src/pages/BattlePageView.tsx)）。Battle 記録はキャラクター別検索や過去対戦の参照にも使われる。
- PostgreSQL / SQLite ともに、presentation・entry・lease・retention は Battle 削除時の cascade を持つ一方、実況 attempt・event・outbox は Battle への外部キーを持たない（[PostgreSQL](../../backend/migrations/0014_ordered_narration_worker.sql)、[SQLite](../../backend/src/db.ts)）。消去案は `battles` の削除だけでは完結せず、これらの記録と provider 利用記録の保持方針を別途定める必要がある。

## 判定と選択肢

実データの件数・状態、旧本文から新 Fragment の出典と終局叙述を証明できる範囲が未確認である。現時点で完全移行が30分以内に終わるとは判定できない。旧 receipt 本文を検証なしに新 Fragment と呼ぶ変換は採用しない。

第一候補は、30分の総作業枠で実データ調査、変換対応表、試行、検証まで完了する一回限りの移行である。上限内の成立を確認できない時点で作業を止め、旧 Battle の書き出しとアプリ内記録の消去・初期化を具体案としてオーナーに提示する。消去案では完了履歴と進行中 Battle がアプリから見えなくなり、キャラクター別履歴・過去対戦参照にも影響する。対象範囲、書き出し形式、保持先、非 cascade 記録の処置、削除手順、復元可能性は決定前に示す。データ消去・移行実行はこの調査では行っていない。

旧方式と新方式の永続的な二重実行は、最終的なプログラムの複雑さを増やすため、時間超過を理由に自動採用しない。
