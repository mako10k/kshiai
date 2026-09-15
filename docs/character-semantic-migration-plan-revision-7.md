# キャラクター移行計画 revision 7 — Config永続化を緩和し利用者経路へ戻る

2026-09-15。オーナーの指示により、Transport／Worker Config世代をRun identityへ
厳密に永続化する案を外し、LLM汎用構造化データ作成・移行基盤の利用者経路へ作業を戻す。
revision 6の実利用成果、Stage、本番、移行、切替の順序は維持する。

## 変更理由

受入済み共通基盤要件は、Workerの途中状態やLLM中間contextをcheckpointとして永続化せず、
processまたはlease喪失時には現在Runを技術的失敗として終了し、明示retryで元情報から新Runを
再構築する。この方式では、過去のWorker Configを再現するためのConfig registry、snapshot、
世代IDは必要ない。

一方、古いWorkerの書込みや遅延provider結果を拒否し、費用・回数を失わないため、次は維持する。

- run/source/target/adapterと意味資源policyのidentity
- provider request identity・状態・reservation・receipt
- pricing/token-estimator identityと単調なaccounting
- owner、fencing token、run version
- question/answer、technical outcome、resumption recipe
- family所有のfinal candidate metadata

Transport timeout、同一live実行内のrecovery allowance、Worker leaseは起動時runtime Configとする。
一つのlive実行中はimmutableに使うが、共通Run recordへのConfig世代ID・snapshot保存を完了条件に
しない。processまたはlease喪失後のretryは、その新Runで有効なConfigを使う。必要なroute、
platform、timeout、leaseの運用観測はbounded telemetryとして扱え、replay契約にはしない。

## 修正後の順序

1. `cc309`（完了）: ADR-0033 revision 1と実装設計revision 6をConfig永続化緩和だけに絞って
   reviewし、P0〜P3指摘なしのPASS後にexact snapshotを受理した。実装・provider call・deploymentは
   行っていない。
2. `cc304`: 受理後、共通kernelを実create・revise・migrationへ接続する。次の実装incrementは、
   未接続のrevise consumerとowner interactionを実API/UI・Worker・persistenceへ通し、safe candidate
   diffとfinal acceptanceを別操作として提示する。Config registryやConfig ID用DB migrationは作らない。
3. `cc305`〜`cc307`: revision 6と同じく候補review、owner決定済み評価、Stage proof、本番code配備を
   順に行う。既存policyとcharacter pointerはまだ変更しない。
4. `cb209`〜`cb214`: 対象manifest、provider-backed candidate、候補受入、append/CAS、復旧確認、
   schema-3 authoring切替を別々の明示判断で進める。

## ユーザー価値

この計画変更単体の実現済みエンドユーザー価値は0である。将来価値への寄与は、利用者が使わない
Config永続化とDB migrationを経路から外し、残る作業をcreate・revise・migrate、局所修復、質問回答、
候補確認・受入へ戻すことである。`cc309`完了後の最初の利用者価値incrementは、revise要求が共通
kernelを通って安全な候補差分まで到達する経路である。

## 変更しない事項

- Provider、Worker、意味進捗、累積資源を別のfailure modeとして扱うADR-0032
- whole-attempt 240秒deadlineと固定provider 60秒を復活させないこと
- exact timeout、lease、recovery 0/1が未決であること
- Worker状態・LLM中間contextを永続checkpointにしないこと
- Stageと本番の共通部分を共有し続けること
- paid provider call、deployment、production migration、pointer/policy activationには別の指示が必要なこと

## 現在の判断境界

ADR-0033と実装設計revision 6は受理済みであり、revision 5は不変履歴として維持する。
`cc309`は完了したが、`cc304`はsuspendedのままであり、本受理はその再開または外部effectを
代行しない。
