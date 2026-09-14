# Compact V2 引継ぎ — 2026-09-08

## 終了地点

ユーザーは実provider検証を「明日にしましょう」と延期し、引継資料、
WIPコミット、pushによる終了を指示した。**有料APIへの送信は0件**。
今回の検証による利用トークン・課金は発生していない。
準備用のread-only GitHub照会と公式料金ページ確認のみ実施した。
自動実行・予約・デプロイは設定していない。

## 正確な再開場所と保存対象

- 主リポジトリ: `/home/katsumata-m/kshiai`
- 作業ワークツリー:
  `/home/katsumata-m/.codex/worktrees/monotony-log-rca-kshiai`
- ブランチ: `codex/monotony-log-rca`
- 検証対象実装: `f1ff97735e7bfd42be4c21a0e421bec334052005`
- 要件v3受入記録: `cef5a75`
- ADR・設計の先行コミット: `1dd12c0`
- 直近のGitHub main照会:
  `1cdf21009dbb8f4099dbb9ca70760320c50be6aa`
- 実装HEADとmainは実装側15、main側4の固有コミットがある。
  今回は実装コミットを直接検証する準備であり、main統合はしていない。
- push前、GitHubに同名ブランチは存在しなかった。今回のWIPコミットと
  先行するローカル実装履歴を同名ブランチへ保存する。
- 本資料を含むWIPコミットのSHAは、当該ブランチのログとサーバー読み戻しで
  確認する。資料内に自分自身のコミットSHAは埋め込まない。

主リポジトリには別作業の未コミット変更がある。今回の保存対象へ混ぜない。
旧 `dialogue-expression-realization-requirement-review-input-v2.md` は、
履歴資料である旨を明記してWIP保存する。内容を現行要件として採用しない。

## 承認済みの機能契約

正本はADR-0024と要件v3。要件候補の本文はdigestを保ち、
受入事実は[acceptance-v3](../dialogue-expression-realization-requirement-acceptance-v3.md)
に別記している。候補本文冒頭のowner-review-pendingだけで未承認と判断しない。

- `expressionState`: 現在の意味状態。
- `utteranceHistory`: 観測者に許された完了発話実績。
- `nextUtterance`: 今回の発話出力。
- 同じセリフも正常な新しい発話として通常経路で採用する。
  本文比較、類似度判定、反復禁止、意図判定器は追加しない。
- 機械的な二重commit防止は既存Battle revisionの比較保存に任せる。
  新たな機会・receipt・provider操作ID・発話ID・再利用台帳は作らない。
- V2では `lastSpeech` を意味状態入力にも採用後の新規書込みにも使わない。
- immutable dialogue snapshotの `schemaVersion: 1` は従来契約、
  `schemaVersion: 2` かつCompactは新契約。既存Battleを読み替えない。
- 管理者設定の通常更新がV2を作る実装になっている。
  コード配備だけでは既存設定・既存BattleがV2になるとは限らない。
  後続の環境検証では実際のBattle snapshotを確認する。

## 実装・ローカル検証の到達点

`f1ff977` はshared snapshot/schemaのV1/V2分岐、backend input/result型、
battle-service投影・採用、実provider・mock、出力decoderと回帰テストを含む。
V2の行動候補がschema不正でも、発話を独立採用し行動だけに
`schema_invalid` を残す。

前の実装フェーズで以下が成功したことを、このタスクの実行出力で確認済み。

- `npm run typecheck`
- `npm test`: shared 305、backend 298、frontend 20、deployment 3件
- `npm run build`: 既存のVite chunk size warningあり
- CLI LLMThink audit: fatal/error/warning 0
- PERT check: errors 0。完了milestoneの履歴整理を促すPTDAG-208 warningのみ

これらは実LLMの入力解釈、長期の会話品質改善、Stage/本番でのV2有効化を
証明していない。実providerへの検証ハーネスは**まだ作成していない**。
今回の追加は引継資料と検証準備の推論記録だけ。

## 実provider検証の準備内容

ユーザーは説明された有料API検証の実施を承認済み。その後、実施日を翌日に
延期した。下記はその範囲内で今回整理した小規模実行案で、
まだリクエスト群や実行ハーネスを固定した状態ではない。

- 合成キャラ2例: 通常キャラ、同じセリフを繰り返す設定のキャラ。
- 各3ターン、deep psycheとexpression各1回、合計最大12物理リクエスト。
- xAI `grok-4.3`、Chat Completions、reasoning `none`。
  ソースのDEFAULT_XAI_FAST_MODELも `grok-4.3`。
- 温度は実装どおりdeep psyche 0.5 / expression 0.65。
- 1リクエストの入力UTF-8 bytes上限20,000、framing余裕1,024 tokens。
  出力上限はpsyche 1,200 / expression 400 tokens。
- 累積予約費用上限USD 0.50、入力出力の累積予約上限300,000 tokens。
  送信前に保守的な入力・出力最大費用を予約する。
- 直列実行。元の段階別timeout。再試行・失敗分の追加生成・judgeなし。
- 通信失敗、decode失敗、実モデル相違、usage欠落、
  アプリ側フォールバック発生で停止し証跡を残す。
- 本文が同じこと自体を失敗条件にしない。

料金は2026-09-08に[公式Grok 4.3資料](https://docs.x.ai/developers/models/grok-4.3)
でinput USD 1.25 / output USD 2.50 per million tokensを確認。
費用計算はcached-input割引を見込まない。翌日の送信前に有効性を確認する。

既存 `replay-character-focus-ablation.ts` は旧V1・144論理呼出しの別実験なので
そのまま実行しない。再利用できるのは証跡保全・費用計算などの限定部分。

実装案は `OpenAiCompatibleProvider` のprotected `chatJson` を
検証専用subclassで上書きして送信上限と証跡を付けるもの。
親クラスの実プロンプト構築・decoderと、
`advanceCharacterAgents` の実投影・採用を使う。
この変更はテストの通信制約であり、配備される通信処理そのものの検証とは
区別して報告する。合成Battleはメモリ内で処理し実DBへ保存しない。

## 翌日の再開手順

1. このワークツリー・ブランチ・WIP HEADを再確認し、`worktimectl agent` で
   当日の作業時間状態を読む。9月8日の23:30を翌日に流用しない。
2. 要件v3、受入sidecar、本資料と
   [準備推論](compact-v2-provider-replay-2026-09-08.think)を確認する。
3. ハーネスと合成fixtureを作り、通信しない準備モードで
   実装V2経路・上限計算・証跡保存・停止条件を確認する。
   継続履歴には実際に採用されたcanonical発話を渡す。
4. CLI LLMThinkで具体化した実行判断を再監査する。
   現行の承認範囲を保ち、通常キャラと反復キャラを実providerで検証する。
5. 生の合成入力・応答、実モデル、usage、回数、予約費用とusage由来費用、
   採用結果、失敗・未確認点を保存する。少数例の成功を
   会話品質改善の統計的証明やリリース完了に読み替えない。
6. [PERT](../dialogue-expression-realization.pert)へ実態を反映する。
   現在はt001/t002/t003 done、t004以降未完了。
   t004は具体的な実行対象・上限の固定、t005が実provider検証。
   Stage・本番の段階は各環境を対象にした指示と実動作確認が必要。

## 認証・同期

- 主ワークツリーのsecdat domain:
  `/home/katsumata-m/kshiai`
- GitHubは `GH_TOKEN`、実providerは `XAI_API_KEY` の存在と
  secret由来の環境注入をdry-runで確認済み。値は表示・保存していない。
- linked worktree独自のcredential storeは作らない。
- GitHubのremote操作は主domainの `secdat exec` 経由。
  HTTPS Gitのcredential helperは今回のpushコマンド内でのみ
  `gh auth git-credential` を指定する。永続Git設定は変更しない。
- WIP push後はGitHub側ref SHAとlocal HEADを独立して照合する。
- 今回の終了はこのタスクの引継ぎ。共有作業日のend記録は変更しない。
