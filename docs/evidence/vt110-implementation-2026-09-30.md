# vt110 — V3参加資格・対戦ライフサイクルの実装検証

日付: 2026-09-30。作業場所: `/home/katsumata-m/.codex/worktrees/cc304-focused-revise-kshiai`、`codex/cc304-focused-revise`。開始HEAD `4a898d058609b163d1783e0d6ec1a932de7f3317`。vt102の未コミット変更を保持した継続作業。

## 根拠・完了範囲

所有者の「進めてください」により、提示済みのvt110を実施。Accepted切替要件revision 2 R1–R5、ADR-0039、ライフサイクル設計revision 2に従う。要件・ADR・設計の意味は変更していない。CLI判断監査は `vt110-resume-2026-09-30.think`、fatal/error/warning 0。

- R1: currentの不変V3 generationと `battle-mechanics@3` の共通参加資格を、自キャラ選択・相手候補・random/auto・直接createで使う。V2管理一覧を保持し、新規V2要求は409。候補はpagination前に選別する。
- R2/設計create: 決定的IDの削除記録をHTTP receiptより先に照合。新規INSERTと更新専用CAS UPDATEを分離し、更新0行は不存在または競合。create競合は保存済み同一identityへ合流する。V4 bindingはvt102を継承。
- 設計read/advance: `battle-lifecycle-access.ts` に存在・所有権の順序を集約。HTTP/SSE/actionは再送前に共通判定。更新・narration outboxは同じtransaction、revision/lease fenceを維持する。
- R3/設計discard: `battle-cutover.ts` が切替時刻より前の非finished集合、状態digest、関連件数、finished保持集合を固定。停止・operator・回復snapshot identityを前提に、再照合・最小削除receipt・従属payload削除・active会計run終了を原子的に確定。不一致はrollback。
- 削除記録は `battle_id/cutover_id` のみ。SQLite初期化とPostgreSQL migration `0029` を追加。失われたHTTP receiptでも元の決定的IDを再作成できない。
- narrationの遅延taskは不存在でack。削除中に待っていたprovider結果は使用量を保持して会計を完結し、公開payloadを生成しない。本文検証・上限失敗後も受信済みusage/provider identityを保持する。
- R4: finished本文・表示・HTTP receipt、character generations、provider実績・balance記録を保持。再実行も保存済み対象の不存在とfinished状態digestを読み戻す。空対象は無書込みのpredicate/finished読戻しを行う。

回復snapshot/停止フラグは、認可済み呼出元が提供する切替前提であり、このローカル試験は本物の停止・回復手順の実行証拠ではない。オンライン削除の保証を追加していない。

## 発見した保存不整合と修正

V3完走回帰で、相殺する資源変化のreceiptが保存schemaに拒否されるケースが発生した。独立した決定的試験で、別々の原因の `-5/+5 stamina` が残る一方、端点差分の0が省略される構造を再現した。原因別帰属を保持し、合計0を明示する修正を行った。schemaを緩和していない。

CLI RCA監査: `vt110-zero-net-receipt-2026-09-30.think`、fatal/error/warning 0。新規回帰は修正前に同じ `receipt owns absent parameter delta b.stamina` で失敗し、修正後に成功。元の乱数系列は未保存であり、正確な元の対戦系列は不明。

## 検証

- targeted 11/11: V3実経路1、共通参加資格3、保存・切替6、ゼロ合計receipt1。
- 隔離SQLiteとPostgreSQL 16.15で同じ保存・切替6ケースが成功。PostgreSQLはUbuntu公式debを `/tmp/vt110-postgres-runtime` に展開し、新規クラスタをloopback:55439に起動。自己署名ローカルCAを指定して既存TLS検証を維持し、全checked-in migrationsを適用。試験DBは各run後にDROP。既存DB・Stage・productionへ接続していない。
- HTTP/SSE/actionの旧進行キー、旧createキー、state再送、narration snapshot/events/follow/receipt、遅延workerが削除後404またはackとなる。旧idempotency payloadの物理削除、INSERT/UPDATEによる再作成拒否、finished個別取得・一覧を検証。
- 実provider会計adapterで、削除前予約→削除後遅延完了が実使用量17 tokensを記録し、runはfailedのまま。実況の超過遅延結果12007 tokensも使用量・HTTP試行数・costを保持し、公開しない。
- 機械receipt新規回帰＋既存engine試験47/47、shared build成功。全workspace/backend/frontend/deployment型検査成功。
- `npm test`: 有効18ファイル、138ケース成功。provisional 2、disabled 146は実行対象外。除外された古いV2新規作成fixtureを新契約の完了根拠に流用していない。
- 独立レビューの具体的INSIDE残指摘0。Stage実運用はvt104/vt108、正式Neva/Rio結合はvt103のOUTSIDE範囲。
- SealGraphのソースmanifest/検証REFを更新。最終readback・fsck・diff checkの結果は `vt110-validation-2026-09-30.json` に記録。

## 正本PERT・測定・残ゴール

vt110開始11:08:20、完了11:30:53。停止なしの測定区間22分33秒、`perttool` が照合したactive時間 `451/1200h`。投入person/agent工数は独立計測しておらずunknownで、effortを補作していない。

`project observe-velocity --task vt110 --evidence declared` のelapsed候補はavailable、開始baseline `13/12p`、暫定velocity `1300p/451h`。登録のみの旧速度を子計画でこの実測候補へ更新し、両scheduleを再解析。1件・委譲を含む作業区間であり、低確度のelapsed throughputで、agent投入工数の速度ではない。歴史的task identity警告を保持。

- 子V3_STAGE_TRIAL: 残resource `49/6p`、期間参考2.486–2.833h。次はvt103。
- 親csm001（character semantic migration）: cc314の子委任残量を49/6pへ更新。後続評価・移行は今回と異なるため、親の旧登録速度は別の低確度参考として保持。親期間参考4.693h。これは新子速度との自動roll-upではない。
- 内部agent工数の暫定見積り（実績ではない、すべて低確度）: vt103結合0.5–1.5h + 切替/release準備1–2.5h + プレイ証拠整理0.25–0.5h = Stage試行まで1.75–4.5 agent h。後続評価/移行の準備3–7hを加えて親ゴール4.75–11.5 agent h。上位契約を狭める見積りではない。
- 次の測定checkpoint: 2026-09-30時点の次回認可済みvt103着手と完了。開始・停止・完了と担当別active区間/投入工数を採取し、observed velocityを更新する。person-effortが未計測な点を完了実績からの推測で埋めない。
- 外部の適用/release/アクセス・所有者確認待ちの上限はunknown。暦日時forecastの入力がないため、全体の完了日を宣言しない。

vt110の内部実装・契約検証は完了し、残作業0。受益者がStageでNeva対Rioを遊べる実現価値はまだ0。将来価値として、共通選択・削除後の復活防止・履歴保持が実経路で成立する候補を得た。

次の推奨はvt103: 正式Neva/Rioのauthoring登録・選択・V3完走・途中編集/再読込・再送・削除/finished読戻しを同じローカル経路で確認。内部0.5–1.5 agent h、低確度。既存Acceptedのローカル実装権限で実施でき、Stage/data/release操作は別の正確な実行権限に従う。

コミット・push・merge・配備・Stage/productionデータ操作は実施していない。既存worktreeの未コミット変更として保持。
