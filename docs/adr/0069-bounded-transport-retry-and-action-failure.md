# ADR-0069: 有界な429再試行と本人への行為失敗フィードバック

- Status: Accepted
- Revision: 1
- Date: 2026-10-10
- Decision owner: Product owner
- Related: ADR0067 revision2、ADR0051、docs/unified-consciousness.pert、PR #176

## Context

アプリケーション v0.24.0-rc.2のStage38042991400は候補外行為で停止し、別にxAIの容量不足HTTP429も受けた。所有者は「レート制限のリトライを考慮、アダプタ層…候補外は、理由をフィードバックして行動失敗…修正、テスト、デプロイ、ステージング実行までを許可」と指示した。

## Decision drivers

- 一時的なprovider拒否を有限の同provider再試行で吸収する。
- 本人の行為選択の誤りを世界の成功や技術障害へ変換しない。
- 不変binding、全physical attemptの会計、期限と上限、本人間privacyを保つ。

## Considered options

1. 現契約の全不正返答即停止とretry0を維持。今回のowner方向と異なる。
2. 無制限再送・不正行為の自動置換。料金・世界の正当性を失う。
3. 新policyだけ有限の429再試行と不実行の本人feedback。選択する。

## Decision

新規公開試合へ意識運用ポリシー unified-consciousness-policy-v2を束縛する。ADR0067 revision2のC5/C6におけるtransport retry0と行為候補・参照違反の技術終了のみを置換する。その他の記憶、同期A/B、world commit、privacy、有限上限は引き継ぐ。

アダプタで同provider/modelの明確なHTTP429応答だけ最大2回追加送信する。billing/quota不足、通信結果不明、timeout、JSON/schema不正、出力受信後の不正内容は再送しない。Retry-Afterを尊重し、無指定時は1秒、2秒のbackoff。待機を含め元のcall deadlineと試合deadlineを越えない。SDK自動retryは0を保持する。各physical再試行を送信前に永続予約し、既存provider attempt/usage台帳へ別attemptとして記録する。200attempt・同時6の上限を引き上げない。旧policyはretry0を保持する。

構造的に正しい意識応答のactionが候補外・未知参照なら、その行為だけ実行しない。元の試みと短い失敗理由をprivate prepared decisionへ保持し、同一world transactionで本人の次入力用eventへ一回追加する。合法なspeechとmemoryOperationsは通常どおり適用する。対戦相手や公開DTOに失敗理由・記憶を漏らさない。候補行為への自動置換や同tickのLLM修復はしない。JSON/schema不正、記憶操作不正、期限切れ、未知送信は従来どおり技術終了。

## Consequences

### Positive

- 429に対する短い待機を一箇所へ集約する。行為選択の失敗を次の本人判断へ渡せる。

### Negative and risks

- 再試行の待機・attempt・料金が増え得る。長期容量不足は依然失敗する。
- モデル品質改善・料金削減は未認定。失敗行為が繰り返され得る。

## Compatibility and migration

新policy v2を新規試合だけに束縛する。既存policy v1、旧意識パイプライン awareness-v5、過去の失敗試験は保持。prepared decisionへ任意のprivate actionFailureを追加し、旧保存データを読める。DB migration/public API変更は不要。失敗候補のタグは移動せず修正候補アプリケーション v0.24.0-rc.3を作る。

## Verification

429→成功、上限、Retry-After/期限、billing429・timeout・JSON不正非再送、各physical予約/利用計上、旧policy非再試行、候補外/未知参照の不実行・本人feedback一回・speech/記憶維持・不正記憶即停止・rollback/replay/privacyをoffline検証する。公式test/typecheck/必須CI、同一成果物のStage、本番readbackを必要とする。

## Implementation references

- canonical PERT: docs/unified-consciousness.pert。
- Ownerの今回の実行許可で修正と1追加Stage対戦を行う。既提示の上限38 advance/200physical attempts、character-createなし、無断の新規対戦再実行なしを維持する。価格はunpriced。
