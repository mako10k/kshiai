# vt104 — Accepted runtime control のローカル実装・隔離確認

ゴールまでの見込時間: このローカル実装・隔離確認の残作業は0。vt104全体は1.25–3.5 agent時間、Stage試行（cc314）は3.25–8時間、親ゴール（csm001）は6.25–15時間。いずれも低信頼度の暫定内部作業見積りで、外部承認・実行日時待ちは含まない。vt104は回復packet 0.75–2時間 + release/content確定0.5–1.5時間、Stageはさらに2–4.5時間、親ゴールはさらに3–7時間と仮定した。実測velocityはvt103の25p/17時間という小標本で、この異種運用準備にそのまま適用できない。次のcheckpointは回復・release・content packetの未確定入力照合。

## 権限と対象

Ownerは「ADRと詳細候補を受入れ、ローカル実装へ」と回答した。対象はADR-0040 revision 1とlinked詳細設計候補の受入れ、および記載file setのローカル実装・隔離試験。ADR-0039の既存V3 lifecycleを上位入力としている。cloud停止、本番DB/migration/削除、配備、promotion、GitHub writeは許可範囲外であり、今回実行していない。実装・試験はownerの本番切替承認を代替しない。

作業先は `/home/katsumata-m/.codex/worktrees/cc304-focused-revise-kshiai`、branch `codex/cc304-focused-revise`、開始HEAD `f58ac2f6e676f9eab486c98787908ee69f7bc60f`。今回の未コミット変更はこの作業先に保持する。新たなcommit/pushはしていない。

## 確認した機能

- immutable cutover/artifact identityをDB append/CAS revisionに保持し、closed/trial/openを同じrelease内で制御する。
- closedでは一般readを含むHTTP、provider、task、backgroundを503/no-storeで拒否する。healthはread-only。認証は既存sessionのSELECTだけとし、provisionや期限切れsession削除を行わない。
- 指定ownerのexact二authoring attemptだけ通常review/confirmを許す。実際のNeva/Rio confirmからsettled permit、current generationを照合し、trialへ遷移、固定generationのV4 battleを通常APIで作成するローカル結合試験が成功した。HTTP200は現行APIの成功契約に従う。
- trialは固定owner、generation、request digest、deterministic battle ID、回数上限で限定する。初回保存前providerだけtrusted prospective creation contextを用い、worker/taskは保存済みV4のreceipt/outbox/generationを照合する。通常ownerでもlegacy観測accountのcontextを前提にしない。
- providerの物理送信と会計readbackを区別し、送信不明はindeterminate、会計未完はaccounting-pendingに保持する。予約期限だけでsettledにしない。停止barrierはsending/pending/unknownが残ると成立しない。
- SSEはbody完了までsendingを保持し、完了時にdigest/settlement、取消時にpartial digest/indeterminateを記録する。
- exact operation replayはoperator・payload・previous revisionを比較する。違う内容の再実行は拒否する。trial後の回復は新V3データを保持する前進復旧。
- review専用UIは一般navigation/edit/retry/discardを隠し、confirm後もexact reviewに留まる。cold startupとCLI readが暗黙のSQLite DDL/seed/provider送信を行わないことを確認した。

主な実装境界は repositories/cutover-control、services/cutover-admission、services/cutover-http-admission、operator CLI、既存dispatch/provider accounting、routes/battle-service、review UI。新規・変更moduleに実責務のRコメントを置いた。通常open/legacy confirmationの回帰も確認する。

## 固定ソースと来歴

`vt104-cutover-control-source-2026-09-30.json` は535pathを含み、aggregate SHA-256は `2c672054f527bf103040e1b8f21fd459bf195d036c7711c18e3ec189c2bc5cc8`。全entryをfilesystemから独立readbackし、hash不一致0を確認した。対象は実装・テスト・runtime inventoryであり、本資料など後続報告の同一性を主張しない。

実装REF `implementation/vt104-cutover-control-local-20260930` のSealは `2884959358d304460287735d02310acd6c2f562c344cd5954397eb931ced3ce7`。CauseはAccepted detail design、その上位はAccepted ADRと今回のowner acceptance。16個のverification REFをこの実装Sealへ結び、unit/e2e inventoryに登録する。初回登録ではrepository/CLIの同名basenameが重複したため、CLI REFを `verification/vt104-cutover-control-cli-20260930` に分離し、旧実装Sealとのprevious関係を保存した。SealGraphは内容同一性と記録した来歴を検証するもので、意味的受入れ・本番事実・実行権限を保証しない。

CLI llmthink auditはfatal/error/warning各0、info1/hint49。pending外部入力による確定度制限を保持する。DSL/auditは隣接evidenceに保存した。

## operator packetに必要なexact binding

ownerConfirmationReceiptIdsはpaper receiptではなく、指定二候補の通常confirmで実際にsettledしたpermit IDを順序付きで指定する。ownerCandidates/generation IDsと、成功attempt・character current generationのDB readbackを一致させる。

trial HTTP bindingは `{method,path,body,idempotencyKey}`、provider bindingは `{operation,provider,model,battleId}`（method PROVIDER/path operation）、background bindingは `{backgroundKind,battleId}`（method BACKGROUND/path kind）。narration taskの事前bindingは `{taskKind:"narration",battleId}` とし、後から生成されるoutbox/receipt/generationはworkerで実物を検証する。battle IDは通常typed requestとidempotency規則のdeterministic値を使用する。

CLIはDB接続先とcutover/artifact identityを明示する。SQLiteは隔離setupでschemaを明示初期化してから使い、readはDDLを実行しない。pending/unknownの手動照合にはexact permitと観測根拠が必要で、強制expiryや一括settledは回復策としない。openに必要な8 Stage receiptとproduction receiptはoperator assertionsであり、独立したrelease規則の実物確認が別途必要。

## 制約・次工程

実際のreview→trial作成は隔離SQLite + Mock provider、ブラウザはroute mockを含むUI確認。PG17.11のcontrol integrationは隔離clusterで検証した。synthetic186battle/18activeのbackup/restore/cutover rehearsalは別資料にあり、実DBの容量、role/extension、保護保管、転送、実回復時間を証明しない。30分停止上限への適合は未確認。Stageで利用者がV3対戦を遊べる実現価値はまだ0で、今回の価値は切替controlのローカル適合証拠を得たこと。

次の推奨作業はvt104の実行packet確定。実snapshotの保護保存・restore/前進復旧の手順と時間、旧writer/tag/queue/jobの停止対象、exact owner/candidate/content、main/四CI/artifact identity、停止日時と独立した実行承認を揃える。cloud inventoryは過去観測であり、実行直前にfresh readbackが必要。これらが整うまでvt104を完了扱いにせず、vt105以降の外部試行へ進めない。

最終確認: npm testはbackend159 + shared24 + selector9 = 192件成功、PG17 controlは3件成功、review browserは4件成功、release regressionは23件成功。typecheck/build/ADR check/diff check/SealGraph fsckは成功した。npm testはauthority-selected34ファイルを対象とし、全discovered177ファイルの成功を意味しない（provisional2、disabled141）。今回の15 unit + 1 e2eはすべてcurrent/active。Viteの既知の815KB chunk警告を保持する。

ローカル実装区間は15:44:57〜18:06:50 JST、観測経過2時間21分53秒。最終read-only検証・記録整備はその後実施した。vt104はsuspend、外部gate待ちのunfinishedであり、complete actualを作っていない。

試験の最終結果と作業actualは `vt104-cutover-control-validation-2026-09-30.json` に記録する。開始観測は2026-09-30T15:44:57+09:00。経過時間には試験待ち・委任が含まれ、person effortは未測定。canonical PERTをsuspendし、completed-task velocityを再観測する。共有workdayは停止しない。


## 18:22以後の準備照合による範囲訂正

[最新execution packet](vt104-execution-packet-2026-09-30.md)でowner user IDとGoogle連携、二候補digest、fresh cloud metadataを照合した。local実装完了・残0の記述はcontrol本体/HTTP/provider/task/UIの試験済み範囲に限る。Accepted detailが要求するPG/Auth/R2等Stage smokeのpermit接続とworkflow統合は未完了で、全Stage受入の実装完了とは扱わない。既存email smokeの別user provision/V2 fixtureとowner限定trialの適合は詳細化が必要。vt104残2.25–5.5、Stage残4.25–10、親残7.25–17 agent時間（低信頼度、外部待ち別）。現候補migrationは0030追加で0026–0030の5本。上記過去観測・見積りを最新候補と混同しない。
