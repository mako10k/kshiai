# 実況の予算予約と戦闘leaseの結合修復

## 上位契約とフェーズ

Accepted ADR0006は正準checkpointと実況の別fenced lease、正準進行と実況遅延の独立を要求する。ADR0054のqueue12・期限・physical200/concurrent6・noSDKretryを維持する。独立authority reviewで、限定された実況専用の原子的予算予約が既存契約への適合修復に収まると確認した。現在は詳細設計・実装・テスト。公開切替済みを保持し、失敗した試合を再開/強制完了しない。

## 独立観測

[公開Observe37432156311](https://github.com/mako10k/kshiai/actions/runs/37432156311)は不合格。試合btl_f7ee5a0106e0950357e7f76f22038998の正準runtimeはrevision403、tick32 terminal、incompleteReasonなし、102SDK全件completed・outstanding0。実況は8receipt成功、残りはawareness_queue_capacityと伝播したawareness_narration_incomplete。全実況成功という公開完了条件は満たしていない。

verified CA・BEGIN READ ONLY・transaction_read_only=on・ROLLBACKで収集した履歴は、212件のbudget_lease_busy abandoned/http0（08:07:25–08:10:11 UTC）、4件の実実況SDK（2.7–7.0秒）。receipt9–11は各99claim、receipt9は08:08:29作成、08:10:11に待機13件の容量超過で失敗。長い実況HTTP応答を必要とせず、送信前待機が実測された。

## 生成条件・未知

advanceTurnのwithBattleLeaseはLLMを含むcallback全体を囲む。実況予算予約も同じbattleleaseを要求し、取れないとSDK前にdeferralする。queued/generatingが12を超えるとclaimが全件失敗する。短い実況予算予約が長いworld実行leaseの空きを必要とする結合が、実送信機会を狭める。履歴の正確なmicrointerleavingは未記録で、あらゆる負荷・provider遅延でqueue overflowが起きなくなるとは主張しない。

## 限定設計

実況専用repository capabilityは、live narration leaseのowner/fence/expiryとgenerating batch attempt/receipt linkageで認可する。最新runtimeをFOR UPDATEで読み、既存と共有する厳密な予約window/budget/重複validatorを適用し、reservationとbatch proof/generating更新を同transactionで保存する。world fencing_tokenと正準状態は変えない。失効・重複・予算超過・不活性・rollbackを検査する。engine CASの再読取は同時に追加された予約を保持し、その挙動を回帰確認する。

一般reserveのfence除去、queue/deadline緩和、advance停止/優先という新外部挙動、HTTP retryは採らない。純粋budget ruleを共有し、契約の二重定義を避ける。SQLiteとnativePGで同時予約/lease/rollback/CAS保存を検証し、独立reviewとfullchecks・exactPR/mainCI・新Stage/Promote/Observeを通過させる。同名.think CLIaudit0fatal/error/warning。

PERT awareness-public-deployの完了記録は成功したrc16配備の事実として保持。awareness-public-completionを再開し、公開検証で検出した不適合の修復と再検証を実作業計測する。旧trial保留や全体finishを変更しない。

## 失敗した公開試合の実利用内訳

|役割|provider/model|SDK件数|入力token|出力token|SDK報告total|
|---|---|---:|---:|---:|---:|
|creation|xai/grok-4.5|1|1437|161|2135|
|conscious|xai/grok-4.5|18|85010|6333|115261|
|subconscious|openai/gpt-6-luna|66|391229|21097|412326|
|narration|xai/grok-4.3|4|53553|2072|55625|
|adjudication|xai/grok-4.5|13|100991|710|107287|

SDK報告totalを入力+出力へ読み替えず、そのまま合計する。料金表未確定の金額は未知。

## 責務と同時更新の検証対象

純粋module awareness-reservation-budgetに既存window/budget/aggregate validatorを移し、worldとnarratorの予約で同じ条件を使う。narrator専用storageはruntime→live narratorlease→claimed batch→active generating receiptの順で確認/lockし、attempt履歴行は更新しない。batch proofとreservationは同transaction。world fence列を上書きしない。

独立lock reviewは、正常な同一attemptのpublicationが予約/SDK後であること、old workerのlivefenceまたはactiveattempt拒否、outstanding failureが既にruntime lockを保持する経路を確認する。確認した経路で具体的cycleがないことと、任意の将来経路のcycle不存在の証明は区別する。

旧workerテストのworldleasebusy期待は不適合を固定するため、該当2件をworldleaseが使用中でも実況予約/単一SDKが進む検証と失効fence拒否へ置き換える。テストを単に削除して成功扱いにしない。nativePGでは実worldleaseが保持された条件、並行二予約の制限、rollback、fresh world CASで予約保持を確認する。

## ローカル検査・独立レビュー

Node22.22.3でbuild、lint（全workspace型検査・jscpd・lizard）、npm test合格。公式選択はactive36/provisional2/disabled207、実行201件成功。追加test:awarenessは324件中320成功・4nativePGを明示skip、失敗0。関連focused45件成功。独立レビューは現行責務・能力・予算・lock順序のINSIDE指摘0。nativePG実行成功はCIの残ゲートであり、ローカルskipを並行実証とは扱わない。

## 統合・実PostgreSQLの検査

[PR171](https://github.com/mako10k/kshiai/pull/171)はexact head 1f3ecd69adb4667c706f9f988f1e62f760881d81の必須4job成功（run37436038821）を確認してsquash統合。main aa1f5d75221bef546c7cd566fa4ba858ccb6e133のCI37436568532も必須4job成功。両方でPostgreSQL narrator raceがok28、SKIPなし。mainのawareness324件すべて成功・skip0。

annotated rc17 object8608930c520ed04cd0b5ce10bdb19bc885ff4f1eとpeeled main SHAをremote照合。Stage37437242681を固定38/200・guarded/compact/none/current・character_create=falseで1回開始。まだStage結果および公開完走を確認していない。基準の公開API00181-wuwはtraffic100%。

## rc17ステージング結果・公開切替の境界

[Stage37437242681](https://github.com/mako10k/kshiai/actions/runs/37437242681)は全検査成功、retained artifactを取得。API00183-wey ReadyTrue、immutable image sha256:b65d083e0b1bcb76343c496d9f708def51edea5c9f56b70dde4065a3020d73d4、Worker4a34e357-c390-4ec1-9429-5b0452ce2fbc。認証・SSE・Tasks OIDC・R2・試合・accountingが成功。read-onlyの独立照合で試合btl_8d192f4dbb179ba9f82d91b1f6091e59はtick13正常terminal/incompleteReasonなし、60SDK全completed・outstanding0・SDK total412124、全15実況completed。

[Promote37438626377](https://github.com/mako10k/kshiai/actions/runs/37438626377)を固定rc17/API/Worker/Stageで1回開始。GitHub productionはmako10kのレビュー待ちを確認。公開はまだrc16 API00181-wuw traffic100%。切替成功の独立readbackと新規公開Observeの全実況成功が残る。PERTは公開完走タスクを承認・クラウド待ちとしてsuspendし、構造・schedule both・nextすべてok/エラー0。旧trial保留は維持。

## rc17公開切替

GitHub owner review後、[Promote37438626377](https://github.com/mako10k/kshiai/actions/runs/37438626377)は全検査成功。gcloudでAPI00183-wey traffic100%、公開/api/health oktrue・同revisionを独立照合。Workerは凍結版4a34e357-c390-4ec1-9429-5b0452ce2fbcを公式workflowで有効化。

[公開Observe37439057058](https://github.com/mako10k/kshiai/actions/runs/37439057058)をrc17・expected00183-wey・38/200・compact/persisted_settingで1回開始し、別のGitHub production owner review待ち。公開配備成功と公開完走は区別する。PERT公開完走は外部待ちとしてsuspend。perttool Issue42はOPENを再照合。

## 公開完走の最終確認

[Observe37439057058](https://github.com/mako10k/kshiai/actions/runs/37439057058)はowner review後に全検査成功。retained receiptはrc17・API00183-wey・compact/persisted_setting・execution kshiai-persistent-e2e-65fk9に一致。DBはBEGIN READ ONLY/transaction_read_only=on/ROLLBACKで独立照合。公開試合btl_b4a33905c52b6465f3f6f72ce7f2cf6dはfinished/turn9、runtime revision336/tick23/terminal/incompleteReasonなし、physical96/outstanding0。全25実況と全25batch/attemptがcompleted、失敗0。SDK96件すべてcompleted、SDK total674523。

|役割|provider/model|SDK件数|入力token|出力token|SDK報告total|
|---|---|---:|---:|---:|---:|
|adjudication|xai/grok-4.5|9|72998|234|77166|
|conscious|xai/grok-4.5|13|60947|4386|84298|
|creation|xai/grok-4.5|1|1455|151|2971|
|narration|xai/grok-4.3|25|212267|6637|218904|
|subconscious|openai/gpt-6-luna|48|278425|12759|291184|

SDK totalはprovider報告値を保持し、入力+出力へ読み替えない。価格表未確定の金額は未知。今回の公開配備・新規1試合の正常終了・全実況成功・実利用記録という公開ゴールを満たした。旧切替試行の保留と共通全体finishは維持するため、計画全体の完了は主張しない。
