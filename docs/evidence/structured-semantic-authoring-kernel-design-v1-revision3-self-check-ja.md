# 実装設計候補v1 revision 3 自己整合性確認

- 対象: `docs/structured-semantic-authoring-kernel-implementation-design-v1.md`
- 対象SHA-256: `49181675114f6ced237ced68a335aa1e1edbb0eaa788379f0d6c09dc36a3e6f1`
- 判定: ADR-0032で特定した時間境界の不整合4点を訂正済み
- ライフサイクル: 独立再レビュー待ち、未受理

## 確認結果

- attempt全体240秒とprovider 60秒の値を現行設計から削除した。
- attempt全体のelapsed残量による予約・意味的終了を削除した。
- provider transport、worker lease、意味的無進捗・循環、累積資源を別の制御として定義した。
- provider timeoutはtransport outcome、worker lease expiryは回復可能な技術outcomeであり、
  どちらも意味failureではない。
- call、step、token、byte、cost、進捗履歴、回復strategyの上限と単調会計を維持した。
- 正確なprovider timeout、worker lease、transport recovery許可値はADR-0032の証拠と
  exact owner acceptanceが揃うまで未決のままにした。
- 全文日本語投影にも同じ訂正と権限境界を反映した。

## 残る境界

現行runtime WIPには、まだ`maxAttemptElapsedMs: 240_000`、
`maxProviderCallElapsedMs: 60_000`、attempt elapsed admission、whole-attempt terminationが
残っている。revision 3は実装を認可しないため、この自己確認ではruntimeを変更していない。

この記録は自己整合性確認であり、独立レビューまたはowner acceptanceの代替ではない。
したがって`cc304`はsuspendedのままとする。
