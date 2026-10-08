# 全テスト封印・合格への再開記録（2026-10-08 夜）

## 目標と作業場所

元の単体247ファイル＋E2E4ファイルを保持し、現在の実装との因果接続を正しく確認して封印し、正式な全テストを合格させる。診断合格や一部のSeal公開で完了にしない。

作業先は `/home/katsumata-m/.codex/worktrees/cc304-focused-revise-kshiai`、branch `codex/rc17-release-evidence`、HEAD `d7fe6df1287ee834fcdd9e9c3e0069b3f32b3696`。主checkoutは変更しない。既存の大量WIPを保持する。リモート更新、配備、有料実験、共有worktimectlのstop/endは行っていない。

## 今回得た結果

- 86単体ファイル：576ケース診断合格。私有ローカルPostgreSQLを使った4ケースを含み、PGは停止済み。
- 残161単体ファイル：882ケース中881合格・1失敗、skipなし。全247ファイルを一巡したが正式実行ではない。
- 失敗は固定試験キャラ候補のGETレビューで `canEditCandidate` がtrueになること。候補の存在ではなく、厳密に検証したfocused修正元の受領を条件に変更した。
- 固定候補の元ケースは維持し、最新版のcandidateDigestとIdempotency-Keyを送る要求に更新した。既存409拒否確認を保持した。通常の完全候補の編集可能assertionも元ケースに追加した。
- 修正後の固定候補3・元HTTP15・focused15＝33ケース合格。最終workspace/deployment typecheckも合格。
- E2Eは4ファイル・元10ケースが診断合格。ただし最後のbackend編集可否修正より前の実行なので、実APIを使うV3 local integrationの最終再検証は残る。残り3本はHTTP mockを使用する。
- 最新 `npm test` はunsealed4で実行前に停止、`authority_evaluated=false`。正式合格ではない。

証拠は `docs/evidence/character-feature-remaining-unit-diagnostic-2026-10-08.tap`、`character-review-editability-final-2026-10-08.tap`、`character-review-editability-final-typecheck-2026-10-08.log`、`character-feature-all-e2e-diagnostic-aggregate-2026-10-08.json`、`character-review-editability-formal-gate-2026-10-08.log`。

## Seal公開の停止点

239ノードの現行ソース閉包公開を118件で停止した。PID1099046（session88833）はexit143を確認済みで、生存していない。再起動しない。

現在のCLI linkが終了するまで親publisherを停止し、その後、所有している親だけを終了した。最後の作業候補は `all-tests-20261008/current-source-closure/verification/awareness-frozen-narration-20261007`。候補と元REFを削除していない。停止理由・候補readbackは `docs/evidence/character-current-source-closure-stop-2026-10-08.json` と `character-current-source-closure-pending-candidate-2026-10-08.json`。

公開journalは `character-current-source-closure-publication-events-2026-10-08.json`。旧1360 HEADとsource bindingの保持を検査する。元の239ノードplanは最後の3ファイル修正より前のsource snapshotなので、そのまま再開不可。新しい現在ソースと公開済みprefix、未封印candidate、必要な追加因果リンクを照合してplanを改訂する。公開済みroutes.tsのsource-bound Sealも再封印が必要。旧公開履歴を消さずに新しいrevisionの対応を記録する。

Publisher、whole-wave verifier、prefix verifierのコードは `docs/evidence/character-current-source-closure-*-2026-10-08.py` に保存した。whole-wave verifierは旧239ノード/248mapped条件用であり、改訂planのノード数や因果関係へ合わせて更新する。現在のtest inventoryは切り替えていない。全件公開・readback・fsck前に切替しない。

## 今回確認した因果接続の漏れ

`backend/src/repositories/local-v3-trial-characters.test.ts` は現在の `buildRoutes` を呼ぶ。旧Seal `verification/vt109-fixed-v3-registration-20260929` から到達する28ノードには、今回識別した6本のroutes.ts source-bound producerがない。代わりに旧実装の複数ファイルhash manifestを根拠にしていた。manifestには歴史的routes.ts hashがあるが、現在のroutes.ts変更がmanifest自体を書き換えるわけではないため、source-bound閉包による対象選定で漏れた。

このテストの新しい根拠に、現在のレビュー/修正ルートproducerと必要な実受渡しを追加する。その他の保持manifestも、実際の現在の消費先を確認する。source bindingの一致だけで「全テストの必要情報がそろった」と宣言しない。詳細は `docs/evidence/character-review-editability-cause-gap-2026-10-08.json`、同prior-test-seal、prior-manifest、prior-manifest-content、graph証拠。

## 次の作業

1. 現在のsource、旧HEAD/binding、停止candidateと公開journalを再照合する。
2. 固定候補テストの現行producer接続を追加し、保持された複数ファイルmanifestを根拠にする他テストにも同種の欠落がないか調べる。
3. 正しい現行因果閉包として公開planを改訂し、ソース修正で古くなった公開prefixと未公開ノードを整理して封印する。旧239ノードplanを盲目的に再実行しない。
4. 未封印元4ファイルのうちHTTPは実装済み・15ケース保持。balance/engine/cooldownの残り3ファイルはAccepted ADR0060の変更と未決詳細を整合させて実装・検証する。
5. 最新の実API E2E、正式unit/E2E、型検査、全原範囲・受渡し・source閉包・fsckを検証する。部分診断結果で正式全体完了を宣言しない。

反復STA候補A（2〜3回目+2、4回目以降+4、basic/skill/reflectのみ、新規試合適用・保存済み方針維持）は非同期の所有者回答待ち。自由行動裁定penalty種類/上限は承認に含めない。装備4効果の保持と自動代償/schema上限も未解決。production pacing候補の採用は未決であり、このSeal作業で採用扱いにしない。

## 実行と時間

Node22：`env PATH="/home/katsumata-m/.nvm/versions/node/v22.22.3/bin:$PATH" ...`。Node25はSQLite ABI不整合。診断DBは/tmp私有領域を使い、DATABASE_URL/DIRECT_URL等を空にして本番経路を使わない。Playwrightは `E2E_GUI_BASE_URL` を空文字でなくunsetする。原テストは削除/skipしない。

本チャットで指定された区切りは20:00 JST。19:51時点の共有worktimectl readbackではplanned_endが20:30 JSTに変わっていたが、本チャットから追加延長は登録していない。共有stop/endはしない。全体残り8〜14時間は低確度の暫定値で、旧manifest接続の追加監査により増える可能性がある。全体完了日時は未確定。

## 19:58 追加の限定監査

現行inventoryから到達するsource未束縛のimplementation REF候補32件を、公開CLIのraw-contentで読み取り専用に調査した。`sealgraph/path-manifest/v1` は1件で、今回の固定候補テストから到達する既知の旧manifestだった。現在hashとの差分があり、この選択範囲で影響照合が必要なテストは1件。所要29.378秒。その他形式・別名前空間・未束縛REFのない歴史的Sealや実ランタイム依存すべてを検査したとは扱わない。証拠：`docs/evidence/character-review-retained-manifest-drift-audit-2026-10-08.json`。

## 20:23 改訂計画と最新診断

共有planned_endの最新値20:30を計画基準にし、20:25までに収まるノードだけ扱うpublisher revision2を実行中。旧publisher session88833は停止済みのまま。新版はsession12930/PID1651008、244論理ノードを対象に、旧118件の全文Cause readbackを4並列で確認後、同一のsourceとCauseを再利用する。公開済みroute2件と下流portrait test1件を再封印し、停止candidateも元planとの一致を確認して完成した。旧履歴は消さずrevision2 journalへ追加する。`docs/evidence/character-current-source-closure-publication-events-r2-2026-10-08.json` のkeyごとの最新eventを使用する。inventoryは未切替。新版にもdeadlineがあるため、プロセス生存/terminalを先に確認し、二重起動しない。

旧16ファイルmanifestを現在の16個のsource-bound producerへ接続する候補を含め、244ノードのDAGは循環なし、外部239接続先もACTIVE_LEAFだった。候補planは `docs/evidence/character-current-source-closure-plan-r2-2026-10-08.json`。新しい固定候補whole-file testを登録するため、完了時の既存whole-file差替え対象は88、原HTTP追加後のmapped数は248。旧239ノード専用verifierはそのまま使わず、revision2の最新event集合/244ノード/248テストへ更新する。

修正後の全単体247ファイル1458ケースが112.43秒で合格、fail0・skip0。私有PG4ケースを含み、PG停止exit0とport55439無応答を確認。最後の修正後の実API E2Eも1ケース合格。残りmock API E2E9ケースは以前の同一frontend/fixtureで合格済み。証拠は `docs/evidence/character-review-editability-full-diagnostic-validation-2026-10-08.json`。旧cooldown assertionの診断合格はクールタイム廃止の実装を証明しないため、未決3ファイルと正式全体合格を完了扱いにしない。

## 20:29 最終readback

Revision2 publisher（session12930/PID1651008）はexit0を確認済みで、生存していない。244論理ノード中134をsource/Cause照合・封印済み、115再利用＋19新規/再封印、137履歴eventを保持した。残110ノード。次の未処理は `all-tests-20261008/current-source-closure/all-tests-20261008/implementation-historical-adr-classifier-bounded`。旧1360 HEADと旧925 source bindingを保持、停止後fsckはok。inventoryは未切替。新版の固定候補テスト/manifestはDAG末尾のため未公開で、接続完了と宣言しない。

最終HEAD確認の繰返し読込みで終了処理に時間がかかった。次回publisherはHEAD一覧を一度だけ読む修正版にしている。今回実行した版は `docs/evidence/character-current-source-closure-publisher-r2-executed-2026-10-08.py` に保存した。実行と将来版のhashは `character-current-source-closure-independent-head-readback-r2-2026-10-08.json`。次の再開時は新しい作業枠を確認してdeadlineを設定し直し、現在の最新journal/source/priorHEADを確認する。期限切れの20:25をそのまま使わない。旧publisher r1は再実行しない。

全体完了は未達。全単体1458/1458、E2E原10ケースの診断証拠はあるが、残る封印、未決STA/penalty/装備保持契約、正式全集合の実行が必要。共有worktimectlのstop/endや追加の延長登録は行わない。20:30維持/21:00延長の時間確認は回答待ち。回答なしで21:00へ変更しない。


## 21:00 extension checkpoint (2026-10-08)

Owner explicitly extended shared end to 21:00 JST; overtime registration was performed once and read back. No shared stop/end. Publisher session 43263 terminated exit 0 at its 20:55 bounded limit. Current wave: 178/244 logical nodes, 181 retained journal events, 134 reused and 44 newly published this run. Remaining 66. Original 1360 HEADs and 925 source bindings preserved; final extension fsck ok. Inventory has not switched; formal all-tests success has not been established.

Resume next node: `all-tests-20261008/current-source-closure/verification/narration-prompt-contract-20261007`. Reuse R2 journal after exact current source/Cause checks; select a newly authorized time limit before resuming. Historical executed publisher snapshots are retained. The R2 whole-wave verifier now handles 244 unique latest journal keys and 88 replacement test mappings plus the original HTTP mapping, but has not run because publication is incomplete. The fixed-trial new test/manifest is still unpublished at the DAG tail.

Current diagnostic evidence remains all 247 unit files / 1458 cases passing without skips plus original four E2E files / ten cases represented. This does not certify cooldown abolition. STA quantities, free-action penalty details, equipment effect representation and pacing authority remain unresolved. Estimated remaining work 8–14 hours (low confidence); completion date unknown.

Final worktimectl readback at about 20:55 showed shared planned_end 21:15 JST, changed outside this task. This task did not register that extension; its owner-authorized work window remains 21:00 JST. No new work was started on the strength of that shared-state change.
