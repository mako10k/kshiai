# vt104：共有本番の停止切替案（30分上限）

状態：**Prepared / 未実行 / release・停止・データ操作の承認待ち**。本案は所有者が選んだ準備方針であり、外部操作の許可ではない。

## 所有者の決定と固定対象

2026-09-30、所有者は「共有本番の停止切替案を準備」「上限30分の案を準備」を選択した。Stage専用環境の新設は今回の方針に含めない。停止日時、exact release commit/artifacts、snapshot/restore証拠、最終対象/最大writesを提示した後に実行許可を得る。

- project `kshiai`、region `asia-northeast1`、Cloud Run service `kshiai-api`。
- 現在の100% traffic：`kshiai-api-00141-vis`。image digest `sha256:e203d0ad106fecf2a579a5895d516d73e74e1e435cba482e20acb4cb48fe56ed`。
- 最新Stage：`kshiai-api-00144-hir`。image digest `sha256:60bcd06e36b7050d22501ea9ed61407ae23b1165585fb0f1e534b17b42cf1fc6`。
- 両者はDB secret `kshiai-database-url:latest`（現versionは1のみ）、queue `projects/kshiai/locations/asia-northeast1/queues/kshiai-narration`を共有する。
- DB読取で確認した接続先は `aws-0-ap-northeast-1.pooler.supabase.com:5432`、database `postgres`、server17.6。接続credentialはprocess内だけで使用し、資料へ保存しない。
- Workerは設定上 `kshiai-web`、公開route `kshiai.mk10.org/*`。live Worker version/route/preview設定は未確認。現設定・origin・traffic/tag mapを回復資料へ固定する。
- serviceに82 revisionsを確認、revision-level minはすべて0、request timeoutは300秒。tag付き旧revisionが多数あるため、main入口だけ閉鎖しても旧writerは停止しない。
- region内のCloud Tasks queueは実況queue1つ、RUNNING。観測時点のtask一覧は空。queue pauseは配送停止だけで、新taskの投入停止ではない。
- Cloud Run jobsは `kshiai-migrate`、`kshiai-auth-smoke`、`kshiai-persistent-e2e`、`kshiai-r2-smoke`の4つ。latest executionsは終了済みだが、全execution/他callerの停止証拠ではない。Scheduler一覧はSERVICE_DISABLEDで失敗し、空一覧と扱わない。APIの有効化は行っていない。

[cloud metadata](vt104-live-metadata-2026-09-30.json)、[writer metadata](vt104-writer-metadata-2026-09-30.json)、[DB暫定棚卸し](vt104-shared-db-preliminary-inventory-2026-09-30.json)、[migration preflight](vt104-migration-preflight-2026-09-30.json)が観測証拠。

## データへの最大影響と保持義務

14:27:37 JSTのREPEATABLE READ / READ ONLY transactionで186対戦を確認した。unfinished候補18、finished168、unknown status0。暫定18 IDと各stateDigestはJSONに列挙した。削除集合は停止後に再固定し、変化したら再提示する。この18件だけを固定済み実行対象と扱わない。

unfinished候補の関連件数：battle_leases 1、battle_presentations 28、battle_narration_entries 28、battle_narration_leases 2、battle_narration_retention 0、battle_narration_events 84、battle_narration_outbox 28。HTTP idempotencyの正確な対象件数は未取得で、実cutover planで決定する。

finished168件のID/stateDigest集合hashは `86e543133c13152857e0a9e1810d097c6a51a3ffe85f775a1f534ca508ebbb1d`。キャラクター等asset_generations345件、current pointers70件、balance_events267件、users5件、characters49件を観測した。これらは削除しない。character V3 generations2件が既存だが、Neva/Rioの正式owner confirm/Stage IDの証拠とは扱わない。

会計statusの観測ではnarration attemptsにgenerating、provider runsにactive、provider attemptsにreservedはなかった。この一時点のDB状態は送信済みprovider要求が全て収束した保証ではなく、停止後に照合する。

migration適用済み26本（最後0025）のchecksumは現在のソースと全て一致。未適用は0026 focused payloads、0027 resolved revision source、0028 timeout outcome、0029 discard receiptsの4本。0029だけを適用したと偽らない。migrationはforward-only、旧versionへ戻すだけでDDLや削除は戻らない。

## 停止controlの具体案

以下のwriteコマンドは**未実行の案**。ownerのexact承認と独立readbackを条件に一人のexecutorが実行する。serviceのtag/scaling操作は旧revisionを削除しない。復旧用image/traffic/tag mapを残す。

1. 実行前にexact runtime artifactとcontrolを用意し、stage/promote/manual jobsの並行実行を共通の排他に束ねる。既存の`release-staging`単独concurrencyではproduction側との排他を保証しない。実行中job/lease/provider会計とpublic/preview/direct-tag入口をinventoryする。
2. T0で実況queueをpauseする案：`gcloud tasks queues pause kshiai-narration --project kshiai --location asia-northeast1`。producerは別途停止する。PAUSEDを読み戻す。
3. 全旧tag入口を閉じる案：`gcloud run services update-traffic kshiai-api --project kshiai --region asia-northeast1 --clear-tags`。固定tag map全体に作用する一write。旧tag URLの利用者も一時停止対象に含める。
4. service停止案：`gcloud run services update kshiai-api --project kshiai --region asia-northeast1 --scaling=0`。Googleの公式仕様は0でservice無効化を提供する。manual scalingでもtag-only revisionは起動し得るため、tag閉鎖を併用する。実serviceでの停止効果は未実証で、desired configだけでは収束完了と判定しない。
5. all-old-revision instance数/継続requestの収束、DB write/lease、provider結果と会計、queue/outboxの最終集合を独立に読み戻す。request timeout300秒は最長requestの設定であり、shutdown完了時間の保証ではない。新規writer/dispatcherが残る、旧tagが応答する、会計が未確定、inventory不一致なら削除せず回復する。
6. 候補配備はゲーム入口とdispatcherを閉じたまま行う。`backend/src/index.ts`は現在startupでseed/dispatch/wakeを実行するので、middlewareだけのgateは不十分。新候補のstartup/task dispatch停止とbattle create/advance/worker gate、operatorの正式review/confirm用経路を詳細化・実装・ローカル検証してから候補identityを更新する。現在のtreeはその新controlを含まない。
7. migration、snapshot/restore、cutover job、owner review/confirmは公開game入口を閉じたoperator用操作として扱う。既存Stage workflowをdispatchする方法は、RUNNING要求/V2 smoke/startup/共有設定writeの不一致を解決してから使用する。

公式根拠：[service無効化](https://docs.cloud.google.com/run/docs/managing/services)、[manual scalingとtag-only revision](https://docs.cloud.google.com/run/docs/configuring/services/manual-scaling)。CLI helpの`--scaling`文言はpositive integerと記すが、公式ページは0を明示する。この差も実行前確認に残す。0への変更を試験目的で本番へ適用していない。

## snapshotと回復の方法・未達

選ぶ回復方法は、閉鎖/収束後の共有PostgreSQLの整合したsnapshotを、release artifact/Gitから分離したowner管理の保護領域へ一つ保存し、隔離環境で復元/件数/hashを読み戻す方法。credential・session token等をrelease artifactに含めない。外部保存先へ無断uploadしない。保存先、暗号化/アクセス制御、保持期間、取得/復元コマンド、復元先identity、実測時間は実行前に固定する。

現serverは17.6、ローカルpg_dumpは16.15であり、そのまま17のbackup用には採用しない。DockerのWSL統合も利用できなかった。その後、公式PGDGの署名付きmetadataとpackage SHA256を検証し、PostgreSQL17.11 client/serverを一時領域へ展開した。合成DBで全migration、dump/restore、cutover保持のrehearsalが成功した（[結果](vt104-pg17-rehearsal-result-2026-09-30.json)）。システムへのinstallationや本番snapshot取得は行わず、local serverは停止した。これは本番role/extension/byte規模/取得経路/復元時間の証拠ではない。実snapshot/restore手段の最終固定は依然必要。取得済みのhash一覧はsnapshotではなく、復元可能と主張しない。

controlの責務・状態・外部契約は[Accepted ADR-0040 revision 1](../adr/0040-shared-cutover-runtime-control.md)と[Accepted詳細設計](../cutover-runtime-control-design-proposed.md)へ固定した。[所有者受入](vt104-control-owner-acceptance-2026-09-30.md)に従いlocal実装・隔離試験を実施した。env-only mode切替は使わず、immutable cutover/artifact identityとDB control append/CASで同じdeployment revisionを保つ。実cloudでのreadbackは別途。

未確定な実snapshotはvt108の前提であり、所有者の「30分案」からその取得・本番復元の許可は推測しない。回復rehearsalと停止controlの検証が済むまで、停止/削除の実行packetは未完成である。

## 30分の時間配分と中止条件

30分は**T0から正常開放または承認済み回復による開放まで**の上限。内部準備・artifact build/CI・backup method rehearsalは停止前に終える。T0を始める条件は、その30分以内に正常経路と回復経路が終了できる実測証拠があること。

暫定配分：入口/配送閉鎖・writer収束5分、整合snapshot/対象再固定5分、migration/削除/readback/二体確認5分、operator限定Stage受入・本番promotion・公開smoke5分、回復予備10分＝30分。300秒request・cold start・backup規模・owner確認の実測がなく、現時点でこの配分が成立した証拠はない。rehearsalで見直し、owner上限を無断延長しない。

- T+10でsnapshotと収束/対象一致が揃わなければ削除を始めない。
- 実測回復上限をR分として、不可逆削除開始の最終時刻は遅くともT+(30−R−読戻し/開放予備)より前。Rが未測定なら削除禁止。
- T+20までに全開放条件が揃わなければ、予め承認された回復分岐へ進む。回復操作をその場で即興の許可へ読み替えない。
- 削除前の中止は旧traffic/tag/scaling/queue設定へ戻す候補。migration後は旧imageのschema互換性を確認する。
- 削除後・game開放前はexact snapshot/target/receiptの回復候補を使用し、finished/generation/accountingを保全する。本番restoreそのものもexact許可対象。
- operator限定Stage trialも最初のgame開放である。trial開始後を含め、game開放後の問題は新V3データを保持する前進復旧を基本とする。全DBを旧snapshotへ戻して新しいV3対戦や他データを失わせない。

## 切替と開放の最終packet

停止後に `planBattleCutover({cutoverId,cutoverAt})` を一度作り、targets/finished/relatedCounts/inventoryDigest/planDigest、operator、snapshot identity/hashを固定する。exact frozen targetsに対し `discardBattleCutover({plan,operatorId,stopped:true,recoverySnapshotIdentity})` の一transactionを許可対象にする。boolean `stopped`はcloud停止確認の代用ではない。旧key再送、全read surface、遅延worker、finished本文/集合、generations/current、会計の保持を独立readbackする。

通常authoringの既存CLI `register:v3-stage-trial --configured-database --owner EXISTING_USER_ID --request-key EXACT_KEY` は固定候補を**prepare**するだけで、confirmを代行しない。owner IDと2 attempt payload/digestを提示し、実所有者が通常review/confirmしてStage generation IDsを読み戻す。既存2件のV3 generationを内容未確認で代用しない。UIの確認を止めるgateならoperator用の確認経路を先に実装して試験する。

配信先の旧queue tasksが停止後も0なら空集合のreadbackを記録する。残った場合、元task target/body hash/receipt identityを固定して新candidateの存在確認経路へ渡す案を別に審査する。queueを丸ごとpurgeしたり旧tasksを無断再作成しない。旧finishedの未確定実況を未観測の補完で進めない。

operator限定のStage確認・プレイは公開開放ではない。公開開放条件は、削除/readbackと二体の正式登録、exact artifactでのStage受入、release_processに従うprotected production環境の承認とtyped confirmationが成立し、同じbackend image/Worker versionを本番promotionして公開routeのsmokeを確認すること。必要な承認を停止中に取得できるとの仮定は置かず、時間内に成立しなければ承認済み回復分岐へ進む。exact候補にだけtraffic/taskを戻す。old tagsの無差別復活は旧V2 writerによるINSERTを再開させるため正常開放には含めない。回復時の旧tag map復元は別のbranchである。

## 許可対象の最大writesと残る入力

実行packetで最終値を固定する。現在の上限案は、queue pause/resume各1、old tags clear1、scaling stop/reopen各1、candidate Stage deploy1、backend production traffic switch1、Worker exact-version production promotion1、migration job deploy/execute各1、cutover job deploy/execute各1、fixed character preparation2、owner confirm2。DB削除はfrozen transaction1回で対象/従属数はそのplanの正確な値、receiptは対象IDだけ。新controlのappend/CAS writesはinitialize closed・stopped barrier・trial・openの最大4 revision案（回復時のclosed/reconcileは実行packetで別途定量化）とし、permit/receipt行数は固定smokeの最大operation数に基づき実行packetで定量化する。未確定のまま実行しない。protected production承認/typed confirmationを実行packetに明示する。operator限定Stage受入と公開route smokeは別々の検証対象とする。Worker shared設定write、task retarget、snapshotの外部保存、回復branchは未確定なので上限を埋めるまで実行しない。曖昧なwrite結果ではread-only調査へ戻り、新IDで再送しない。

local control実装・閉包試験とPG17合成snapshot/restore rehearsalは確認済み（[local証拠](vt104-cutover-control-local-2026-09-30.md)）。未達：実snapshot/復元・forward recovery手段と停止30分の実測成立、HTTP idempotency対象件数、全writer/Worker live状態、operator/二体のowner identity、exact main commitと四CI/artifacts、ownerの候補/merge/release/停止/データ操作の別途許可。

vt104は未完了で、vt105/vt108の外部実行は開始していない。次は実snapshot/forward recovery手段・保護保存先・時間を固定し、exact owner/candidate/release/CI/artifactと30分execution packetを揃える。内部準備残1.25–3.5 agent時間（低確度）：実回復方法/packet0.75–2＋release/content固定とreview準備0.5–1.5。所有者判断・外部待ちは別。ローカル実装の完了は本番停止・migration・削除・配備・promotion・GitHub writeの許可ではない。


## 18:22以後の準備照合による範囲訂正

[最新execution packet](vt104-execution-packet-2026-09-30.md)でowner user IDとGoogle連携、二候補digest、fresh cloud metadataを照合した。local実装完了・残0の記述はcontrol本体/HTTP/provider/task/UIの試験済み範囲に限る。Accepted detailが要求するPG/Auth/R2等Stage smokeのpermit接続とworkflow統合は未完了で、全Stage受入の実装完了とは扱わない。既存email smokeの別user provision/V2 fixtureとowner限定trialの適合は詳細化が必要。vt104残2.25–5.5、Stage残4.25–10、親残7.25–17 agent時間（低信頼度、外部待ち別）。現候補migrationは0030追加で0026–0030の5本。上記過去観測・見積りを最新候補と混同しない。
