# 実況claimの読取順序：観測・再現条件・修正設計

## 上位契約とフェーズ

既存Accepted契約は正準状態と実況資料を同じcommitで保存し、凍結receiptのidentity/schema/phase/digest/時刻を検証する。今回の修正はその検証を維持して、READ COMMITTEDで古い正準snapshotと新しいentryを混ぜない実装修復。現在は詳細設計・実装・再現検証、次の実Stageと公開完走は別の受入ゲート。rootが外部変更executor。held旧試行は変更しない。

## 独立観測

- rc.12、main5a64e3cb5206e8deb41d311947264a51ddb153dc、annotated tag42ba0433910e790ae2bf0dc9b0aeb61e79f62af1。PR166/CI37415359118とmainCI37415727601は4job成功。
- Stage37416162174（[run](https://github.com/mako10k/kshiai/actions/runs/37416162174)）不合格。API kshiai-api-00177-vahはReady、0%traffic。task配送/accounting/Worker/edge/auth/SSE成功。公開Promoteなし。
- 実試合btl_9dbd237ac8733b200e2329ddfe895074：revision422、tick33、terminal、incompleteReason null。顕在ID再使用なし。
- 実SDK109行すべてcompleted、runtime physicalAttempts109と一致、physicalOutstanding0。総token不明0行、報告total764550。金額は料金表未確定で未知。
- 実況9batch/17entry成功。4entryがawareness_frozen_input_invalid、14entryがawareness_narration_incomplete。94回のbudget_lease_busyはSDKなしのdeferral。
- 失敗後、verified CA・BEGIN READ ONLY・SHOW transaction_read_only=on・ROLLBACKで35entryを検証。schema/identity/receipt存在/phase/保存digest/内容digest/確定時刻すべて適合。SHOW transaction_isolationはread committed。
- Stage stderr: Awareness public completion requires successful narration for every receipt（2026-10-06T05:08:38.394811Z）。

|役割|呼出数|入力token|出力token|SDK報告total|
|---|---:|---:|---:|---:|
|creation|1|1463|168|2313|
|conscious|18|84949|5959|113522|
|subconscious|68|398504|18231|416735|
|narration|9|120261|4500|124761|
|adjudication|13|100775|685|107219|

報告totalの入力+出力との差分内訳は推測しない。SDK応答完了とschema・意味の受理成功は別に扱う。

## コード上の競合と歴史的原因の境界

withTransactionのPostgres経路はBEGIN、SQLiteはBEGIN IMMEDIATE。claimNarrationBatchはbattle、runtime、entryの順で読む。saveBattleWithNarrationOutboxInTransactionはbattle更新とentry追加を同じtransactionで行う。Postgres READ COMMITTEDはstatementごとにsnapshotを取得する（[公式仕様](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED)）。

従ってbattle N読取→別transactionがbattle N+1とentry N+1をcommit→entry読取N+1のscheduleが成立する。committedAtの厳密receipt検査に古いbattleを渡し、新entryのreceiptがないと見えてfalse rejectionが発生する。これがコード上確認できる生成条件。rc.12の当時のsnapshot・正確なinterleavingは保持されていないため、この履歴の根本原因として断定しない。現在の全入力の整合はこの仮説と一致するが、単独で証明しない。catch内の詳細不足は検出の不足であり生成原因ではない。

## 詳細設計と代案

型付きportで対象entry集合を先にcaptureし、その後にbattle、runtimeを読む。production portは既存DatabaseConnection queryとschema parseを用いる。entryが見えた時点で対応battleは同じcommitで確定済みなので、後のbattleに含まれる。normal36tickで最大38receipt、保持100件の範囲でappend-only。将来の無制限実行に一般化しない。

missing battle→ack、missing runtime→既存エラー、empty captured entries→idle、failed-prefix・queue容量・publication期限・admission・fence・生成結果の検証は維持する。entrycapture後の新commitは次の配送で処理し、偽の破損扱いをしない。

代案はsingle SQL snapshot、runtime-first lock、repeatable read。後2案は競合・serialization retryの扱いが増え、battle-first lockはworldwriterのruntime→battle順と逆転する恐れがある。既存receipt検査の削除は保護契約を弱めるため採らない。選択案は新しいlock/isolation/retry/SDKを加えない。

## 検証と残るゲート

型付きread portで第一・第二読取間のatomic commitを再現し、captured entryと後続battleの検証一致を確認する。commitが先のケース、空captureの直後にcommitしたケースと次回capture、不正なreceiptの既存fail-closedを確認。SQLiteはintegrationを確認するがPostgresの同時commitそのものの再現証拠とは扱わない。関連型検査・通常/awareness回帰・独立レビュー・実Postgres CI後、新候補で公式Stageを1回測る。

判断DSLは同名.think、CLI audit fatal/error/warning0。PERT awareness-public-deploy継続。公開反映・新規公開試合の正常完走と全実況・利用ledger確定は未達成で、利用者の新pipeline利用価値はまだ未実現。

## 実装と局所検証

awareness-narration-claim-snapshotは型付きread portとproduction adapterだけを担当し、awaitでentry→battle→runtimeを固定。claimはこのsnapshotを利用する。一般query<T>を偽装するcastは使わない。正常有界receipt保持前提をmoduleコメントにも記録。実materialFromEntry/requestDigest/phase/timeを使い、読取間commit・先行commit・空capture後commit・欠落・不正materialの5回帰を確認。関連31件、強化後snapshot5件、backend typecheck成功。

全体build/lint（全workspace・deployment型検査と静的検査）成功。governed通常テスト201件成功、awareness309件中307成功・明示ローカルPostgres skip2・失敗0。独立最終reviewのINSIDE指摘0。歴史rc.12の正確なinterleavingと実Postgres同時commitをfake-portテストで証明したとは扱わない。
