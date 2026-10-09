# 全原試験・CI・配備の完了監査基準

対象は所有者の継続goal全文。部分的な診断、計画、SealGraph構造検査を全体完了へ置き換えない。最新状態は末尾「main CI合格と配備候補」を参照する。下表は開始時の監査基準であり、後続の履歴を含めて照合する。全体の配備完了宣言ではない。

|要求|完了を証明する現物|現在の証拠・残条件|
|---|---|---|
|原251ファイルと全ケース保持|元247単体+4E2Eのpath集合、元ケースAST保持、採用済み仕様差分、正式実行の失敗0/skip0|674ソースhashと251pathを固定。診断1468単体/10E2E成功、追加回帰を除く元宣言の欠落0。正式全体実行は未了|
|正しいCauseと現在ソースを封印|Accepted根拠→設計/typed producer→実consumer→wholefile、計画と実公開のref/path/hash/Cause一致、reachable non-draft/source一致、最新試験HEAD/stale検査|独立内容レビューPASS。R3は392ノード、公開中。旧HEADとbindings保持、全251のtest path/source binding同一性を最終検査する|
|未封印で正式実行を停止|既存ADR0058、正式runner回帰、実行前unsealed停止出力|npm testが未封印4ファイルで実行前停止した証跡あり。正式inventory更新は閉包readback後に限る|
|型整合と実際の受領|型検査、mandatory awareness effort port、拒否/実受領/同時合流の回帰|型検査・関連回帰成功。元全体診断成功。最終正式試験の証拠と一致させる|
|効率と実測|同じ全グラフの比較結果、公式CLI lifecycle実時刻、適用範囲を明記した実測|943node全内容一致: CLI731.964秒、hash読み取り0.552秒、抜き取りCLI込み5.674秒。source-cohort実経過1669秒。投入工数や別工程速度へ無断換算しない|
|CIの問題解消と全合格|実装コミットのexact SHAにvalidate/security/backend-image/worker全成功|直接原因のLizardとsharpを修正。現物のLizard再検査成功、依存監査成功。新SHAのhosted CIは未実行|
|配備|既存公開環境のtag/source SHA、Stage/Promote成功、同じbackend digest/Cloud Run revision・traffic、Worker version、healthの独立readback|現在のworktree変更は未配備。main由来releaseと4CI成功を先行させる。protected approvalを満たし、標準Stageの実provider試合の件数/費用権限を具体的に照合する|
|各turn終了見込み|fresh worktimectlと残経路に基づく低信頼度予測|現予定20:00 JST、最短全体終了19:00 JST・低信頼度。外部承認待ちは内部速度から推測しない|

正本計画: `docs/all-test-seal-delivery.pert`。source-cohortは完了、seal-closureはactive、formal-tests/ci/deployは未完了。9:00以前・10:48:33以前の作業を今回のsource-cohort実績へ算入しない。`worktimectl stop/end`は実行していない。

実行時は、表の全要求を最新現物で再照合する。情報不足・弱い間接証拠・未確認外部状態は未達として残す。全要求が証明された後にだけgoalをcompleteへ更新する。

## 配備候補の事前条件（2026-10-09 12:11 JST確認）

Stage releaseの既定 `e2e_provider_operation_ceiling=169` と、実行スクリプトが事前投影に使う `AwarenessNormalPolicy.maxPhysicalAttempts=200` は不一致である。`authorizeObservationProviderBudget` は projected.total > ceiling を試合・provider run作成前に拒否する。したがって既定値のままのdispatchは配備完走の証拠にならない。

実装・封印対象のソースはこの確認で変更していない。現行の拒否契約を維持し、具体的な実装SHA・タグが確定した段階で、Stageの実試合1件・最大200物理呼び出しを指定する候補と費用の扱いを所有者の既存権限と照合する。未承認の呼び出し数拡大、169回での試行、失敗後の追加試行は実行しない。

金額制限も実装確認した。現行ポリシーは `accountingMode=observed` で、`prepareObservedAwarenessDispatch` は `maximumChargeUsd=null` を返す。`awareness-reservation-budget.ts` の金額・配分検査は `!observed` の場合だけ適用し、現在も物理回数・同時数・期限の検査は適用する。したがって `maxCostUsd=0.5` は現行の実測モードにおける実料金のハード上限ではない。料金証明を不要として実利用を記録する採用済み方針を、この確認で変更したり金額制限へ置き換えたりしていない。実試合の承認では、回数境界と料金の不確実性を明示する。

根拠: `.github/workflows/stage-release.yml` の既定値とStage E2E設定、`backend/src/scripts/persistent-battle-e2e.ts` の事前投影・予算承認処理、`packages/shared/src/awareness-policy.ts` の現行ポリシー、`backend/src/llm/awareness-dispatch-admission.ts` と `backend/src/repositories/awareness-reservation-budget.ts` の実測時の予算受理。

リモートreadback: main `aa1f5d75221bef546c7cd566fa4ba858ccb6e133`、最新既存タグ `v0.23.0-rc.17` は同じSHA。PR #172はOPEN、head `c9f086121289b86201a9a994c3b0a69a3e266ffe`、旧CIのvalidate/securityはFAILURE、backend-image/workerはSUCCESS。現在のローカル変更に対するCI合格とは扱わない。

## ADR正本追加後の全体検査

Node 22で `npm run adr:check` を正式に実行し、終了コード0。0062・0063の正本を含む現行44ファイルが監査成功、既存の固定済み歴史例外4ファイルはchecker規定通り除外。証拠は `docs/evidence/ci-effort-contracts-2026-10-09/final-adr-check.log`。初回はPATHの空白を含む展開を引用しなかったため、npm起動前にenvが終了コード127で停止した。初回ログを `final-adr-check-launch-failure.log` に残し、PATH引用を修正した実行の終了コードを別に確認した。検査対象ソースやchecker契約は変更していない。

## 正式inventory採用後の追加照合

独立レビューは、inventoryを実行用bootstrap registryとして扱い、採用後JSONのcurrent source-bound Sealを別途残すことを必要とした。generic selectorと合成unit testは実251件のmappingを証明するclaimを持たず、内容変更もないため再Sealしない。公式実行の記録は採用後inventory Sealと全251 test headsの双方を前提にする。

現行JSONは247件（unit243 + E2E4）、R3候補は251件（unit247 + E2E4）。公式source compareで、旧 `implementation/test-authority-inventory-v2` HEAD `8903c34cd976b58afc723ba9f12dbdaab921930293c71ecfb72a8c00841de1e5` のbindingが、採用前から `WORKFILE_DIFFERS_FROM_HEAD` と確認できた。証拠は `docs/evidence/test-inventory-historical-binding-readback-2026-10-09.json`。旧Sealを現行一覧の証明として使わない。R3最終検査後に候補を採用し、旧HEADを保存したcurrent successor REFで新JSONをSeal/source compareし、ACTIVE_LEAF・NO_CANDIDATE・non-draftを確認する。現在は未採用・未封印であり、この記述は完了証拠ではない。

後続4ノードの独立レビュー済み計画は `docs/evidence/current-test-inventory-adoption-plan-2026-10-09.json`（SHA256 `3cf722ff2250186d637f1c26f58dff23799b52bfacb60b477bb90662d619b2d1`）。reviewed R3 planはADR0058/0060に加え、具体的な新ルールを認可するADR0062/0063 canonicalのfinal Sealを直接Causeに持つ。そのplanと実行verifier sourceをCausesにしたnon-root readback receiptから、採用後registryのcurrent Sealへ接続する。

readback verifierは実行コード・plan・publication journal・674 cohortの入力hash、終了時入力不変、出力するcandidate inventory bytesそのもののSHA256、全251 path/ref/current Seal IDを追加した。従来の判定は保持し、独立レビューPASS。現行verifier SHA256は `00c20ba0e252949a5ed562326a96243a0c2f49294b4837094819ed8993db58ae`。これは674のruntime source cohort外の検証artifactの改訂で、公開中のR3 plan/producer sourceは変更していない。4ノードの公開・最終readback・inventory採用・正式実行はこの記録時点では未了。

### 14:19 JST: manifestの旧Cause接続修正

R3処理は387/392件で実際にexit1となり、現行へ改訂済みのcharacter型Causeを固定manifestがexternal旧版として参照したためnormal Sealが拒否された。元のplan bytesを`current-source-closure-plan-r3-before-manifest-link-repair-2026-10-09.json`に保持した。未公開manifestの親1件を現行producerへ接続し、旧Sealをprevious metadataに残した。独立レビューはCause修正・残5件のみの限定処理をPASSとしたが、元publisherの自動修復はassertionに阻まれるため使わなかった。

現plan SHAは`d00d95d149ac0cdda4177d7b4cd30422731f98bfb5f011cc965ea63cf07f65fa`、adoption plan SHAは`239a2008d5497391e58903ede00b8bc8edc4feed88385af1e9aeae3e0ba7edf8`。verifier SHA `00c20ba0e252949a5ed562326a96243a0c2f49294b4837094819ed8993db58ae`は変更なし。既公開387件のexpected、旧HEAD、674 runtime sources、251 original test scopeは不変確認済み。残5件は公式CLIで公開・個別照合された。終了時不変検査と392/251の包括検証、登録採用、正式テスト、CI、配備はまだ完了として扱わない。

### 続報: 392件の公開処理完了・包括検証開始

限定5件writerはexit0、392 logical nodes、557履歴events、旧HEAD不変で正常終了した。処理単位307.767秒、公開＋個別照合71.689秒、重複HEAD読取りを含む終了時検査236.078秒として実測を保存した。全体の能率やCI/配備所要時間へは外挿していない。

検証producer2件も公式CLIでsource-bound/non-root/non-draftと正確なCauseを確認し公開済み。plan Sealは`ed21b581503ea3f3aac63793edf12a98b3a532f2df8e61d8f016cd8f02b821c8`、verifier Sealは`d9caba0cadb8918a7b6f97230bfbe0e7a30d45451489f1bee6d91742d272539a`。全体read-only verifierをsession79035で実行中、ログ`/tmp/kshiai-full-closure-verifier-20261009.log`。終了未確認のため、251登録採用・正式テスト・CI・配備合格は未達。次は同handleを確認し、結果が成功した場合のみresult Sealとregistry採用へ進む。稼働中の観測待ちを理由に再起動しない。

### 正式全原試験の合格・実行証跡封印

正式`npm test`はactive247/provisional0/disabled0、1,468ケースpass/fail0/skip0、exit0。正式`npm run test:e2e-gui`はactive4/provisional0/disabled0、Pixel7標準設定の10ケースすべてpass、exit0。ソース674・HEAD・registryの実行前後不変、 private PostgreSQL終了exit0を確認した。全体build/lint（型、jscpd、Lizard）もexit0、fresh npm audit指摘0。

実行証跡`formal-all-tests-2026-10-09/execution-receipt.json`をnon-rootでSeal `4335ddd900d57976bf554c7b799d776f22b0c020aac4be00734737b6efcc7f1f`に公開。253 Causesはregistry、実行driver、全251現在testheads。改訂test130件のprevious metadataを独立レビューで補正し、旧testをcurrent Causeへ戻していない。旧test130 SIDは現在251から到達する988 Causes中に0、全251現在HEAD/statusがactive/clean/source一致とreadbackした。原試験の削除・skip・無効化はない。CIと配備は未達。

約207MBの終端status原本はローカルに保持し、約3MBのgzipと復元SHA一致証明をGit対象にする。gcloud独立照合は実際に再認証エラーとなり、所有者へWSL再認証を依頼済み。GitHubルートはsecdat secret GH_TOKEN dry-run成功・PR172現状readback済みで継続可能。これからexact stage snapshotのTrivy secret scan、commit/push、同一SHA4 CI checksを実施する。

### main CI合格と配備候補

2026-10-09、PR172の最新branch commit `fc54a385aca20dc96487478cac328e8a5c08b4df` はCI run37895501276のvalidate/security/backend-image/workerがすべてsuccess。標準squash mergeでmain `1eb97c18c4af580cac2922fd64844128b281bd79` に統合され、両者のGit tree `3c6bba83c4a055fd45d6085c3d8d9e44bf458310` は一致した。main自身のCI run37896554555も4項目すべてsuccess。生ログから単体1468件pass/fail0/skip0/cancelled0を独立集計した。意識パイプライン契約検査と生成物差分検査も合格。記録は `docs/evidence/all-tests-main-ci-2026-10-09.json` と同名のlossless log.gz（復元SHA一致）。正式E2E4ファイル/10ケースの証拠は引き続きformal execution receiptを用い、CIがE2Eを実行したとは主張しない。

製品リリース候補 `v0.23.0-rc.18` のannotated tag objectは `c360cdeda44ee1708a891b822540f69d6ba751ae`、対象commitは上記main SHA。secdat経由push後のremote readbackで両方を確認した。Stage/Promoteは未実行。正本PERTのciはdone、deployはタグ準備からactive。開始・終了は検証JSON保存とGit tag ref書込みの実際の日時を用い、秒精度tagger値による前後の曖昧さはcommit前に正規CLIで訂正した。

作業単位をソース固定→全試験→1回のpush→同一SHA4 checks→標準merge→main SHA再照合へまとめた。branch CI全体507秒、validate506秒を観測。経過時間を投入工数へ変換していない。PERTでは4完了taskの観測値が得られたが、異なる配備工程へ外挿しない。観測JSONを `docs/evidence/all-tests-ci-work-unit-observation-2026-10-09.json` と `all-tests-velocity-after-ci-2026-10-09.json` に保存した。

残条件は、Stageに含まれる有料試合1件/物理LLM最大200回/advance最大38回/追加キャラ生成なしの承認、Stage成功、保護されたproduction承認と同じartifactの昇格、独立のimage/revision/traffic/Worker/health照合。現在のobserved accountingには0.50USD等の金額停止ガードがなく、料金未確定のため総費用は未確定。失敗・不明時の有料再実行は未承認。正本PERTが有料試行を含めていないため、所有者へ候補を示して確認待ち。標準169回指定は200回予約を満たさず、試合作成前に拒否される。

公開healthの更新前readbackはok=true、revision `kshiai-api-00183-wey`。gcloudの独立照合は再認証待ち。これらを更新後配備の証拠に流用しない。配備完了・goal completeは未達。

## Stage失敗と現在ソースの継続修正 — 17:38 JST時点

上記のStage未実行・認証待ちは07:15 UTC時点の履歴。所有者の一回の有料Stage許可により、製品リリース候補v0.23.0-rc.18のStage run37901860044を一度だけ実行し、試合進行でfailure。保存状態はincomplete、理由AWARENESS_EFFORT_PERCEPTION_REQUIRED。LLM台帳6回completed、総トークン31214、outstanding0。金額未確定。有料再試行は未実施・未許可。

発声確定で知覚を再生成するawareness-expression-commitがactionEffortを渡していなかった。原awareness-contextの7ケースを保持し、発声→両側の知覚→実意識contextの回帰を追加。修正前は同じエラー1件、修正後はcontext8＋expression5合格。CLI因果監査fatal/error/warning0、hint2（原因説明と修正方針の共通根拠・意味近接）。現在状態から再投影する修正と型で必須の受け渡しを加えた。全体型・build・静的・ADR検査も成功。詳細はstage-effort-transfer-repair-2026-10-09.md。

変更実装1件、原表現テスト1件、回帰を含むcontextテスト1件の計3REFだけ個別確認して封印。全Cause/previous/messages/source一致と他HEAD保持、fsck okを確認。公開作業121.065秒。旧392ノードの一括再公開を省いたが、作業内容が異なるため121秒から旧作業全体の短縮率は推定しない。原674ソースの変更は実装1＋テスト1だけ。新しいsource cohortで全247ユニット/4E2Eの正式検証は成功。ユニット1469件（原1468＋回帰1）、E2E10件、fail/skip0。正式ユニット213.100秒、E2E335.387秒。実行中のsource/HEAD/inventory不変とprivate PostgreSQL停止も確認。新しい実行証跡の251試験＋登録表＋実ドライバへの253Causeを公開・全previous/messagesまでreadback済み。封印9489aee70c43f8ab677ab54189553124685103816b0f22b8cdbcb712ac542dfa、公開978.662秒。旧正式実行REFを保持し、新fsckもok。以前の正式実行・CIの成功は修正前SHAの証拠であり、新修正のCI成功とは扱わない。

失敗後の独立readbackで公開Cloud Runはkshiai-api-00183-wey 100％、Workerは4a34e357-c390-4ec1-9429-5b0452ce2fbc 100％。新stage revision185とWorker dcbe1267は公開へ昇格していない。Stageのforward-only migration実行と候補作成は行われたため、全外部状態不変とは主張しない。公開配信先のみ従来維持。

修正候補は製品リリース候補v0.23.0-rc.19。タグは未作成。正式原全試験→同一SHA CI→次の有料Stageの具体的承認→標準公開配備と独立runtime照合が未達。正本deploy taskをこの経路へ具体化してCLIでcheck/schedule/nextを再検査済み。共有終了予定20:00は維持、stop/endなし。

## 修正候補のmain CI・タグ照合（18:40 JST）

PR173のmainコミット `64d33efd9e64650491a6df2f9165fa1807811c85` はCI run37911506954のvalidate・security・worker・backend-imageがすべて成功。unit247ファイル、1469件成功、失敗・skip0。修正後の正式実行は元のunit247＋E2E4ファイルを維持した。注釈付き `v0.23.0-rc.19` を同コミットへ固定し、リモートtag objectとpeeled commitを照合した。Stageの追加有料実行は未許可・未実行。前回の1回許可は失敗終了で消費済み。次候補は1試合・physical呼出200・advance38・追加キャラ作成なし・料金上限なし・金額不明・有料再試行なし。候補の詳細は `docs/evidence/stage-rc19-candidate-2026-10-09.json`。公開配備完了は未達。

18:41 JST、所有者が上記候補の追加1回を承認。Stage run37912860756を同タグ・同ソースへ一度だけdispatchし、run identityを照合した。開始時点では結果未確定、公開配備は未実行。
