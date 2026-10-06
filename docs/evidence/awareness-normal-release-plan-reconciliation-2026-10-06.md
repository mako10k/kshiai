# 現行経路の配備前証拠照合（2026-10-06）

正式PERT: `docs/speech-continuity-and-fade-recovery.pert`、task `awareness-current-verify`。所有者が承認した旧切替試行との分離・Point等価移行を適用した。旧 `awareness-verify` はID・履歴・suspendedを維持する。今回の公開ゴールはAWARENESS_PUBLIC_COMPLETED、全計画終点はALL_PLAN_WORK_RESOLVED。保留旧試行は公開枝の前提から分離するが、全計画の完了には必要である。

## 対象と現在の証拠

| 受理された契約 | 実装・検証 | 確認範囲 |
|---|---|---|
| ADR0051: SDK実利用トークン、失敗時・未知値の扱い | llm-usage.test.ts / llm-cost-report.test.ts / provider-operation-taxonomy.ts | 成功・invalid JSON・timeout・late response・nullable usage、物理呼出し分類。料金証明を作成条件にしない |
| ADR0054: 通常運用の待機期限とimmutable policy | awareness-policy.test.ts / model-request-options.test.ts / awareness-provider-factory.ts | 36tick・600秒、Luna reasoning none、Grok配分、既存束縛 |
| ADR0056: 新規・継続とも最新出力指示、正常完了後の実況固定 | awareness-request.test.ts / narration-prompt-contract.test.ts / awareness-frozen-narration.test.ts | v1/v2/v3ラベルに関係なく現行指示、全4phase、strict receipts、入力不変。persisted worker/provider/publication統合検証を全4phase×v1/v2/版なしの12条件で追加 |
| ADR0057: 公開観測の厳密な完了条件 | awareness-public-observation.test.ts | terminal状態・未解決呼出しなし・実況完了・SDK usage。実公開完走は後続taskで実測 |
| 認証・履歴writerの保護 | authenticated-sse-smoke.test.ts / historical-character-smoke-fixture.test.ts / character-generation-v2-write-boundary.test.ts | 実routeの404/403、所有者SSE、provider呼出し0、fixture清掃、通常V2writer拒否維持 |

PR158 HEAD70619a85c4c5c839db11fbfa155df5d6992a3756 のCI [37392808297](https://github.com/mako10k/kshiai/actions/runs/37392808297) はvalidate/security/backend-image/workerの4jobすべてsuccess。backend-imageでは実runtime image compiled API importとTrivy scanが成功した。ローカルではsealed全201件、awareness278件、typecheck/build/static検査に成功。追加統合検証を含むHEADの4必須CIを確認してからcurrent-verifyを完了する。現行アプリソースは上記成功HEADと同一で、追加変更は検証・計画資料のみ。

## 残る公開検証

rc5 stagingのauth SSEは404で停止し、有料試合は未実行だった。修正は終了済みfixtureで実際のSSE経路を検査する。新release tagで公式Stage成功後に公開Promote、公開Observeを実行する。現時点では公開完走の達成や計画全体の完了を宣言しない。

## 見積・実測

移行換算1p/1hは実測速度ではない。SSE修正の399秒/0.5pから観測した600p/133h（約4.51p/h）は単一小作業の低確信度サンプルで、モデル・配備待機へ転用しない。current-verifyを09:12:53 JSTから計測し、その終了値で更新する。公開ゴールの内部残作業45〜90分は暫定agent見積・低確信度、外部待機別。旧保留taskは3p相当、再開未許可。

## 公式CLIの履歴観測制限（追加確認）

Point移行後のcommitを含むproject observe-velocityはok:false、event_payload_changed54件とtask_identity_replaced1件を報告する。公式migrate-unitが既存work_event.planned_valueを変換する一方、installed0.12.0のhistory readerは同一IDのpayload変更として検出する。承認済み保留taskの到達先変更もtask identity比較に含まれる。`--task`限定でもproject全体の衝突は消えない。document check / precedence・resource schedule / dag nextはok:trueであり、activeはcurrent-verify、公開taskはupcoming、旧taskはsuspended。

以前の移行直後のSSE観測候補600p/133hは現commit履歴が有効と認められた証拠にはならず、計画へ実測速度を適用済みと扱わない。実際のstart/finish/effortは維持し、以後も正規CLIで計測を続ける。`new-root`は別project predecessor排除用なので使用しない。手編集・ID再付与・履歴削除・Git書換えも行わない。正規の修復候補はperttool側の単位移行とtask再編の履歴対応であり、別repoの実装範囲は今回の公開配備とは別の所有者判断を要する。公開配備経路は有効なDAG/nextと実証から進め、速度観測の未解決制限を明示する。

所有者追加指示により、公式unit migrationだけの単一task・2commit再現を分離し、[perttool Issue #42](https://github.com/mako10k/perttool/issues/42) を登録した。2026-10-06に本文・作成者mako10k・OPENを読戻し一致確認。実計画履歴は保持する。task再編のidentity診断を任意に緩める要求はIssueに含めない。

追加継続テストは processNextNarration → TransportAwarenessNarrationProvider → transport double → publicationを実行し、旧指示除去・現行receipts契約・style/observer/user・保存入力/digest・phase receipt・公開本文を確認する。新規ファイルのみの検証追加で、製品実装変更はない。

2026-10-06 09:47 JST追加検証: Node22 test:awareness 全279件PASS（追加統合テストを含む）、全workspace typecheck PASS。sealed全201件は先行app同一sourceのCIとローカル成功証拠を保持する。最終配備headは全必須CIで再確認する。

追加CI37395861689は新規継続テストだけprologue/v1でidleを返し失敗した（他278件PASS）。調査でstatic provider importがテストenv設定前にDB/configをロードし、fixtureがinsertNewBattleだけでenqueueを行わずSQL UPDATEに依存していたことを確認した。ローカル残存fixtureが成功を支えていたため、先行279PASSを独立fixtureの証拠とは扱わない。providerをenv設定後のdynamic importへ変更し、configのDB隔離をassert、created/runtime初期化の成功をassert、明示enqueueNarrationに置き換え、SQL resetを除去した。修正後の空DB検証と毒入りambient DB設定の検証を実行し、CIで再確認する。RCA DSL auditはfatal/error/warning0。

修正HEAD0a016278のCI [37396317094](https://github.com/mako10k/kshiai/actions/runs/37396317094) は4必須jobすべてsuccess。全279awareness検査・sealed201・build/typecheck・runtime import/scan・Worker検査を含む。current-verifyを完了し、document check/both schedules/nextすべてok:true、next推薦はawareness-public-deploy。旧保留は維持。実績のeffort0.61phはDEV1の作業区間合計を小数2桁へ丸めたsession計測で、2つのCI待機区間を除く。速度観測の履歴制限はIssue42へ記録済み、実測速度を適用済みとはしない。
