# vt104 配備・停止・回復手順候補 v2

2026-10-01。所有者の「次の作業を実施」に基づき、手順候補と現環境のread-only証拠を作成。外部実行許可・配備済み証明ではない。旧execution-candidateのsource/prepare未取得欄は本資料で置き換える。Accepted要件v3、ADR0042、詳細設計v1を入力とする。

## 20:37 JST 更新：修正受入とローカル検証

所有者はsnapshot識別子の要求と処分記録table未作成の矛盾を引用し「承認します」と回答した。後継詳細設計`docs/unreleased-v3-trial-disposal-design-v2-proposed.md`はローカル修正・試験に限りAcceptedとなった。以下のINSIDE-1/2と「未受入」は修正前の観測を保存したもので、現在のローカル実装には当てはまらない。共有DB・旧RC1には未反映である。

専用CLIでpublic schemaと明示DIRECT_URL対象を固定し、trial policy、停止期限、exact plan hashを検証する。処分receiptの0029 DDLのみを同transaction内で先に用意し、正式migration ledgerは先取りしない。通常snapshot経路は維持した。ローカルPostgreSQL17の13項目と通常の選択テスト234件、型検査・静的検査・ビルドが成功。詳細は`vt104-disposal-local-verification-2026-10-01.json`と`vt104-disposal-pg17-result-2026-10-01.json`。

RC1とprepare36841952094は履歴証拠として保持し、今回の修正を含む配備の入力には使用しない。次の候補は修正ソースのbranch push→そのSHAのCI4検査→新annotated RC→prepare-only 1dispatchである。新source SHA・新tag・prepareRunId・imageDigestを独立readbackした後、停止／処分／migration／配備packetを再作成する。現資料の旧RC固定値を新packetへ転用しない。外部停止・DB処分・配備・認証変更はこのローカル承認に含まれない。

## 固定する対象

ソース4f3aaa7f0556644b10c51d27f94d57401572cea2、annotated v0.23.0-rc.1、prepare36841952094。イメージは`asia-northeast1-docker.pkg.dev/kshiai/kshiai/backend@sha256:43d084a20629758a6157170350fb287678c38790d8e6008c1f1e8b417757f1aa`。CI4検査はこのソースに対して成功。継続HEAD72f67eaは文書追加分を含み、RCとは別identity。

project kshiai / asia-northeast1、service kshiai-api、job kshiai-v3-trial-preflight、queue kshiai-narration、Worker kshiai-web。secretはDATABASE_URL/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/OPENAI_API_KEY/XAI_API_KEY/VENICEAI_API_KEY/ORIGIN_SHARED_SECRET/SUPABASE_SECRET_KEYの既存identityを維持し、各version1へ固定。DIRECT_URL=kshiai-direct-url:1。秘密値は資料に保存しない。

## 現環境の独立観測

詳細はvt104-operational-inventory-2026-10-01.json。Cloud Run公開traffic100%はkshiai-api-00141-vis、tag78個、manual0未設定。queue RUNNING、task0。DBはrepeatable-read/read-only transactionで観測、186対戦＝active18/finished168、pending/dispatched outbox22＝finished14/active8。22件すべての関連narration entryはcompleted。provider active/reserved、narration generating/queued、authoring pending/claimedは0。現在の0は停止後のquiescence証明へ流用しない。

pendingは0026_character_focused_authoring_payloads.sql、0027_character_revision_scope_resolution.sql、0028_semantic_authoring_provider_timeout.sql、0029_battle_discard_receipts.sql、0030_cutover_control.sql。既適用checksum不一致0、battle_discard_receiptsは未作成。

Google有効。allowlistは公開callbackとlocalhost/127.0.0.1:5188のcallbackのみ。CORS_ORIGINはhttps://kshiai.mk10.org。preview callbackはWorker version実URLが得られてからexact追加値を決める。Cloudflareのlocal credentialは取得不可なので共有preview設定のlive確認は未実施。Cloud Scheduler APIはSERVICE_DISABLEDを返し、APIは有効化していない。外部scheduler・手動operator等の旧writerは未確認。

## 現段階の不整合と判断候補

INSIDE-1: 詳細設計v1 Bはsnapshotを開始条件へ戻さず正規cutover repositoryで処分する。battle-cutover.tsのdiscardBattleCutoverはrecoverySnapshotIdentity非空を必須とし、0029のtableへ先に書く。snapshot識別子を捏造して呼び出さない。このままの手順では処分できない。

INSIDE-2: workflow deploy preflightは旧unfinished/outbox0をmigration前に要求する。一方処分repositoryは未適用0029 tableを必要とする。処分→全migrationの順は現schemaで成立しない。

推奨候補: 詳細設計v1の後継提案に、初回未リリース試行専用のoperator準備経路を追加する。旧snapshot経路を保持し、明示trial policyとexact frozen IDs/hashを入力に、必要な処分receipt tableのDDLだけを先にtransactionで用意し、snapshotなし処分を行う。0029のIF NOT EXISTSは後の正式migrationに残し、migration台帳を先取りしない。finished outbox14件はcompleted entry・frozen delivery identityを照合してcompletedへ完了会計する。通常runtimeの要件・新V3記録・finished stateは変更しない。初回trialを明示しない呼出しはsnapshot必須を維持する。

この提案は未受入。変更候補は後継詳細設計、battle-cutover.tsの明示policy/必要DDL、同repositoryの試験、専用operator CLIと試験、証跡/PERT。上位ADR0042のsnapshot延期方針は変えない。runtimeソースの変更が入る場合、現RCを移動せず新sourceのCI→新RC→prepareが必要。operator-only実装で現imageを維持できるかは詳細設計で検証する。追加内部工数0.5〜1.5h、低確度。

代替は実snapshotの作成だが、所有者が延期した保全条件を戻すので非推奨。全DB削除・finished削除・偽receiptは候補に含めない。

OUTSIDE: 実停止後の時刻/receipt、実revision/Worker URL、Google callback追加、provider費用上限、ownerログイン・実game証拠は後続実行段階。BOUNDARY_DISPUTE: 既存file set外の処分実装追加とreceipt DDL先行は設計変更として所有者判断が必要。

## 停止から起動までの候補手順

1. 先に上記設計不整合を解消し、対象18IDとstate/関連row hashを停止直前にfreezeする。finished14 outboxもID/receipt/delivery generationをfreezeし、22件の関連entryがcompletedであることを再照合する。未確認writer一覧と稼働jobを読み戻し、旧writer閉鎖の担当・receiptを確定する。
2. 停止のexact承認後、queue pause1回、service旧tag78個の閉鎖1回、manual scaling0への更新1回を候補とする。tag一覧と公開traffic baselineはinventoryに保存。停止開始stoppedAtからexpiresAtは最大1800秒。進行中provider/jobが0、queue PAUSED/task0、tag0/manual0を独立readback。未知writer・不明stateならDB作用へ進まない。タグ閉鎖・manual0は公開既存環境の利用にも影響するため、既存public traffic率を維持しても停止影響はある。
3. 解消後の専用経路でexact18件のみ処分。最大18battle receipt insert、18battle delete、関連7tableとmatching idempotencyのみ削除、関連active run/generating attemptのみ終端化。finished168のstate hashを保持。active由来outbox8件が削除されたことを読む。finished outbox14件はexact照合後最大14rowのcompleted更新。解釈不明・対象増加・hash変化・数不一致ならtransaction rollback、削除範囲を広げない。
4. oldWritersClosedReceiptId/disposalReceiptId/cutoverId/cutoverAtは実証跡から取得。providerBudgetReceiptIdは費用上限と対象操作の所有者承認が揃うまで空欄。偽IDで実行packetを生成しない。execution_packetのUTF-8 bytesを固定しSHA256を照合する。
5. registered workflow deployを最大1dispatch。jobDeploy1、jobExecute1、backendDeploy1、workerUpload1、queueResume1。pending5ファイルと同image migrationを照合しforward apply、pending0を読む。旧queue/job quiescenceを直前に再確認。no-traffic、CUTOVER二変数除去、全secret version1、candidate tag固定narration targetを検証。既存公開traffic mappingは固定、Worker公開versionは変更しない。
6. Worker shared preview設定GETがenabled=false/previews_enabled=trueでなければpayloadを別提示し、変更許可なしでは進まない。upload後version/binding/backend originを独立readback。Google callbackは取得した実previewのexact callbackを最大write1の別候補として提示し、別許可後に更新/readback。same-origin Worker経路だけではCORS変更の必要性は証明されないため、現段階でCORSは変更しない。実拒否を観測した場合に必要性とexact payloadを別提示する。現在は架空preview URLやwildcardを提案しない。
7. startup/DB/edge/direct保護を検証し、queue emptyを確認してresume1回、RUNNING readback。prepare検証成功とGoogleログイン可能の確認を分ける。今回の次段階はここまでで、owner登録/有料generation/対戦は別対象。

## 停止・失敗・回復条件

期限不足（job前900秒/backend前600秒/Worker前180秒を残せない）、writer未閉鎖、queue非empty、集合/hash変化、pending相違、secret相違、callback不適合で作用を止める。job execute240秒/backend deploy300秒/Worker upload120秒のtimeoutは結果不明としてremote実状態を読み、workflowを再送しない。停止時間内にquiescence不成立なら起動へ進まない。

処分前に失敗: queue/tag/manualの元設定へ戻す操作は復旧候補としてexact payloadとreadbackを提示する。自動復旧の権限はまだない。復旧は旧snapshotのrestoreを必要条件にしない。

処分後に失敗: 消した旧unfinishedの復元を保証しない。新V3記録は保全し、candidate tag/queueを閉じて原因証拠を取り、最小forward修正を別候補へ。旧版再起動は新schema/新V3との適合性を確認するまで実行しない。1800秒は停止制御の上限であり、無条件に旧版起動する許可ではない。

## exact旧unfinished集合（観測候補・停止後再freeze必須）

- `btl_095f5c85f90a7c7c778d2016`
- `btl_19fcced350f5b0cf614b3d0d`
- `btl_24c74337891570eefed4730a`
- `btl_2d56593940804c0ddfb03fe6`
- `btl_3607e7ff5f7029664a002a4d`
- `btl_36c8a0d65f8c77e653994c9d`
- `btl_56dc24097af7ec8f08072d61`
- `btl_699d215033ccd07557633a159e7455d3`
- `btl_73b54f4fd4c608454b1464c0`
- `btl_7f23a0f256c8a968a00ff81f`
- `btl_817945726ca518b9c0556b1a`
- `btl_8a0292cc274d18c3b45512f2661578c0`
- `btl_cce166a328f8ef399ede33f0`
- `btl_cce692455ac46d05dac86cbf`
- `btl_d18dd16bf82ddf162c8d73a689fc7c52`
- `btl_e0c549480fa32e20e8a1b46b`
- `btl_ed82deca4f50f45b0c36f658`
- `btl_f597bbea7aa2193a62d1af0c`

## 進捗と出口

今回の成果は実行前の具体候補・独立inventory・不整合の位置特定。実配備/Googleログインの利用可能価値0。vt104を完了にしない。所有者が上記の後継設計とlocal file setを判断した後に不整合を修正し、exact外部実行packetを改めて提示する。停止・処分・配備の許可はそのpacketに対して得る。

残る内部工数（agent estimate、低確度）: 不整合の設計/実装/試験0.5〜1.5h、最終packet0.25〜0.5h、vt104残0.75〜2h。ログイン前まで1〜3.25h（＋起動/認証0.25〜1.25）、実試行1.75〜5.25h（＋0.75〜2）、親csm0014.75〜12.25h（＋3〜7）。外部承認待ちは別。既存vt103のelapsed velocity25p/17hをperson effortへ換算しない。今回のtask resume観測19:58:25 JST以後をPERTに記録し、前段read-only採取時間を新しいtask actualへ遡及捏造しない。次の計測checkpointは修正後のpacket到達時。

後継詳細設計差分は[未受入候補v2](../unreleased-v3-trial-disposal-design-v2-proposed.md)。現行認証を維持する方針で、local認証/Worker境界8検査が成功した（vt104-current-auth-preservation-2026-10-01.json）。実Google/V3試用証拠ではない。
