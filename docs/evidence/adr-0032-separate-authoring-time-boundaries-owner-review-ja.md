# ADR-0032「意味オーサリングの時間境界を分離する」全文日本語レビュー資料

- 状態: Proposed
- Revision: 1
- 日付: 2026-09-15
- 決定者: 製品オーナー
- 正本: `docs/adr/0032-separate-authoring-time-boundaries.think`
- 対象範囲: ADR-0032 revision 1全文

## 目的と背景

ADR-0031は有限の実行制御を要求しているが、具体的な数値policyは別途受理される後継判断へ残している。D11設計revision 2は、最大8 provider call、1 call 60秒、1 attempt 240秒を提案した。

現在のWIPは、意味上の作業が進展していてもattempt開始から240秒で終了し、provider応答が60秒を超えた場合は1回の通信だけでrun全体を終了する。

最大条件も合成できていない。60秒のcallを8回実行すると、ローカル処理を除いても480秒必要になる。対象providerの遅延分布、通常のfocused call数、オーナーが許容する待ち時間、hosting platformの期限を裏付けるレビュー済み証拠はない。

## 判断基準

- 費用と反復を有限に制御する。
- 通信期限・worker期限・意味的失敗を混同しない。
- 根拠のない時間値だけで、有用な進捗を捨てない。
- workloadとplatformの証拠なしに別の秒数を発明しない。

## 比較した選択肢

1. 60秒／240秒を維持する。
   - 単純だが、測定根拠がなく、8 call上限とも整合しない。
2. 時間制御をすべて削除する。
   - 早すぎる終了は避けられるが、通信とworkerの有限制御が未定義になる。
3. 時間境界を目的別に分け、具体値は証拠が揃うまで未決にする。
   - policy設計は増えるが、それぞれの失敗を正しい制御で扱える。今回の提案。

## 提案する決定

次の4制御を分離する。

1. provider route固有の通信timeoutは、1回の通信を有限にする。
2. worker実行境界は、1回のworker leaseとfenceを制御する。
3. 意味的な無進捗・状態循環の検出は、推論が膠着したかを判断する。
4. call、step、token、費用の上限は、累積資源消費を有限にする。

固定のattempt全体wall-clockを意味的な終了条件にはしない。意味的に進展している処理を、共通の経過秒数だけで失敗と判定してはならない。

worker期限では新規dispatchを止め、遅延結果をfenceし、回復可能な技術的結果を保存できる。ただし、意味的失敗と記録したり、消費量をresetして黙って再実行したりしない。

provider timeoutは型付きの通信結果として記録し、予約量を消費したものとして扱える。他のcall・token・費用・無進捗・fence制約内に、明示的に受理された限定回復が1回残る場合、1回のtimeoutだけでattempt全体を自動終了しない。

providerとworkerの具体的な時間値は、対象routeとplatform、代表的なfocused requestの測定結果、オーナーに見える待ち時間budgetを定義し、製品オーナーがexact policyを受理するまで未決とする。

## 影響

### 利点

- 根拠のないattempt timerだけで、有用な意味的進捗を捨てなくなる。
- 通信失敗、worker期限、意味的失敗のreceiptを区別できる。
- call、token、費用、無進捗、循環の既存制御は維持できる。

### 負担とリスク

- worker期限からの回復には、永続化とfenceの正確な設計が必要になる。
- 限定的な通信回復1回は、待ち時間と費用を増やす可能性がある。
- exactな時間値が受理されるまで、新policyをdeploymentで選択できない。

## 互換性と権限境界

受理された場合、ADR-0031 D7のうち時間の意味だけを更新する。他のADR-0031契約、既存の本番挙動、保存データは変更しない。

現在の`semantic_authoring_policy_v1`実装は非規範的WIPであり、有効化権限ではない。このProposed ADRだけでは、実装、provider call、deployment、route選択、本番有効化を許可しない。

## 検証

- 代表的なfocused requestを使い、選択したprovider routeを測定する。
- 遅延分布、focused call数、対象platformの期限を記録する。
- 通信timeout、worker期限、遅延結果、限定回復を別々の結果として検証する。
- 意味的に進展している処理が、attempt全体のwall-clockだけで終了しないことを検証する。
- call、token、費用、無進捗、循環の上限が、会計をresetせず、それぞれの失敗条件を終了させることを検証する。

## 実装参照

現在の非規範的WIPは、次のファイルにある。

- `packages/shared/src/semantic-authoring.ts`
- `backend/src/services/semantic-authoring/execution-policy.ts`
- `backend/src/services/semantic-authoring/execution.ts`
- `backend/src/services/semantic-authoring/ports.ts`

このProposed ADRでは、実装、provider call、deployment、有効化を許可しない。

## 未決事項

- 対象provider routeとmodel
- 代表的なfocused requestの遅延分布と通常call数
- オーナーが許容する待ち時間
- hosting platformのworker期限
- provider timeoutとworker期限の具体値
- worker期限後の永続化・再開方式

## レビュー時の判断

- `REVISE`: 提案内容を変更する。
- `REVIEW`: exact revision 1を独立レビューへ進める。
- 質問: 未決事項または影響を追加確認する。
