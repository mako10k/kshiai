# 共有本番の切替runtime control：基本・詳細設計候補 revision 1

状態：Accepted revision 1（[所有者受入](evidence/vt104-control-owner-acceptance-2026-09-30.md)）。上位は[ADR-0040](adr/0040-shared-cutover-runtime-control.md)。Acceptedの[ADR-0039 D3](adr/0039-v3-battle-lifecycle-and-cutover.md)と[切替設計revision 2](battle-lifecycle-boundary-design-v2.md)を継承するが、本書のlocal実装・隔離試験は許可済み。cloud/本番/remote操作は別途。正本PERTはvt104→vt105/vt108/vt106/vt107、親cc314/csm001。

## 現在決める範囲

same revision維持、operator controlの責務・遷移・認可、外部拒否契約、local実装file setを決める。実停止日時、resource IDs、owner ID/attempt IDs、最大provider回数、snapshot保存先、本番復元、exact CI/artifacts/promotionは実行packetへ渡す。不明な値を実在の許可や実装値へ埋めない。

## 基本設計と責務

| 境界 | 責務と上位条件 |
|---|---|
| Operator control repository | cutover control revision append/CAS、artifact binding、遷移receipt。不変battle bindingとは独立。ADR-0039 D3の閉鎖/収束とrelease flow 5–7を接続 |
| Operation admission | gate状態とcommand/owner/battle/task scopeを確認し、write/provider開始permitを原子的に予約。closing時は新permitを拒否、既存permit収束を確認 |
| Runtime startup | closed/trialでseed、一般authoring wake、outbox総当たりを起動しない。DB接続/schema healthのreadだけ許す |
| HTTP / worker adapter | origin/OIDC/通常user認証を維持してadmissionへ渡す。拒否時はprovider、idempotency、save、dispatchを実行しない |
| Deployment executor | old tags clear、manual0、queue pause、job停止とruntime観測。候補だけのtag経路でStage試験し、同revisionをprotected promotion |

controlは一人のoperatorが操作する。正常操作はCAS一回とappend一回のtransaction。曖昧な結果はcontrol revision/readbackを照合し、新operation IDで再送しない。transition authorityは実行packetの別途許可へ結ぶ。

## phaseと競合

closed→trialは削除readback・二体generation/digest・旧writer/配送fenceのreceipt一致が必要。trial→openはsame-artifact Stage受入とprotected promotion読戻しが必要。trial失敗はclosedへ戻し、新V3データを保持して前進復旧する。trialより前の回復だけが別途承認されたsnapshot復元の候補になる。

gate確認後に閉鎖される競合を避けるため、control CASとoperation permit予約を同じoperator-control行のlock下で行う。既存provider要求をDB lockで囲んで停止できると仮定しない。provider開始前予約、既存run/accounting/leaseの終了と期限処理を照合し、active permitが残る間はsnapshot/削除不可。permit失効だけで外部provider収束済みと判定しない。

permit状態はreserved-not-sent / sending / result-accounting-pending / settled / indeterminateを区別する。sendingへのCASもcontrol lock下で行い、closed遷移は未送信reservedを取消して新sendingを拒否する。遷移前にsendingとなった既存要求は遷移後にnetwork送信/完了する可能性があるため、closedは収束済みを意味しない。sending/result-accounting-pending/indeterminateがゼロでprovider会計との照合が成立して初めてstopped barrier receiptを固定する。unknownや期限切れをsettledへ自動変換しない。

## routeの閉包と通常owner確認

直接観測したsource：`backend/src/index.ts`はinitialize後preset/style seedとnarration/authoring dispatch/wakeをmiddlewareより前に呼ぶ。`routes.ts`のwake helpers、internal narration/authoring handlersからもdispatchされる。

閉鎖対象は、battle create、advance、advance/stream、action、delete、match random/auto/policies/candidates、一般asset生成・chat・upgrade・retry・image/media生成、一般management write、internal taskの処理開始を含む。battle read/SSE/historyも一般入口では利用不可とする候補で、finishedを削除する意味ではない。idempotency replayや既存battle IDでもadmissionを迂回しない。

operatorに開けるのは既存認証、health、UI成立に必要な認証済みread、**fixed ownerのexact二attempt**のread/confirm。通常V3 reviewは `GET /api/character-drafts/:id`、通常confirmは `POST /api/characters/:id/confirm` で、この`:id`はauthoring attempt IDである。`characterReviewResponse`→`activateCharacterAuthoringAttempt`がcandidate digest、append/current CASを担う。既存legacy confirmや任意character IDを許可対象へ拡張しない。Battlefield/narration-style confirmは今回の二体登録に不要なので例外に含めない。

frontendは`CharacterReviewPage`→`getCharacterReview` / `confirmCharacterDraft`を再利用する。調整/chat/retry/discardボタンはclosed中無効にし、ownerが内容変更を求めた場合は新候補を準備して再審査する。UIの周辺read一覧はブラウザnetworkで閉包確認し、allowlistへ必要最小限だけ加える。secret headerだけでowner認可を置き換えない。

trialはexact owner・二generation・固定create key/request digest・生成されたexact battle ID・provider ceiling・既存task認証を照合する。Stage SSE確認のための範囲で、一般公開ではない。新しい任意battleや他ownerは503、別asset生成は許さない。task bodyのowner値だけを信頼せず、保存battle/runとの関係を確認する。旧queue taskはcutover receipt/存在確認を通し、purgeや勝手な再作成をしない。

## Stage受入の全条件

release_process flow5のhealth、PostgreSQL、Supabase email/Google認証、migrated ownership、R2 media、SSE battle stream、direct Cloud Run protectionをそれぞれ独立receiptへ記録する。SSE成功だけでStage受入とは扱わない。認証/R2/jobのsmoke writeはexact run ID/resource prefix/最大件数をexecution packetで固定し、trial許可範囲へ明示する。一般image生成や任意asset writeをその例外へ混ぜない。既存R2/auth/DB smoke scriptsもadmission permitを通す必要がある。全条件とartifact/revision一致が揃ってからflow6承認→flow7同一revision/Worker promotionへ進む。

## local実装file set候補

- 新規 `backend/src/repositories/cutover-control.ts`：control revision append/CASとoperation permit persistenceのみ。
- 新規 `backend/src/services/cutover-admission.ts`：phase/actor/request/artifactを入力とする認可とadmission。repositoryの狭いinterfaceに依存。
- 新規 `backend/src/scripts/cutover-control.ts`：exact operation ID/expect revision/receiptを要求するoperator CLI。configured DB操作は別途実行許可、local検証は隔離DBのみ。
- 新規 `backend/migrations/0030_cutover_control.sql`：番号は着手時再確認。control/permit表、backend-only RLS、最小receipt。
- 変更 `backend/src/config.ts`：immutable deployment cutover ID/artifact bindingを検証。mode切替をenvで実装しない。
- 変更 `backend/src/index.ts`：startup side effectをadmissionへ接続。preset/style writesを閉鎖中抑止。
- 変更 `backend/src/routes.ts`：API/task認証後・各side effect前の共通admission、owner二候補例外とtrial alias閉包。
- 変更 `backend/src/services/narration-task-dispatch.ts`、`authoring-task-dispatch.ts`、`character-authoring-jobs.ts`：直接dispatch/local wakeの迂回防止。
- 変更 `frontend/src/pages/CharacterReviewPage.tsx` と必要なreview shell：closed中の操作表示と固定候補review/confirm。
- Stage smoke adapter/script：既存postgres-runtime-smoke、supabase-auth-smoke、r2 smoke、V3 SSE smokeのexact run/resource許可とcontrol permitを接続。実装着手前に必要scriptのexact pathを閉包inventoryで固定する。
- tests：control/admission/route/startup/dispatcher/browserの対応ケース。workflowsの変更はexact operation packetとの統合段階で別file setへ固定。

新規・変更source moduleに `R: <Responsibility>` を置く。型escapeは導入しない。Accepted sourceを上書きして本候補を受入済みと偽らない。

## 検証条件

1. closed cold startでseed/queue/provider呼出ゼロ、health read可能。
2. 各battle alias、管理write、GETによる処理wake、internal task、idempotency replayがside effectなしで拒否される。
3. 通常owner認証＋exact二attempt/digestだけreview/confirm可。違うowner/attempt、candidate変更、競合confirmはpointerを保護。
4. closedへのCASと同時のwriter開始、provider予約、active lease、遅延workerを再現。closing後の新permitゼロ、全active収束前はcutover不可。
5. trialの固定generation/key/receiptとprovider ceilingを検証。trial後failureで新V3 stateを消さない。
6. 同じimage/revision/Worker IDのStage受入→promotion→公開smokeをreceiptで照合。env変更を隠れたrevision更新として扱わない。
7. 合成PG17 dump/restore証拠は別資料。本番snapshot/role topology/復元時間は未検証。

## 残る判断・見積り

INSIDE：ADR option1、本file set、503/no-store、二候補owner例外、限定trialと新データ保持回復の採否。OUTSIDE：本番execution packetと30分実測。BOUNDARY_DISPUTE：上位はgame入口閉鎖を要求するが、全read停止・character以外のconfirm除外・internal taskの503契約の細部は未決だった。本候補は一般readを含む全利用停止、exact character二attemptだけ例外、retryable503を明示的に選ぶ案で、owner受入を必要とする。readを残す代案を選ぶ場合は本候補のscopeを改訂する。

候補のローカル実装・閉包検証は2–4 agent時間（agent概算、低確度）。以前のcontrol0.5–1.25時間は永続control/競合/限定trialを未算入で、現観測に基づき見直す。これは正本PERTのdurationやAccepted義務を自動変更するものではない。
