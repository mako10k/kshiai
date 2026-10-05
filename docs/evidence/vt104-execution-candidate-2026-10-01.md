# 初回V3試行 — 次の実行候補

2026-10-01。ローカル実装の外部実行はまだ許可されていない。同期先候補は既存origin/codex/cc304-focused-revise。公開mainへのmergeやrelease tag作成は同名branchへの同期と別判断。

## 固定済みのローカル候補

- workflow: .github/workflows/v3-trial.yml（phase prepare / deploy）。既存stage/promote/rollbackは保持。
- source manifest: vt104-unreleased-trial-source-2026-10-01.json、563 paths、aggregate `8b4b84783e617cac1fe1ec42ca1dfc1da937070c532e2904e0d02253417cfa00`。このdigestはソース集合の同一性であり、配備済みidentityではない。
- 現在local HEAD/origin:03ef49c。今回の変更は未commit/未pushであり、そのHEADに新workflowが存在するとは扱わない。Neva/Rio固定候補は現source集合のfixturesに含まれる。
- 受入: vt104-design-owner-acceptance-2026-10-01.json、ADR0042/具体設計v1 option1。通常の認証済利用者のpreviewアクセスは受入範囲。

## prepareの作用候補

sourceを同期・readbackした後、既存要件に適合するexact annotated tagと四CIを照合し、tagからownerがprepareを一回dispatchする。Cloud Build一回、GCS source uploadとArtifact Registry image作成、GitHub準備artifact一回。DB/schema/runtime配備/Worker upload/paid LLMを実行しない。source/tag/run/imageの実identityを記録する。tag番号とhosted commitは未取得。

## deploy packetの入力

workflowはcredential-free JSONをexecution_packet入力で受取り、その入力UTF-8そのままのSHA256をpacket_sha256で照合する。pretty-print等でbytesを変えた場合は別候補となる。prepareRunIdからGitHubに独立照会し、成功した同source workflow/runの唯一の準備artifactとcommit/tag/imageを照合する。

| field | 固定方法・現在の状態 |
|---|---|
| schemaVersion | 1 |
| commitSha / releaseTag / imageRef / prepareRunId | 同期したsourceの実prepare結果。現時点で未取得 |
| targets | project=kshiai、region=asia-northeast1、service=kshiai-api、job=kshiai-v3-trial-preflight、queue=kshiai-narration、worker=kshiai-web |
| stoppedAt / expiresAt / cutoverAt / cutoverId | 承認済停止・旧unfinished処分の実時刻とidentity。expiresAt−stoppedAtは1800秒以下 |
| disposalReceiptId / oldWritersClosedReceiptId | exact対象・旧writer停止・処分の独立readback。未取得 |
| directUrlSecretVersion | kshiai-direct-urlの数値version。秘密値は入力しない。未取得 |
| pendingMigrations | 同imageのrequired migrationと実DBのpending集合を照合した正確なファイル名一覧。未取得 |
| secretVersions | 現serviceの全secret envを同じsecret identityの数値versionにpinするenv/name/version一覧。未取得 |
| maximumWrites | jobDeploy=1、jobExecute=1、backendDeploy=1、workerUpload=1、queueResume=1 |
| providerBudgetReceiptId | 実owner試行のprovider会計上限・費用範囲を指定した承認記録。未取得 |

既存Cloud Runのmanual0とtagなし、queue PAUSEDかつtask0をlive readする。manual0はtagged revisionを停止しないため、tag閉鎖は独立に確認する（[Cloud Run公式仕様](https://docs.cloud.google.com/run/docs/configuring/services/manual-scaling)）。進行中のwriter/job/schedulerの停止はoperatorが対象一覧で確認し、そのreceiptと実DBのquiescenceを組み合わせる。DB preflightは旧unfinished/active provider/reserved attempt/narration/authoring jobとoutboxを確認し、zeroでない場合はmigrationやAPI startupへ進まない。解釈不能な旧stateや未解決backlogは追加削除へ読み替えない。

同じimageのrequired pending migration一覧がpacketと一致した場合だけapplyし、pending0を再確認。新backendはno-traffic、CUTOVER二変数除去、secret versions固定、narration targetを候補tagへ固定。image/env/tag/公開traffic不変を読戻す。Worker shared preview設定のGETが既存所定値と違えば、変更せず別payload候補へ戻す。Worker versionを一回upload、version/bindingを独立readbackし、edge/startup/DB/direct保護の実receiptを検証する。empty queueを一回resumeしてRUNNINGを読戻す。

command timeoutはjob execute240秒、backend deploy300秒、Worker upload120秒。書込み前にもstop deadlineを確認する。timeout/応答欠落は失敗を確定した証拠ではなく、remote readbackまで未決着とし、workflowを無条件再dispatchしない。停止条件が成立しない場合や未知の旧writerがある場合は作用を開始しない。

## owner setupとgame

実Google redirect/CORSがpreviewに適合するかを読戻す。設定追加が必要ならexact値/maxwriteを別実行範囲で提示する。existing owner IDへregister-v3-stage-trialを一回実行する対象と最大二candidate attemptを許可し、ownerが通常画面からreview/confirmする。generation ID/digest、実browserの作成/進行/SSE/reload/結果を記録する。

validatorはpreparationとgameを分ける。gameにはGoogle user mapping、character ownership、二generation、before/after/reload/resultのbattleRevision/turn/status/winnerSide/resultDigestが必要。resultDigestは実stateからJSON.stringify({winnerSide: state.winnerSide, finishReason: state.finishReason, adjudication: state.adjudication ?? null})のUTF-8 bytesをSHA256化して取得する。各観測でこの同じフィールド順・投影を使う。validatorは入力間の整合を確認するだけで、実観測のauthenticityを生成しない。token/password/profile本文は記録しない。

## 次の判断と出口

次はin-scope source/文書/PERT/SealGraph記録を同名branchへ同期する範囲と、実prepareのsource/tag/最大作用を具体化する。同期後のremote SHAとlocal SHAの独立一致が出口。次に現cloud readbackをpacketの未取得欄へ入れ、deploy/旧unfinished処分/owner登録/paid試行をそれぞれexact範囲で判断する。配備準備のreceiptだけでGoogle/V3試行を完了にしない。

内部残工数: vt1040.25–0.75 agent h、初回試行1.5–4.25 agent h、親4.5–11.25 agent h（後続3–7hを含む、低確度）。外部承認・owner待ちは別。今回のローカル実装・試験sliceは完了、実Stage価値は未達。
