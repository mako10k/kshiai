# 実況公開イベントの同時採番：観測と適合修復

## 現在のフェーズと上位契約

Accepted ADR0006はopaque durable cursor、at-least-once、event IDによる重複排除、battle-local順序を保護する。ADR0037がdurable cursor/outbox/fencingを継承する。独立owner-authority reviewは、ID形式・公開DTO・schema・配信意味を保持する同一battleの原子的採番が既存契約への適合修復と確認。共有append helperのV4/V5使用も外部契約を保つ。現在は詳細設計・実装・同時実行の検証、実Stageと公開完走は後続ゲート。旧trialは保留のまま、rootだけが外部変更executor。

## 独立観測

- rc.13 annotated tag abb01c0a1a0fb9100c371b2c7767998e1752e00b、peeled main4f0ad2dc1a049b4ca6b27e26236a37c918a24ebc。PR167 CI37418050207・mainCI37418437661の4job成功。
- [Stage37418838781](https://github.com/mako10k/kshiai/actions/runs/37418838781)不合格。候補API kshiai-api-00178-bep Ready・0%traffic。配送/accounting/Worker/edge/auth/SSE検査成功。公開Promoteなし。
- 実試合btl_8b67acc28b8c80a74c7fcf154199bdff：revision259、tick19、incomplete、理由duplicate key value violates unique constraint battle_narration_events_pkey。
- SDK70行すべてcompleted、runtime physicalAttempts70と一致、physicalOutstanding0。total不明0行、報告total505016、金額は料金表未確定のため未知。
- 実況12batch/18entry成功、1entryはAWARENESS_RUNTIME_INACTIVEで失敗。101件のbudget_lease_busyはSDKなしのdeferral。
- verified CA・BEGIN READ ONLY・transaction_read_only=on・ROLLBACKの読取。SDK完了はschema・domain受理成功と区別する。

|役割|呼出数|入力token|出力token|SDK報告total|
|---|---:|---:|---:|---:|
|creation|1|1451|166|2257|
|conscious|10|46414|3225|63988|
|subconscious|40|230490|10655|241145|
|adjudication|7|54396|186|57318|
|narration|12|135559|4749|140308|

## 生成条件と履歴原因の境界

productionの唯一のbattle_narration_events INSERTは共有appendPublicEventを通る。nextEventSequenceはMAX(event_sequence)+1を読み、その後INSERTする。world側enqueueとworker側開始/完了/失敗は異なるlease下でこの処理を使う。Postgres READ COMMITTEDの2transactionが同じNを読み、同じN+1をINSERTするscheduleが成立する。SQL主キーは重複を拒否する。

これがコード上証明できる競合条件。rc.13当時の正確なinterleavingは保持されていないため、歴史的実行順は断定しない。SQLite BEGIN IMMEDIATEはtransactionを直列化するので、SQLiteテストだけでPG競合が解消したとは言えない。

現在のMAXのみの処理は、全イベントprune後のpruned_through_sequenceを採番に使わない。既存readHighWatermarkはこの保持済みcursorを含む。修正はその既存durable cursor契約に採番を適合させ、全prune後もIDを逆行・再使用させない。

## 詳細設計

新しいnarration-event-storage moduleは同じDatabaseConnectionで採番とappendだけを担当する。callerのtransaction内で、Postgresの場合だけpg_advisory_xact_lock(namespaceのhashtext、battleIdのhashtext)を取得し、eventsとretentionの最大値+1をSELECTして既存形のINSERTを行う。SQLiteは既存BEGIN IMMEDIATEで直列化し、PG専用SQLを発行しない。公開IDはbattleId:event:sequence、payload/created_at/kind/receipt/sequenceを維持。schema変更・migration・retry・SDK変更はしない。

[PostgreSQL公式advisory lock仕様](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS)：transaction-level lockはtransaction終了で解放される。hash衝突で別battleが同じlockを共有した場合は追加待機になり、battle条件で区切るINSERT/SELECTの値が混ざることはない。

## lock順と保持

通常worldwriterはruntime→battle→新entry→event、workerは既に確定したentry/認知→event。event採番をこれらの前へ移動しない。確認範囲ではappend後に未取得のruntime/canonical battle lockを新規取得する経路はない。outstanding失敗経路の後続runtime取得はfailEntriesが既に同transactionで取得したlockの再取得である。将来の任意の複数receipt・retry経路の無限のlockcycle不存在を証明したとは扱わない。

pruneはretention更新と旧event削除を同transactionで行う。allocatorはretentionをplain SELECTし、inverse row lockを加えない。最大値のunionを単一statementで読むので、prune前のeventsまたはprune後のretained floorが見え、全pruneによる番号リセットを避ける。

## 選択と検証

counter列追加/migrationは不要な変更を増やす。ON CONFLICTでイベントを捨てると公開イベントが欠落する。unique violation後の自動再試行は新transaction retry契約を要する。選択案は既存caller transaction内で採番を直列化する。

SQLiteでID形式・順序・全prune後の継続・rollbackを確認する。実PGの明示loopback disposable kshiai_awareness_testのみで、2接続の旧MAX競合control、修正後の2番目の待機とcommit後sequence2、別battleの非干渉、rollbackで未公開番号の再使用を検証する。PGテストが実際に実行されるまでPG同時実行の合格とは扱わない。関連full/typecheck/独立reviewとCI後、新候補Stageを1回実測する。

判断DSLは同名.think、CLI audit fatal/error/warning0。PERT awareness-public-deploy継続。正常Stage→Promote→公開Observe全実況/ledgerの完了は未達成で、利用者の新pipeline利用価値は未実現。

## 実装・局所検証

対象4source/test：narration-worker.ts、narration-event-storage.ts、awareness-narration-event-storage.test.ts、battle-awareness-narration-events-postgres.test.ts。workerの全appendが同じstorageへ委譲し、payload型はAppendNarrationEventInputの参照へ統一。新規generic DB adapterのtype escapeはなく、native Client.query<Row>を使用。

関連35件合格、backend typecheck・diff check成功。PG専用1件はローカル接続設定なしで明示skip。127.0.0.1:5432 no response、Docker WSL integration unavailableをread-only確認済みであり、credential/service/containerをbootstrapしていない。CIの既存Postgres16 serviceがAWARENESS_POSTGRES_TEST_URLを供給し、新testは既存test:awarenessのbattle-awareness*.test.ts globに含まれる。package/workflow変更なし。

実PGテストは無直列化の2MAX読取controlで同値とduplicate拒否を確認し、修正後はpg_locksの待機をbarrierにしてcommit後の次番号、待機中の別battle、rollback、保持floor後の続番を確認する。このテストがCIで実行された結果を別途照合する。

独立最終レビューINSIDE指摘0。実PG並行検証のCI実行・Stage・公開完走は未達成。

全体build/lint（全workspace・deployment型検査・静的検査）成功。通常governedテスト201件成功、awareness312件中309成功・ローカルPostgres未設定3件skip・失敗0。CIの実PG同時採番テスト成功が次のgate。

## CI・rc.14 実測の追記

[PR168](https://github.com/mako10k/kshiai/pull/168)をmain8d87ed88605af082cf6d0d41399f594d92151547へ統合。[PR CI37420384619](https://github.com/mako10k/kshiai/actions/runs/37420384619)・[main CI37420729943](https://github.com/mako10k/kshiai/actions/runs/37420729943)とも必須4job成功。既存Postgres16 service上のevent allocation並行テストが実際に実行され、ok27、skipなし。これにより前節のPG未実行gateは解消した。

[rc.14 Stage37421048966](https://github.com/mako10k/kshiai/actions/runs/37421048966)、immutable候補kshiai-api-00179-junの試合btl_e4cf6c24b67f68e3d38c6966a02e8234は36tick、terminal、incompleteReasonなし。実況38entryすべてcompleted・38distinct presentation、38outbox completed、lease0。SDK143件すべてcompleted、physicalOutstanding0、報告total1,023,920。今回の採番重複エラーは発生していない。

Stage全体は旧observerのattemptCount=1判定で失敗し、証跡保存・Promoteは実行していない。SDK未送信のbudget_lease_busy deferralが履歴claim countを増やすため、この検査をAccepted ADR0006/0057に適合させる修復を継続する。試合成功だけでStage合格・公開完走とは扱わない。公開trafficは従来版のまま。
