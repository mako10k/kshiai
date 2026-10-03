# vt109 固定V3候補の正式登録

2026-09-29。Accepted の [V3 authoring 要件 v5](character-v3-authoring-requirements-v5.md) R18、[ADR-0010](adr/0010-structured-selectable-asset-envelope.md)、[ADR-0014](adr/0014-queue-asset-authoring.md) を実装へ対応付ける詳細設計。

## 対象と責務

受益者は Neva/Rio を Stage で試す所有者。今回の成果は、固定候補を通常のレビュー画面で確認してから登録できるアプリケーション経路。Stage での利用は vt105/vt106/vt108 の適用後となる。

- CLI は明示した DB と既存所有者に対して候補を準備する。`--db` はローカルSQLite、`--configured-database` は設定されたDBを使う。返却値は character ID、attempt ID、状態、候補全体の digest、`/reviews/{attemptId}`。
- authoring repository は通常の create attempt と候補、通知、生成 job/outbox の completed を同一トランザクションで保存する。公開キャラクターと current generation は所有者確定時に作成する。
- 候補検証・表示モジュールは V2/V3 の正規スキーマで型を確定し、V3 の必須 consumer `battle-mechanics@3`、公開投影 digest と claim receipt を検証する。既存 profile-v2 adapter を候補作成と検証で共有する。
- 既存の所有者限定 review API/UI は固定候補の全設定、公開範囲、公開説明、生成来歴、検証記録、保留値を表示する。元の作成指定を保存し、名前・タグ・性格・紹介文を起点とする設定と、今回追加した詳細を比較表示する。元指定の digest と生成 contract を保持し、candidate provenance の attemptId は実際の登録試行へ結び付ける。固定候補の識別子は元指定の candidateId として残す。準備コマンド自体は provider を呼び出さない。
- confirm API はレビュー応答の `candidateDigest` を受け取り、現在の保存済み候補の digest と一致した内容だけを採用する。generation の append、current pointer の CAS、キャラクター表示用投影、ready 状態、attempt 完了を一つのトランザクションで確定する。
- 固定候補の調整は破棄と新しい準備を通す。通常のV2生成チャットへ渡すことを API/repository 両側で防ぐ。破棄後に同じ論理IDで再準備するときは `--request-key retry-1` などの新しいキーを明示する。同じキー・同じ内容の再送は元の試行を返す。

## 再試行と競合

同じ準備入力は同じ attempt を返す。異なる入力での同一キー再利用は競合として返す。PostgreSQL では準備キーの transaction advisory lock、確定時の attempt 行ロック、共通 append/CAS を使う。SQLite では既存 transaction queue を使う。確定の再送は記録された結果世代を返す。破棄・期限切れ・所有者不一致・候補 digest の変更・current pointer の競合では新しい世代を有効化せず、append を含めてロールバックする。

## 検証と次工程

現在の判定対象は、固定V3候補の prepare → review → confirm → selection と失敗時の状態維持。V2登録と focused V3移行の既存試験も回帰確認する。SQLite の合成所有者を使う実API試験と、UIの表示・送信契約試験を分けて記録する。PostgreSQL 共通コードの確認と実サーバー実行の証拠も分ける。

新規バトルの不変リビジョン束縛は vt102、対戦ライフサイクルと切替は vt110、実Stage登録は vt106 が担当する。これらの完了は本登録経路の試験から推定しない。provider による一般のV3生成・改訂・移行評価は親計画の後続項目に従う。
