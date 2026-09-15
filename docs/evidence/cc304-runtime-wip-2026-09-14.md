# cc304 — 共通実行経路の接続 WIP（2026-09-14）

2026-09-15 回復後の追記: 最新状態は `cc304-recovery-2026-09-15.md`。
以下の当日記録のうち、source ledger と V2 baseline の未実装事項はその記録で更新する。

## 状態

**未完了。共通基盤、cc304、V3 authoring の完了・受入・配備を意味しない。**

ユーザーの「直せ」に対するローカル実装。作業ブランチは
`codex/compact-psyche-repair-integration`、開始 HEAD は
`ea8a24fab989d2064e88b8b3fe67072839790854`。この記録時点では未コミット。
PERT の cc304 は active。後続の評価・配備・移行・最終成果の受入を進めていない。
テストを増やしたことではなく、実際の呼出し経路と残った機能で進捗を区別する。

## 接続したコード

1. `createLlmProvider` の明示設定から、新しい HTTP transport を選択できる。
2. 新規作成 API が、既存の owner command / family queue と同じトランザクションで
   common run と frozen source を登録する。
3. ローカル worker と Cloud Tasks worker の両方が character application service を呼び、
   generic execution driver、既存 kernel、focused projector を実行する。
4. HTTP 送信前に予約を DB に記録。結果受領時に所有権を確認してから提案を適用する。
   不正 JSON / schema は同じ focused work の有界回復に戻す。
5. provider usage を検証して精算。欠落・不正な usage は最大予約を保持する。
   HTTP body の byte limit と model message の one-token-per-byte 上限を別々に扱う。
6. common terminal receipt と family result / queue 完了を同じトランザクションで保存する。
   送信前の source / pointer / provider 不整合も、両方の lifecycle に失敗を保存する。
7. owner review API と画面で、保存済みの構造化候補と元の構造との差を表示する。
   **これは意味差分の完成版ではない。意味・公開検証と最終採用が未完了と明示し、
   採用ボタンは出さず、既存の採用 API もこの未認定候補を受け付けない。**
8. `POST /api/authoring/attempts/:attemptId/retries` と画面の再試行ボタンを接続。
   failed source から別 attempt / run を生成し、predecessor と command identity を残す。
   同一 command の再送は同じ attempt を返す。質問状態への retry は許可しない。

既存 V2 の parser / repair WIP は修正していない。runtime の接続先を新しい基盤にした。
common kernel に character の意味や field path は追加していない。

## 起動設定の境界

既定は無効。環境変数・秘密情報・本番 policy は変更していない。
この WIP を本番で有効にしてはいけない。cc304 の残作業と後続の評価・配備が先である。

明示選択用のキーは次のとおり。値の決定、秘密情報設定、実 provider 呼出しを
この記録は許可しない。

- `SEMANTIC_AUTHORING_POLICY=semantic_authoring_policy_v1`
- `SEMANTIC_AUTHORING_ENDPOINT`, `SEMANTIC_AUTHORING_MODEL`
- `SEMANTIC_AUTHORING_API_KEY`, `SEMANTIC_AUTHORING_PRICING_IDENTITY`
- `SEMANTIC_AUTHORING_INPUT_MICRO_USD_PER_TOKEN`
- `SEMANTIC_AUTHORING_OUTPUT_MICRO_USD_PER_TOKEN`

SQL migration `0026_character_focused_authoring_payloads.sql` は追加のみ。
Postgres、Stage、本番には適用していない。Stage と本番の共有構成も変更していない。

## 未実装・未確認（完了扱い禁止）

- 改訂の自然文から修正範囲を解決し、既存 API/UI から common run に接続する部分。
  現在の改訂確認は、明示された cluster と実際の不変 V3 元世代を持つ queue command から。
- V2→V3 移行 entrypoint の接続と、元情報の全量照合・preservation。
  adapter の V2 baseline は actionNorms を取り除き、source-disposition は
  一件でもあれば済んだことにしている。移行完了の根拠に使えない。
- protected anchor / preference / creative space の記録と、必要項目全体の義務生成。
  現在の character adapter の義務は限定的である。
- source-consistency / disclosure / authority の実検証。
  現在の lens は名前・外見の非空等の限定的判定であり、意味・公開安全性の証明ではない。
- 実際の質問生成、owner answer API/UI、回答の凍結と新 attempt への自動再開。
  character adapter の `assessQuestion` / `applyAnswer` は依然として未実装相当。
  generic result から durable port へ五条件 evidence を渡す配線だけでは Q&A 完了ではない。
- 最終候補の provenance / source disposition / compiler / disclosure を伴う
  V3 envelope の作成、意味差分、独立した最終受入・append/CAS。
- domain adapter の progress digest は限定された field / ID のみを見る。
- shared source-disposition ledger は先行 batch を保持し、adapter finalization と
  terminal JSON に渡す修正まで当日保存済み。翌日の再実行でも確認。
- 大きい既存 cluster の分解。単純な新規入力が収まることを、
  大きい改訂・移行が収まる証明にしてはいけない。
- 想定外の DB 障害、process loss、queue fence の並行ケースの結合確認。
  common repository の部品検証を family 実経路の全障害対応に読み替えない。
- 実 provider / 実 model の成立性、収束率、R20、Postgres での結合動作。

次の再開点はこれらを character adapter と利用経路で埋めること。
旧 V2 の局所 parser 修正や corpus PASS の追記へ戻らない。

## 確認結果と限界

- `npm run typecheck`: 成功。
- `npm run build`: 成功。frontend の既存 chunk-size warning あり。
- common kernel / durable ports / adapter の指定テスト: 83 件成功。
- 実 owner API・実 worker・ローカル HTTP・一時 SQLite を通る結合確認: 5 件成功。
  新規作成、上限内の最後の応答、malformed output 回復、改訂元・指示の保持、
  terminal replay、元情報からの retry、採用拒否、送信前の source drift の終端保存を確認。
- 全体 `npm test`: shared 349/349、backend 458/459、frontend 20/20。
  既存の `provider-json.test.ts` に `PROVIDER_OPERATION_UNCLASSIFIED` による
  1 件の失敗が残る。全体成功とはしていない。deployment/release テストは
  npm test の先行失敗で未実行。今回の単純作成 fixture の初期失敗は解消済み。
- GUI は controlled API fixture を使う独立した表示・操作確認で 2 件成功。
  既存 Chromium 1234 を `E2E_CHROMIUM_EXECUTABLE` で指定した。追加 install はしていない。
  GUI の成功を、実 model を含む全経路 E2E の証明にしてはいけない。
- reasoning: `cc304-runtime-implementation-2026-09-14.think`。
  CLI audit は fatal/error/warning 0。実 model 等の未確認事項は retained pending。
  agent 行動が反復した根本原因を解明・是正したという主張はしていない。

## 保持した既存 WIP

開始時から存在し、今回変更していないもの:

- `backend/src/llm/openai-compatible.ts`
- `backend/src/llm/openai-compatible-character-definition.test.ts`
- `backend/src/services/character-authoring-jobs.test.ts`
- `backend/src/llm/provider-json.ts`
- `backend/src/llm/provider-json.test.ts`

広い `git add` でこれらを今回の共通基盤修正に混ぜない。
このターンでは push、merge、release、デプロイ、実課金 provider 呼出し、
current pointer / 本番 policy の変更は行っていない。
