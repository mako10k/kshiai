# V3試行 RC2 準備後の引継ぎ（2026-10-01）

所有者の全作業チャットへの終了・引継ぎ・コミット・push指示を元チャットのユーザーメッセージで確認し、21:10 JST頃までに区切る。共有worktimectlの計画終了22:00は変更しない。共有stop/endは実行しない。

## ゴールまでの見込時間

ゴールは「V3でのユーザ体験を早期に実現する。現行の認証から必要性がない限り変更はしない」。実GoogleユーザーによるNeva/Rioの確認・選択・実対戦・再読込・結果の証拠は未取得で、現時点の実現済みユーザ価値は0。今回の寄与は配備可能な新イメージと処分経路の証拠を揃えたこと。

残内部工数のagent暫定見積り（すべて低確度）：vt104の接続確認・最終実行候補0.25～1h、ログイン前まで1～3.25h、初回試行1.75～5.25h、親csm0014.75～12.25h。外部承認・ログイン待ちは別で、完了日時は未確定。既存25p/17hはelapsed標本でperson effortではない。vt104は20:12:44～20:37:00と20:41:31以後のwork_eventで計測。未完了なので有効な完了task velocityはまだ得られていない。次の計測更新はGCP接続確認と最終packetが揃うcheckpoint。

## 継続する作業ツリー

`/home/katsumata-m/.codex/worktrees/cc304-focused-revise-kshiai`、branch `codex/cc304-focused-revise`を再利用する。mainは`/home/katsumata-m/kshiai`の933e6aefda461d71d6f7e5d31bcad6ed1d7c63bb。未完了の別branchを統合しない。今回のcloseout HEADはRCソースとは別の文書/provenance commitになる。

## 到達点と固定されたソース

- 修正ソース：4ab19719ef7fa61cdfb8571c4579c3c64cc96dfb。
- annotated tag：v0.23.0-rc.2、tag object1b2ab0145ced1b7f0a8ecf27e9b1126b8047e7ff。リモートpeeled SHAを独立照合済み。RC1は保持。
- CI36856943670でvalidate/security/backend-image/workerすべて成功。
- prepare36857282507が成功。Cloud Build8b93a707-31bd-470c-9cbe-e68870086fa3。
- 新イメージ：`asia-northeast1-docker.pkg.dev/kshiai/kshiai/backend@sha256:2e7051ec6395d36a27124ace0cad8d032bbb6b47878509339b05ce27c679c056`。
- workflow artifact、Cloud Build results、Artifact Registryでsource/tag/digestを照合した。prepareのruntime変更stepsはskip。詳細`docs/evidence/vt104-hosted-prepare-rc2-2026-10-01.json`。
- 通常選択テスト234件成功（active41ファイル、provisional2/disabled141は非実行）。型・jscpd/Lizard・build成功。閾値は変更していない。source限定fixtureのSQLite/PG17に加え、compiled JavaScript CLIの隔離PG17も13項目成功。
- initial-trialだけsnapshot不要、既存snapshot経路維持。0029のreceipt DDLを処分と同transactionで先に用意し、失敗時rollback。正式migration ledgerは先取りしない。期限・lease・frozen outbox identity・再実行・強いreadbackを検証。実18件の処分は未実行。
- Google/Supabase/PKCE/subject mapping、認証設定、公開traffic、公開Workerを変更していない。

## 現環境の観測と限界

20:46頃のcloud read-only：public100%=`kshiai-api-00141-vis`、旧tag78、queueRUNNING/tasks0。これは停止後の証拠ではない。20:55頃の`kshiai-v3-trial-preflight`は未作成、executions0。

新compiled CLIのread-only previewは既存`kshiai-database-url:1`のsession pooler経路で成功：project cvrbhpkfqkpqdegxfrlq、database postgres、schema public、未完了18/完了168/finished outbox14。planは`docs/evidence/vt104-rc2-readonly-plan-2026-10-01.json`。cutoverId=v3-trial-rc2-20261001、cutoverAt=2026-10-01T11:52:57.316Z、planDigest=c5ac4056d81ce1f5722f42ab90cb92e188e6b5f636544e87f96331cb6f6c22f8、UTF-8 bytes SHA256=6f198d847c5a62036b753eb7179f249aa368a03864b0fd07da09ff589a1520f0。再開時には新鮮な集合/hash照合が必要。

手元から`kshiai-direct-url:1`はENETUNREACH。秘密値は未記録。GCP上の新イメージから同secretへの接続は未観測で、手元の失敗からGCPの失敗を断定しない。既存pooler credentialをread-only観測に使っただけでsecretやruntimeを変更していない。

所有者は手元の開発サーバー・別チャット更新について「していない」と回答。これはuser-reportedであり、cloud job/queue/provider quiescenceの独立観測に置き換えない。

Cloud Runのmanual0は通常service URLを停止するが、traffic tagでのみ有効なrevisionへのアクセスは停止しない。旧tagを除去した後に新candidate tagだけを作る設計を、公式資料で確認した。https://docs.cloud.google.com/run/docs/configuring/services/manual-scaling#disable

Cloudflareのlive preview設定、GCP新imageからDB、Google preview callbackの必要な実URL、provider budgetは未確認。旧RC1のinventory/packetは履歴で、新実行packetのsource/imageへ流用しない。

## 次の具体的な作業

1. repository-start、worktime、canonical `docs/character-v3-stage-trial.pert`のdocument check／dag analyze --schedule both／dag next／observe-velocityを新鮮に読む。
2. 停止前の接続確認を所有者へ提示する。候補：kshiai/asia-northeast1、job `kshiai-v3-trial-preflight`を上記digestで1回作成、DIRECT_URL=`kshiai-direct-url:1`、service account=`kshiai-cloud-run@kshiai.iam.gserviceaccount.com`、retries0、timeout120s。command=node、argsは`backend/dist/scripts/prepare-unreleased-v3-trial.js preview --configured-database --project-ref cvrbhpkfqkpqdegxfrlq --schema public --cutover-id v3-trial-rc2-20261001 --cutover-at 2026-10-01T11:52:57.316Z`。1回executeし、execution/logとexact planを照合する。CLI previewはtransaction READ ONLY。job作成・executeはexternal writesなので、prepare承認だけでは実行しない。候補は未承認・未実行。失敗時は停止しない。接続先変更は原因の追加観測とexact owner選択へ戻す。
3. 接続成功後、現writer/queue/18targets/14outbox/168finished/secret/pendingを読み直し、停止→初回trial処分→migration→no-traffic backend／Worker previewのexact packetと回復候補を作る。所有者のexact承認を得てから作用。receipt IDや停止時刻、期限、provider budget receiptを捏造しない。停止期限は最大30分、workflowの各残時間閾値を守る。
4. Cloudflare shared preview設定は読み、その実差分だけが必要なら別承認。Google provider/mappingは維持し、取得したexactpreview callbackだけのallowlist追加が必要か確認する。同origin /apiについて根拠なくCORSを変えない。
5. 配備後にGoogle ownerがNeva/Rioのordinary review/confirmでimmutable V3 generationsを有効化し、実対戦・進行・SSE・reload・結果を確認する。ここまで未完了。vt104～108と親goalを完了扱いにしない。

## 再開時の注意と同期

既存phase=prepareの36857282507はcompleted success。観測期限が切れても再dispatchしない。RC2 tagを動かさない。CI成功は4ab1971ソースに対する証拠で、closeoutの後続文書commitには外挿しない。

GitHubへのgit/ghはmain secdat domain `/home/katsumata-m/kshiai`経由でGH_TOKEN secret-layer injection dry-run後に実行する。今回の終了指示はこのチャットの引継ぎcommit/pushを許可した。merge／追加release／実DB処分／停止／配備／有料provider呼出しは許可していない。

完了条件のない実DB/API変更は行っていない。共有worktimeはworking/planned22:00のまま。ローカル専用PG17 serverは停止済み。引継ぎcommitをpushし、remote SHA/local HEADとclean statusを確認して報告する。
