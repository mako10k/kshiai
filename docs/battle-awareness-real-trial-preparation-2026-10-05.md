# 意識パイプライン awareness-v5 実モデル短期試行の準備

状態：候補は承認済み。実モデル試行を1回実施し、遭遇生成のタイムアウトで終了。再実行は未承認。旧切替試行の契約変更は保留を維持する。

根拠：ユーザーの「次のタスクは？」に対して提示した、送信しない接続確認・固定入力・利用量読戻しの準備を「では、進めてください」で承認。動作は Accepted ADR-0051 とその継承先、入力・出力は現在の awareness-v5 契約に従う。

## 固定候補

`docs/evidence/awareness-real-trial-candidate-2026-10-05.json` に、通常データと分離した試行用キャラ「アオ」「クロ」のシート、キャラクター定義 v3、試行条件、モデル割当を保存した。両者は素手の成人で、特殊能力・技能・反射訓練を持たない。既定の戦闘パラメータを使用する。既存キャラや生成済みキャラの代用ではなく、この短期観測専用の入力候補である。

候補識別子：`awareness-real-trial-2026-10-05`。
候補の compact JSON バイト列 SHA-256：`a1e4a95291289f9a6cf5d2fb77120bd362c75b58d223845c1b8f3212e5b1ac7c`。
この値は保存されるアセット世代の contentDigest ではない。世代IDと実際のアセットダイジェストは、隔離DBへの登録時に通常の保存処理で付与し、試合束縛形式 v5 のスナップショットから読戻す。

| 役割 | プロバイダ | モデル | 条件 |
| --- | --- | --- | --- |
| 潜在意識 | OpenAI | gpt-6-luna | reasoning none |
| 顕在意識 | xAI | grok-4.5 | 現行の顕在意識契約 |
| 裁定・遭遇 | xAI | grok-4.5 | 現行の裁定・遭遇契約 |
| 実況 | xAI | grok-4.3 | 現行の実況契約 |

訓練場の遭遇生成・prologueを経て、戦闘を3 tickだけ進める。場面指示は「明るい平坦な訓練場。障害物や武器はない。互いに見えている」。初期位置や距離は正準状態の遭遇生成結果を記録し、事前に実現済みと扱わない。キャラ生成・画像生成は実行に含めない。

3 tick後は追加進行を止め、すでに送信した処理・実況・利用量を期限内に読戻す。未完了の試合を勝敗決定済みにしない。顕在意識を人為的に3 tick遅らせず、参照時点と適用時点を観測する。自然な遅延が発生しなければ、この試行から遅延ケースの実証はできない。

## 接続の確認結果

2026-10-05、main worktree の既存 secdat ドメインから2個のAPIキーだけを子プロセスへ注入する dry-run と実行を確認した。キー値を保存・出力せず、`.env` を書き換えていない。

準備スクリプトは共有スキーマによる入力検証と設定読取りのみを行う。API呼出し、モデル一覧取得、DB初期化、キャラ登録は行わない。OpenAI と xAI のキーは両方存在し、設定URLはそれぞれ `https://api.openai.com/v1`、`https://api.x.ai/v1`。API側の認証・モデル利用可否・自然文入力への応答品質は未確認である。

再生成コマンド（通信しない）：

```sh
secdat --dir /home/katsumata-m/kshiai exec \
  --inject secret:only=OPENAI_API_KEY --inject secret:only=XAI_API_KEY \
  --inject secret:require=OPENAI_API_KEY --inject secret:require=XAI_API_KEY \
  --inject route:prefer=secret \
  --inject final:require=OPENAI_API_KEY --inject final:require=XAI_API_KEY -- \
  /home/katsumata-m/.nvm/versions/node/v22.22.3/bin/node --import tsx \
  backend/src/scripts/prepare-awareness-trial.ts
```

## 実行候補と読戻し

承認された実行対象は、専用の新規ローカルSQLite DB 1個、上記の固定キャラ2件、新規試合1件、prologueと戦闘3 tickのみ。通常DB・公開サービス・旧試合には適用しない。実行用ハーネスはDB指定を最初のDB関連 import より前に固定し、新規ディレクトリと空の隔離DBに限定する。隔離ハーネスとアセット登録のオフライン検証は完成した。実モデル試行1回は遭遇生成で停止し、試合自体は作成されなかった。

観測課金ポリシー `awareness-v5-usage-v1` を束縛する。現行の上限は試合全体180秒、物理呼出し200回、同時呼出し6件。役割別出力上限は潜在600、顕在1500、裁定1500、実況1200トークンであり、修復・期限も既存ポリシーを変更しない。3 tick試行では36 tick全試合を実行しないが、200回より厳しい物理上限を新設したとは扱わない。0.50 USDは観測目安であり料金上限保証ではない。料金表なしでは金額は不明として実利用量を報告する。

| 観測対象 | 読戻すもの | 判定 |
| --- | --- | --- |
| 実利用量 | llm_usage_attempts の各物理試行・requested/response model・status・rawUsage・入力/出力/cache/reasoning tokens | 不明値を0で埋めない。失敗やtimeoutも含め、合計と未取得件数を出す |
| 応答時間 | 役割別 elapsedMs と startedAt/finishedAt | 小標本なので分布の優劣は断定せず各値を保存する |
| 顕在合流 | 凍結入力のsource tick、完了時点、採用/棄却、適用tick | 過去状態への逆適用がなく、最新状態で実行可能性を判定していることを確認 |
| 反射と感情 | 潜在出力の反射・感情・行動意欲の区別、強さと有効期限 | 同一呼出し内で区別され、競合する身体行為の選択が契約に沿うことを確認 |
| 正準状態 | 各tickの確定前後スナップショット・receipt | LLMの意欲がそのまま事実にならず、裁定した結果と一致することを確認 |
| 実況 | receipt集合、batch、公開された文章、実発声 | 既処理receiptの重複公開や私的思考の漏出がないことを確認 |

利用量CLIはモデル呼出しを行わない。実行後の専用DBと試合IDを指定する。

```sh
DATABASE_URL='' DATABASE_PATH='/absolute/path/to/isolated-trial.db' \
  /home/katsumata-m/.nvm/versions/node/v22.22.3/bin/node --import tsx \
  backend/src/scripts/llm-usage-cost-report.ts --battle TRIAL_BATTLE_ID
```

キャラ・世界・私的な意識状態を含む観測資料はローカルに保持し、公開用実況と分ける。各送信結果が失敗した場合はエラー分類と利用量を保存し、原因不明のままフォールバックや追加の別試合を送信しない。再試行は今回の候補の実行回数を拡張するので、結果を確認して次の実行候補を決める。

## 次の作業

下記の完成済みハーネスを1回実行する候補に対し、ユーザーの「OKです。」で明示承認を得て、1回だけ実行した。承認はモデル・1試合/3 tick・適用先・費用不明部分を含む提示候補に対応する。結果を受けた再試行やモデル／期限変更はこの承認に含めない。

親ゴールは実モデルでの awareness-v5 動作と経済性の観測。今回の `real-model-trial-preparation` は準備を担当し、旧切替契約に依存する `awareness-verify` の保留を解除しない。今の成果は固定入力と読戻し条件であり、利用者が実モデル戦闘を利用できる状態にはまだ到達していない。

## 準備の検証と見込時間

HTTP fetch を例外にするオフライン実行で固定入力の再生成が成功し、保存候補との構造・ダイジェスト一致を確認した。全ワークスペースの `npm run typecheck` が成功した。今回は準備スクリプトと候補資料を追加しただけで、戦闘実装の再テストや有料試行を行っていない。

正準PERTのタスク開始は17:41:16、完了は17:45:28 JST（252秒、主担当1人の連続作業0.07人時）。計画検査・両スケジュール分析・nextが成功した。observe-velocityは既存履歴のmissing_baselineにより採用可能な速度を出していないため、予測に測定速度を適用していない。次の測定点は隔離実行ハーネスの開始・完了であり、2026-10-05の次回着手時に基準値の適用条件も確認する。

準備タスクと隔離ハーネスの残作業は0。実行承認後の観測・整理は内部作業0.5〜1時間、主担当1人・1試合/3 tick・追加修復なしを前提としたエージェントの暫定見積もり（確信度：低）。保留中の旧切替契約対応は別途1〜3時間の暫定見積もり（確信度：低）で、所有者判断に依存する。外部承認の待ち時間はこれらに含めない。

## 完成した隔離ハーネス

責務を分けた4モジュールを追加した。`awareness-trial-candidate.ts` は固定候補のスキーマとダイジェストを検証する。`awareness-trial-seed.ts` は現在の v3 世代writerで固定アセットを登録する。`awareness-trial-execution.ts` は既存の試合進行と実況workerを呼び、状態・利用量を読戻す。`run-awareness-trial.ts` はDB関連importの前に保存先を固定し、検証と送信の入口を分ける。

上位入力は、この資料の固定候補とユーザーの隔離ハーネス準備承認。基本設計は通常DBと分離した一試合の既存パイプライン接続、詳細設計は新規ディレクトリ、固定ダイジェスト、v3 writer、3 tick停止、並行実況と期限付きdrain。公開API・製品の試合進行契約・旧切替契約は変更していない。

引数なし、または `--validate` は通信を禁止してアセット登録と読戻しを行う。毎回新規の `/tmp/kshiai-awareness-offline-trial-*` を作る。親プロセスに本番DATABASE_URLや通常DATABASE_PATHがあっても両方を隔離先へ上書きしてからDBを読み込む。

```sh
/home/katsumata-m/.nvm/versions/node/v22.22.3/bin/node --import tsx \
  backend/src/scripts/run-awareness-trial.ts --validate
```

承認済みの有料実行では以下を1回だけ実行した。新規の `/tmp/kshiai-awareness-paid-trial-39Fhzu` に限定し、DBとローカル観測資料を残した。既存試行の再開・再送はしていない。明示した `--execute` がない場合、モデルへ送信しない。以下は実施記録であり、再実行の承認ではない。

```sh
secdat --dir /home/katsumata-m/kshiai exec \
  --inject secret:only=OPENAI_API_KEY --inject secret:only=XAI_API_KEY \
  --inject secret:require=OPENAI_API_KEY --inject secret:require=XAI_API_KEY \
  --inject route:prefer=secret \
  --inject final:require=OPENAI_API_KEY --inject final:require=XAI_API_KEY -- \
  /home/katsumata-m/.nvm/versions/node/v22.22.3/bin/node --import tsx \
  backend/src/scripts/run-awareness-trial.ts --execute
```

`candidate.json`、`asset-generations.json`、`snapshots.json`、`readback.json` と `trial.db` が読戻し資料になる。各tickの正準状態・意識状態・receipt、全物理試行の利用量と時間、公開実況eventと未完実況を記録する。既送信処理は試合の既存期限内かつ停止後最大36秒で回収し、未解決の物理reservation、未合流job、利用量不明、料金不明をそれぞれ残す。費用不明だけで失敗にせず、通信未解決・未完実況・3 tick未到達などは非成功の終了コードにする。実況失敗後は追加tickを進めない。未合流jobを適用するために追加tickを送らない。

独立した読取レビューで、DB指定前import、通常v3 writer、既定の無送信、固定モデル割当、未解決処理の記録を確認した。指摘された実況失敗後の継続と未解決slotの見落としは修正済み。テスト用HTTP応答に置き換えた統合テスト5件が成功した。正常系は3 tick・実況完了・利用量保存・Luna reasoning noneを確認し、失敗系は遭遇生成と実況失敗の停止／読戻しを確認した。テストの呼出し数やトークン量は合成値であり、実モデルの実績や料金見積もりとして使わない。

最終検証：追加ハーネスの直接テスト5件成功、全ワークスペース型チェック成功、全体ビルド成功。`npm test` は163件成功・2件失敗。失敗は前回と同じ `routes-cutover-confirm.test.ts` と `cutover-trial-dispatch.test.ts` の保留中契約に関する箇所で、旧試行が新規試合に試合束縛形式 v4を要求するため現在の v5作成と衝突する。今回その契約・テストを変更していない。既存の通常テスト選択では新ハーネステストを含まないため、5件は直接実行した。

`real-model-trial-harness` の測定は17:49:57〜18:05:22 JST、連続925秒、主担当0.256944人時。PERTの開始・完了に記録し、document check・両schedule分析・nextが成功した。observe-velocityはこの開始イベントもmissing_baselineとして除外したため、採用可能な速度はない。次回の有料実行着手前に履歴基準値の適用経路を確認し、実行・読戻しの開始／完了を測定する。今回の時間には測定開始前の調査と並行した独立レビューの人時を含めない。

## 実モデル試行の結果

2026-10-05 18:35 JSTに承認済み候補を1回実行した。最初の遭遇生成（xAI、requested model `grok-4.5`、role `creation`）がローカルの約10秒期限でtimeoutとなった。台帳のelapsedMsは **10027.714332 ms**。SDK再送、別モデルへのフォールバック、試行全体の再実行はない。

物理呼出しは1件、試合件数0、戦闘tick0、実況entry0。潜在意識・顕在意識・裁定の戦闘処理・実況の呼出しには到達していない。起動時の `ready` ログはモデルが応答可能である証拠ではない。

実利用トークン（入力・出力・合計・cache・reasoning）、response model、request ID、rawUsageはすべて `null`。プロバイダの返答に利用量がないため、消費量・実費・プロバイダ側で処理が継続したかは不明である。料金集計の既知小計0はunknown1件を併記する値で、無料や消費0を意味しない。

試合作成前の `battle_awareness_creation` には status `failed`、reservation status `unknown`、`physicalOutstanding=true` が保守的に残っている。ハーネスの `unresolvedAttemptCount=0` は試合作成前の予約を含まないため、このケースの完全な未解決件数として使えない。別途SQLiteをread-onlyで読戻し、この予約1件を観測資料へ追記した。試合作成前の予約をハーネス集計へ含める修正は次の改善候補であり、今回のモデル送信失敗の原因を示すものではない。

保存証拠は `docs/evidence/awareness-real-trial-observation-2026-10-05.json`。隔離DBのread-only確認と利用量CLIの独立集計は同じ1件のtimeoutを示し、独立レビューでも一致した。試行後のAPI rootへの無認証GETは404を0.173165秒で返した。この観測はその時点の通信経路到達性だけを示し、認証・生成モデル利用可否・timeout原因を確定しない。

この一試行と読戻しタスクの残作業は0。3 tickの意識・実況・経済性の実証は未達であり、今回得られたのは失敗時にも利用量不明を記録できる実送信の観測である。推奨する次の作業は、遭遇生成の入力・10秒期限・モデルオプションと、試合作成前の予約の集計範囲を点検し、修正と再試行の候補を準備すること。内部作業0.5〜1時間の暫定見積もり（確信度：低、主担当1人・追加モデル送信を含めない）。モデル／期限の変更は上位契約で判断し、次の有料送信には別の具体的な承認を得る。旧切替契約の保留は維持する。

`real-model-trial-observation` の測定は18:35:16〜18:40:24 JST、連続308秒、主担当0.085556人時（送信待ちと読戻しを含み、独立レビューの人時は含めない）。PERTで一試行と読戻しを完了し、document check・両schedule分析・nextが成功した。observe-velocityは今回もmissing_baselineによりこの開始イベントを除外し、採用可能な速度はない。次の修正候補準備に着手する時点で履歴基準の適用経路と新しい測定区間を確認する。実モデル3 tick検証を完了扱いにはしていない。

## 同一候補の承認済みリトライ

ユーザーの「リトライしてみましょう」で同一候補の追加1回を承認され、新規 `/tmp/kshiai-awareness-paid-trial-Im7qfS` に実行した。モデル、期限、入力を変更していない。遭遇生成は約7.1秒で成功し、実入力1107、completion146、reasoning477、total1730トークンが返った。今回のxAI実応答では total = prompt + completion + reasoning であり、rawUsageをそのまま保存した。キャッシュ入力1024は入力1107の内数である。

その後、潜在側gpt-6-lunaの2件が約5秒でtimeout。顕在側grok-4.5は1件が完了（入力2891、completion213、reasoning660、total3764）、1件はtimeoutとなった。試合は `incomplete`、理由 `AWARENESS_WAIT_DEADLINE`。prologue段階で停止して戦闘tick0、実況なし。追加advanceやさらなるリトライはしていない。

全物理試行は5件。取得できた2件の既知小計は入力3998、completion359、reasoning1137、total5494。残り3件の利用量は不明なので試行全体の消費トークン数ではない。未知reservationのphysicalOutstanding4件も保持している。料金表を適用しておらず、rawUsage内のcost_in_usd_ticksも単位を未検証のまま保存したため実費は未確定。証拠は `docs/evidence/awareness-real-trial-retry-2026-10-05.json`。

承認されたリトライ1回と読戻しは完了。3 tick検証は未達のまま。次の候補準備では、潜在5秒／顕在15秒の待機と合流期限、実プロバイダでのモデル利用可否、xAIのreasoningとcompletionの計上方式を確認する。変更・有料再実行は別の具体的な判断とする。内部の調査・候補準備は0.5〜1時間の暫定見積もり（確信度低、追加送信なし）。

## 所有者指示による長い待機期限の計測

ユーザーの「タイムアウトをかなり延ばして実測しなおしましょう」により、[ADR0052](adr/0052-isolated-long-timeout-measurement.md)の新しい試行用ポリシー `awareness-v5-measurement-v1` を追加した。潜在60秒、顕在90秒、遭遇生成・裁定60秒、実況60秒、全体600秒、実況公開180秒、終端待機90秒。通常試合の期限は変更していない。モデル、固定キャラ、入力、出力上限、物理試行200回、並列6、再送なし、3 tick停止は維持する。

実行入口は `run-awareness-trial.ts --execute --long-timeouts`、オフライン確認は `--validate --long-timeouts`。固定入力候補のdigestは従前と同じだが、時間条件の差は別の `measurement-policy.json` と保存されたcreation／manifest／runtimeで識別する。`input-sizes.jsonl` は実際の送信本文からモデル・役割・side・tick・文字数・UTF-8サイズ・出力上限・reasoning指定だけを保存し、本文と資格情報は保存しない。

基本設計は通常ポリシーと試行ポリシーを分離する。詳細設計は共有schemaでrevisionと各期限を厳密に対応させ、同一policyをrequest preparation、SDK、proof生成、creation、runtime、実況へ渡す。既存defaultと既存試合の時間条件は維持する。役割SDK33件、実況／queue22件、統合・policy・状態遷移など36件、合計91件の直接テストが成功。独立レビューで期限の固定箇所が残っていないことと通常defaultの維持を確認した。全体テストの既存2件の保留契約不一致は継続している。

### 長時間設定での実測結果（2026-10-05 19:34 JST）

`--execute --long-timeouts` を一度実行。scratch は `/tmp/kshiai-awareness-paid-trial-CE2prP`。詳細は [実測証跡](evidence/awareness-long-timeout-measurement-2026-10-05.json)。全5件のSDK応答は completed、timeoutとusage欠落は0件。試合は incomplete、戦闘0tick、実況送信0件。トップレベル errorClass=null は試合成功を意味しない。

|役割|入力文字数（system+user）|入力token|出力token|推論token|usage台帳のelapsed秒|
|---|---:|---:|---:|---:|---:|
|遭遇生成 Grok|1,751|1,107|130|448|7.016|
|顕在A Grok|5,650|2,878|183|1,031|25.790|
|顕在B Grok|5,658|2,891|220|789|20.258|
|潜在A Luna none|6,119|3,092|463|0|7.312|
|潜在B Luna none|6,127|3,108|96|0|3.823|

入力文字数は実際のfetch送信のmessages文字列をUnicode文字数として測定し、prompt本文を保存していない。時間はusage台帳のelapsedMsを採用。SDKのconsoleログでは顕在A23.543秒/B18.010秒となり、計測箇所の異なる値も証跡に残す。Grokは返却totalがprompt+completion+reasoning、Lunaはprompt+completion。全件合計は入力13,076、completion1,092、reasoning2,268、total16,436、cached1,792。単価表なしのため金額は未算定、knownSubtotalUsd=0を無料と解釈しない。

停止理由としてruntimeに `reflexDesires[0].action` がobject契約に対してstringだったschema拒否が記録された。生成全文は保存しておらず、生成がこの形になった原因は未確定。さらにSDK台帳は全件completedだがruntimeの潜在2件・顕在2件のphysicalOutstanding予約が4件残り、顕在jobはcancelled/outstanding。独立したSQLite mode=ro読戻しで同じ状態を確認した。180秒の回収期限終了後も残っており、外部処理が継続中と断定しない。

通常ポリシーと既存試合は変更していない。本実測の残作業は0。次の候補は出力契約の伝達とschema拒否後の予約精算経路の調査・修正・オフライン検証で、内部工数1〜3時間（エージェント暫定見積もり、確信度低）。完成条件は実際のaction構造契約に適合する出力の受理、成功/形式拒否/timeout各経路でSDKと予約会計の整合確認。次の有料試行は今回実行していない。親の `awareness-verify` は完了扱いにしない。

検証は関連91件成功、全体typecheckとbuild成功。全体テストは163成功・既存の保留中の切替契約2件失敗。buildのfrontend bundle-size警告は残る。実測の観測・次候補は `llmthink dsl audit` でfatal/error/warning各0、原因の未確定を維持した。

入力の経済性に関する追加観測：潜在側のpolicyに記されたinputTokens=1,800に対し、実際のprovider prompt_tokensは3,092／3,108だった。設定値を実際の消費上限として説明できない。次の調査では入力の見積り・実際の送信内容・provider tokenizerの差を区別する。今回の観測だけで原因を断定しない。

PERT `long-timeout-measurement` を19:35:17 JSTに完了。計測区間は19:19:46〜19:35:17（15分31秒、0.258611人時。区間前の準備と別agentの工数は除外）。document check / dependency-resource schedule both / nextを再確認した。observe-velocityも実行したが、未コミットtaskのGit履歴baselineがないため利用可能な速度は得られない。履歴同期が認可された次のチェックポイントで再観測し、今回の値を受理済み速度とは扱わない。
