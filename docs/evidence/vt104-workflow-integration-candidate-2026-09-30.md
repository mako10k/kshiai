# vt104 workflow接続候補

> 2026-09-30方針更新: 以下は旧保全・八smoke前提の歴史的資料。現行の初回試行条件は[計画再修正](vt104-unreleased-trial-rescope-2026-09-30.md)と要件v3を参照する。ここに記載したemail/snapshot/restoreの不足を現行vt104のblockerとして扱わない。

対象phaseはAccepted ADR0040/detailから実行packetへのローカル詳細化。現在workflowをdispatchする候補ではなく、停止前資材準備と停止中のsame-artifact受入を接続する設計候補である。上位detailはworkflow変更file setをこの段階で固定するよう求める。

## exact file setと責務

| File | 変更候補の責務 |
| --- | --- |
| .github/workflows/stage-release.yml | 明示的cutover経路を追加。停止前のimage/Worker version準備と、承認済packetによるclosed配備/trial受入を分け、八adapterの同identity/manifestを渡す。通常経路のV2 smokeをcutover経路へ流用しない |
| .github/workflows/promote-release.yml | Stage run/source/image/revision/Worker/control/八receiptsを独立照合し、protected productionのtyped確認で同artifactだけpromotionする |
| .github/workflows/rollback.yml | Stage/promoteと共通の排他に束ねる。trial開始後はsnapshot復元を選ぶ通常rollbackとして扱わず、承認済forward recovery packetへ接続する |
| scripts/verify-cutover-stage-evidence.mjs + test | 八receipt、exact artifact/run/control/manifest/settled permit readbackを照合し、欠落・混在・未決着・別artifactを拒否する。許可や受入自体をvalidatorに生成させない |

このfile setの実装前に、下記phase input・最大作用・失敗時readbackをexecution packetで固定する。既存CI/required checks、protected environment、四checks、release tagの要件を維持する。ローカルStage adapterは既に実装済みで、入口は別資料stage-smoke-detailに記録した。

## 段階A — 停止前

1. exact hosted source/required四CI/release tagとbackend image digestを固定する。WorkerのBACKEND_ORIGINにはclosed試験用のexact候補tag URLを指定し、同じWorker versionを停止前にuploadしてversion IDを固定する。tag URLは既存serviceのmetadataで読戻しできる形式・exact tagをpacketへ記録する。現在は未確定なので実在済みURLと扱わない。
2. CUTOVER_ID/ARTIFACT_ID、service/job名、env/secret version、manifestの対象/hash/各call cap、同じimageを使用するjobを固定する。artifact IDはDB policyのimmutable identityと同じ値を使用し、image/Workerの実物IDを別々に照合する。
3. snapshot保護先、archive scope、restore先/権限/owner鍵、pretrial restoreとposttrial forward recoveryの実測Rを固定する。CI/build/upload/権限/回復試験の所要時間は停止前へ置く。
4. Worker shared preview設定はread-before-writeで確認し、変更が必要な場合だけexact payload/max1を停止前資源準備packetへ含める。既存workflowの無条件POSTをそのまま残さない。

出口: source/CI/image/Worker/endpoint/control identity/全資源/回復条件が揃い、stage deploymentを始めるexact候補をownerが承認できること。

## 段階B — 共有停止内、上限1800秒

一人のexecutor、Stage/promote/rollbackの同じconcurrency group、cancel-in-progress falseで実行する。GCP console/別CI/operator操作もpacketへ指定した管理者が排他運用で制御する。GitHub concurrencyだけで外部caller停止を保証しない。

1. writer/旧tag/queue/jobを閉鎖して独立収束readbackを取得する。snapshot保護保存とhash/復号・restore保証の条件を確認する。
2. migrations/control initialize/削除transaction/independent readbackを別operationとして最大作用へ記録する。closed candidateをAのimage digestで配備し、startup mutationが起きないこととenv identityを照合する。
3. ownerが通常review/confirmで二体を確定し、実generation/permitを読戻す。二generation、HTTP create/advance・owner read/task/provider/backgroundのexact key/digest/上限と八smoke manifestsでtrial policyを固定し、trialへ遷移する。
4. queueは通常配送を停止したまま、accepted trialに必要な固定taskだけの配送方法をpacketへ確定する。global RUNNING要求をcutoverの成功条件として流用しない。既存paused queueからの配送が必要ならexact期間・task集合・fence・resume/pause回数を別途定量化する。
5. health、PG、email、Google、ownership、R2、V3 SSE、direct保護を直列実行する。各adapterのledger permit/readback、body/state結果、same-artifact一致をvalidatorへ入力する。emailは既存email accountの認証/mappingだけ、一般APIは指定ownerのみとする。
6. protected approval/typed確認、same revision/Worker promotion、公開routeのhealth/owner確認とerrors読戻し、control openの順序をreceiptで固定する。openは八条件とpromotion条件の成立後。trial開始後の障害はV3データを保全するforward recoveryへ進む。

停止内の各タイムアウト・retry ceilingの合計を1800秒の予算と比較する。現在のAPI300秒/SSE240秒/PG supervisor120秒に起動・認証・owner confirm・promotion・回復Rを加える。個々のtimeout値だけで合計成立を証明しない。最終開始時刻はT0+1800−R−readback予備で計算する。

## 不明値と次の確認

exact host commit/fourCI/tag/image/Worker/tag URL、snapshot実条件とR、二正式generation/attempt、既存email account、R2 exact object、HTTP/provider/task attempt cap、queueのbounded delivery、公開smoke identityが未確定。これらをplaceholder値でworkflowへ書き込まない。独立readbackで値を固定できる項目と、保存/retention/実行範囲などowner選定が必要な項目をpacketで区別する。

次の作業はこの候補と資源入力を具体化し、同file setへローカル実装してvalidatorの拒否ケースとworkflow構造を検証する。見込1–2 agent時間（低信頼度、vt104残時間内）。CI/資源準備/停止/実DB操作/promotionは、凍結したexact packetの実行承認へ接続する。
