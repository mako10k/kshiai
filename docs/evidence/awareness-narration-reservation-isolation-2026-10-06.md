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
