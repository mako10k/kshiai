# 裁定rc.20実測と再開点

## 達成したこと

配備候補アプリv0.23.0-rc.20、main 44f2bd287e9cb68d071620ddb3a63d72e4f56545、PR174 merged。main CI37929073817は4ジョブ成功。元251テスト（単体1473/E2E10）は全件成功、正式結果Seal 0cb76b3b0d228fc3ec8e7c1e987a9c45c69e2b1dddb422bd96db4b9a5b4c281a、Cause253件を照合済み。これはrc.20のソースに対する証拠であり、後続WIPの合格証明には使わない。

所有者承認に基づくStage37930237321は1回実行し、未完走で失敗。追加の有料再試行なし。battle btl_652a4d1e91bb2a20ec7f0e01ae5579a7。自由行動の実呼出3件を行動IDと相関できた。1件invalid_proposal、1件accepted、3件目provider/timeout。成功2件は49,223ms/57,680ms、3件目は60,011ms。裁定の受渡しが動いたこととログの識別は確認したが、試合の品質・公開配備は未達。

記録済み総トークン401,350。1件のタイムアウトは使用量不明、0とは扱わない。58回の物理呼出、runtimeのphysicalOutstandingは1。プロバイダー側処理終了と課金は未確認。

Stage失敗後のCloud Run独立読み取りで公開はkshiai-api-00186-zop 100%。rc.20の公開切替は実行していない。

## 提供履歴の照合

ユーザー提供ファイルはDownloadsに保持し、原文・メタデータはリポジトリへ入れない。request ed84289d-7b53-9830-9571-d63ed7857d7f（21:36:29〜21:37:18 JST）。Grok 4.5は構え直し・一歩踏み込むpossibleを返し、light追加STA、baseWorldRevision0、actionQuoteは入力原文一致。同じJSONをローカルschemaと再構成状態で再生すると負担検査はtrue。実行時invalid_proposalの原因は未特定。実行時の検査条件を持たず、原因をLLMの厳格な拒否と断定しない。

## 後続WIPと承認

所有者が新規試合の裁定1回待機180秒を承認。ADR0066 Acceptedに記録した。新規運用ポリシーawareness-v5-usage-v3を追加し、usage-v2/measurement等の旧snapshotの60秒は保持。総試合期限600秒、最大200呼出、他role期限、輸送再試行0回は維持。

行動負担検査をtyped reasonへ分解し、application_validationの構造化ログを追加した。旧receiptのinvalid_proposal表現は保持。原因が解決したとは宣言しない。

## 再開手順

1. 最新型検査・静的検査・ADR検査の結果を確認する。Node22を使用する。
2. WIP差分を確認し、ADR0066のauthorityと変更ソース・Causeの新revisionを公的SealGraph CLIで封印する。旧rc.20のSeal/receiptを上書きしない。
3. 元251テストの全件選択、ソース・実行driver・HEAD・inventory一致を確認して正式試験する。古いSealによるsource_diverged/staleの除外を合格扱いせず、未封印のWIPを迂回してテスト実行しない。
4. 新候補の同一SHA CIを成功させてから、候補固有の有料Stage1回の承認を取る。rc.20許可を流用しない。
5. 成功したStageの同一image/revision/Workerをproduction workflowに渡し、GitHub productionレビューを所有者に依頼する。
6. 公開100%・exact image/source・health/SSE・使用量/裁定結果を独立照合した後だけPERT/goalを完了する。

作業branch codex/rc17-release-evidence、checkout /home/katsumata-m/.codex/worktrees/cc304-focused-revise-kshiai。GitHub接続はmain checkout /home/katsumata-m/kshiaiのsecdatドメインを用いる。無関係な__pycache__と約207MBの生status JSONは保持しコミットしない。共有worktimectlのstop/endは実行しない。

## 本日の中断・保存

所有者の指示でテストを中断し、WIPと本資料を同じ保存コミットに含め、codex/rc17-release-evidenceへプッシュする。後続WIPの型検査・静的検査・ADR検査は成功したが、正式テストは未実行。Sealは108件中69件のexact Cause/source readbackが完了。publisherを停止し、70件目の未封印候補だけを公的CLIで破棄した。全HEADがpriorHeadsと69件のcheckpointを重ねた状態に一致し、無関係なHEAD変更はない。

再開時は保存コミットとリモート、作業ツリーを照合する。seal-plan/events/publisherを使って残り39件を再開する。publisherの22:25停止とformal runnerの22:20/22:25停止は2026-10-09の日付固定なので、再開日の承認済み時間枠に合わせて調整する。全251件のpreflightを満たすまで正式テストを開始しない。試験専用PostgreSQLは停止状態で、正式試験直前に必要なfixtureだけを起動する。公開切替・新候補の有料試験は未実施。共有worktimectlのstop/endは実行していない。
