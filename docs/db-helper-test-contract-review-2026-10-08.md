# DB準備helperのテスト契約 — 2026-10-08

全247単体ファイル＋4E2Eを保持する封印目標のうち、原3ファイル7ケースを扱う。現行requirementsのDB構成はPostgreSQL 17/Supabase、SQLiteは移行元・ローカル開発だけに限定する。NFR-10のtransaction/idempotency/lease完備をこのhelper試験から主張しない。

## CAファイル設定

`postgres-config.test.ts`原4ケースは、環境変数の未設定・空・空白で設定生成が例外にならず、非空の存在しないpathでは例外になることを確認する。接続URLはfixtureで、ネットワーク接続しない。CA bytes、TLS handshake、server identityやSupabase到達性を実証しない。`docs/postgres_migration.md`のCA override説明は既存実装の操作説明として参照し、古いSQLite live-source記述を現在の稼働事実や新しい規範の根拠にしない。

## 移行ファイル探索

`postgres-migrations.test.ts`原1ケースのSQL対象名選択、並び順、repeatable checksum assertionsを保持。64桁hexだけではSHA-256正値を識別できなかったため、SELECT 1/2と改行の既知SHA-256値と読み出したSQL bytesを追加する。SQLファイルをprivate一時ディレクトリに置く。migration適用・applied-table差分・rollback・接続成功を検証したとは扱わない。

## SQLite移行元の検査

`sqlite-to-postgres.test.ts`原2ケースはprivate legacy SQLite fixtureだけを使う。原JSON/boolean/count/warning-count/error assertionsを保持し、historical ID値とwarning文面の保持を直接確認する。invalid JSONケースは既存検査error assertionに加え、実CLIの--sourceだけでstatus1とSource inspection failed、成功メッセージがないことを確認する。--apply/--verify-targetは使わずDIRECT_URL/SUPABASE_PROJECT_REFは空にする。PostgreSQL import/target検証は実行しない。

検査producerの2つのcastを、固定PRAGMAのtyped SQL rowと選択列をunknownとして持つSourceRowのtyped statementへ置換する。readonly/fileMustExist、deferred transaction、finally close、既存SQL/error/count処理は保持。installed better-sqlite3のpragmaは既定でPRAGMA statement.all()を返す。移行元のJSONを現行キャラ定義・戦闘状態のvalid schemaとして承認する修正ではない。

## 因果リンクと検証範囲

採用済みrequirementsのDB/SQLite source-local境界→3つの責務別設計（この資料）→それぞれのproducer→各原test whole fileを接続する。操作説明を独立したowner採用・移行実行許可へ昇格させない。Seal messageは実行されたCA path選択・checksum探索・private legacy source inspection/CLI rejectionだけを示す。独立レビュー、原case/assertion保持、診断7pass/0fail/0skip、workspace typesとSeal source/Cause/readbackで確認する。全体が未封印を理由に停止する契約を維持する。
