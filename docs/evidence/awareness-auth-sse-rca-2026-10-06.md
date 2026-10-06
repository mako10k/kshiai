# rc.5認証SSE検査の修正

## 観測と原因

[Stage37317011221](https://github.com/mako10k/kshiai/actions/runs/37317011221)（`v0.23.0-rc.5`, source `69e0eaf`）はAPI起動・receipt/accounting/OIDC・Worker upload・edge/origin確認を通過し、認証SSE工程で失敗した。Cloud Runジョブ `kshiai-auth-smoke-jwhv4` は `Authenticated SSE smoke failed: 404: {"error":"not_found"}` を記録した。前件のV2 generation準備とは別の不整合であり、有料試合工程は未実行、公開promotionも未実行である。

検査は存在しない試合に対してSSE開始とBATTLE_NOT_FOUNDイベントを期待していた。実装は現在、試合存在・所有者アクセスをSSE開始前に確認し、存在しなければ404 JSONを返す。Accepted ADR0039のアクセス境界を維持している。検査の入力・期待値がこの境界と一致せず、404を検査失敗にしていた。SSE検査を無効化したり404をSSE成功と見なしたりしない。

## 修正と検証の意味

`authenticated-sse-smoke.ts` が一時的な終了済み試合を共有の型付きconstructorで構築し、schema検査を行う通常repositoryへ挿入する。試合IDはUUIDで一意にし、created結果を確認したものだけを使用・削除する。既存の一時キャラクターと認証済み所有者に紐付ける。actual advance SSE endpointはアクセス検査を通過してstream-openを送り、BATTLE_FINISHEDを返す。この経路はモデル処理へ到達しない。終了時に同試合のidempotency・lease・battleだけを削除する。

旧データ準備・認証全体とSSE transportの責務をモジュールで分離した。製品のroute、アクセス拒否、旧キャラクター通常writer、公開試合のawareness-v5作成規則は変更していない。SSE用の一時終了fixtureは公開機能の代用品でも正常完走の証拠でもなく、実認証・Worker経由transportの検査入力である。別工程の実モデル完走試験は引き続き必須。

実際のHono routesを通した回帰で、missing404・他ユーザー403・所有者のSSE error、Bearer/origin headerの受渡し、provider呼出し0、fixtureとguard削除を確認した。transport失敗とJSON応答も削除され、JSONはSSE成功として受理されない。関連18件成功、全体201件・awareness278件・typecheck・static成功。新規SSE suiteをawareness CIへ加えた。独立のread-only reviewで責務・型・cleanup scope・保護境界を確認した。

判断は同名.thinkをCLI llmthinkで監査し、fatal/error/warningは0。現在のphaseはaccepted出力・アクセス契約内の検査実装修正であり、新たな公開契約の決定を行わない。

## 残る確認

新規PRの必須CIとmain CI後、固定済みrc.5を移動せず新規rc.6で公式Stageを実行する。Stage成功の同一revision/digest/Worker versionだけを公開へ反映し、公開試合の正常完走・実況完了・実利用トークンを確認する。公開完走条件を満たすまでprompt固定条件の成立を宣言しない。旧V3切替試行の保留は維持する。

正式PERTは既存planの検査とobserve-velocityを再実施した。所有者が今回のtask追加を明示承認した後、CLIのactor/owner確認とdigest検査を通して `awareness-auth-sse-repair` を追加した。観測開始2026-10-06 08:57:46 JST、offline検証完了09:04:25 JST、イベント由来active399秒、主担当effortは小数2桁に丸め0.11phとして記録した。開始を別commitの基準として記録し、完了後velocityを再観測する。旧保留taskとpublicの依存は変更していない。暫定残内部作業45〜90分、低確信度、CI/cloud/model待機別枠。
