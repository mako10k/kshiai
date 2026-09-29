# vt109 実装レビュー

対象: cc304 上の固定 Neva/Rio 候補の準備、所有者レビュー、確定、世代の append/CAS、有効候補の選択。基準: V3 authoring v5 R2/R18、ADR-0010/0014。次工程: vt102 の Battle 束縛、vt110 の切替、vt106 の Stage データ適用。

独立担当 `/root/vt109_contract_test_map` が読み取り専用で確認した。

| 分類 | 指摘 | 対応と再レビュー |
| --- | --- | --- |
| INSIDE | 元の指定と追加設定の比較が欠けていた | 元指定を fixture factory から取得し、digest を検証して attempt へ保存。レビューへ元指定と項目別の追加詳細を表示。再レビューで解消を確認。 |
| INSIDE | provenance.attemptId が fixture 内の仮IDを指していた | 保存時に実際の attemptId へ束縛し、保存と確定の双方で attempt/source digest を確認。再レビューで解消を確認。 |
| INSIDE | PostgreSQL の同時準備に replay/insert 競合の可能性 | 同一owner/request key の transaction advisory lock を replay 前に取得。更新後の確認で解消。実PostgreSQLでの実行証拠は別途取得する。 |
| OUTSIDE | バトル側の ready reader はV2型 | vt102 の不変リビジョン束縛で扱う。登録後の一覧選択は今回の対象。 |
| OUTSIDE | Stage・実PostgreSQLでの登録 | vt106 で実対象・権限・readback を確定する。今回は合成所有者によるSQLite試験。 |

固定候補の内容と検証記録は candidate_digest で、採用は succeeded/result_generation_id で対応付く。Accepted契約に独立した追加の承認イベント保存義務はなく、新規仕様を追加する判断は行っていない。

再レビュー: 上記2件の元指定/provenance指摘を解消。変更経路に新たなINSIDE欠陥を静的確認で検出せず。独立担当は試験を実行せず、主担当の実行記録を別添とする。
