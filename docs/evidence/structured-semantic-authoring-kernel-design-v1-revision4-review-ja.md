# D11 集中型セマンティック・オーサリング・カーネル設計 v1 Revision 4 — レビュー

- 状態: レビュー完了、`REVISE`
- 日付: 2026-09-15
- 厳密なレビュー対象: DRAFT Seal `7bfc10a07b45…`
- ファイルSHA-256: `559c8bce9165b51a3aa274c701ee17aee3fe97a96652601cb8b2f7fc71537594`
- 範囲: 英語版設計Revision 4全文と、その完全な日本語投影
- 照合した権威: 受入済みADR-0032、共通基盤要件v3 F9/F15、ADR-0031から保持された決定、
  設計自身のbounded-resource規則とclosed transition規則
- 独立性: 現在のCodexタスク内で実施。別主体による独立reviewer要件を満たす証拠ではない
- 対象外: 設計修正、受入、実装、provider呼出、cutover、deployment、本番影響、commit、push

## 結論

P1指摘2件により`REVISE`とする。Revision 4は、以前のtimeout済みrequest終端化、late result拒否、
代替request identityの欠落を解消した。しかし、不成立条件の2経路が矛盾または未定義のため、
実装とfixtureが依拠できる単一の権威ある遷移表にはまだなっていない。

## 指摘

### [P1] 対応するresource-exhaustion outcomeを保持する

470–471行は、累積resource dimensionの枯渇時に、対応するbounded-resource outcomeを返すよう
要求する。一方、542–545行はrecovery admission失敗を`provider_transport_unavailable`へ写す。
2回目のcallがcall数、token、costの枯渇で拒否された場合、停止原因はresource exhaustionであり、
provider unavailableではない。この誤分類は、必須failure receiptとretry診断を弱める。

必要な修正: 元のtimeout receiptは保持するが、resource limitによりrecovery admissionが失敗した
場合、runを対応するbounded-resource outcomeと消費budget証拠で終端化する。
`provider_transport_unavailable`は、それが実際に表すtransport policyまたはtransport recovery
経路だけに使う。

根拠: 設計470–478、542–545行、共通基盤v3 F15 335–342、360–366行、ADR-0032 90–91行。

### [P1] 有効なrecovery basisがない場合の遷移を定義する

531–540行は、同一run内recoveryが、変化したtransport conditionまたは実質的に異なる認可済み
requestのどちらかを証明することを正しく要求する。542–549行は、recovery 0/消費済み、resource
admission失敗、fence喪失時の扱いを定めるが、fenceとbudgetが有効でも、どちらの
`recoveryBasis`も真実として確立できない場合を定めていない。F9は変更のないblind retryを禁止
するため、runはclaim済みのまま次の遷移がない状態になる。

必要な修正: admissibleな`recoveryBasis`がない状態を、適用可能なtransport recoveryの枯渇として
扱い、timeout証拠とowner起動の新run recipeを保持する、明示名付きの回復可能な技術failureへ
runを移す。fixtureはこの遷移を決定するのではなく証明する。

根拠: 設計531–549、758–765行、共通基盤v3 F9 232–258行。

## Revision 3からの重要な差分

Revision 4は、request終端化、late result拒否、別identityの代替request、型付きrecovery basis、
閉じたrequest状態語彙、拡張fixtureを正しく追加した。今回の指摘は新設したrecovery rejection
matrixだけに限定される。以前のskeleton、portrait authority、時間境界分離、fencing訂正には
影響しない。

## 代替案とトレードオフ

1. **両経路を訂正する（推奨）:** 数値時間やrecovery回数を選ばず、正確な診断を保持して
   recovery matrixを閉じられる。
2. **すべてをgeneric technical failureにする:** 単純だが、受入済みのresource exhaustion理由を失う。
3. **basisがない場合も同じrequestを再試行する:** 即時failureを避けられるが、F9のblind retry禁止に
   直接違反する。

## リスクと未確定事項

- provider timeout、worker lease、recovery 0/1 policyの正確な値は未決定である。
- provider収束、latency分布、runtime behaviorは未検証である。
- 同一タスク内レビューは、別主体による独立reviewer identityの証拠ではない。

## Evidence chainの結果

- `C-TIMEOUT-101`（`📜`）: resource admission失敗をprovider unavailableへ誤分類している。
  `E-TIMEOUT-101`、`E-TIMEOUT-102`を参照する。
- `C-TIMEOUT-102`（`📜`）: 有効なrecovery basisがない場合の遷移が未定義である。
  `E-TIMEOUT-103`、`E-TIMEOUT-104`を参照する。
- `A-TIMEOUT-101`（`proposed`）: この2経路だけを修正し、後継の厳密な設計を再レビューする。

## レビュー判断

- 判定: `REVISE`
- 指摘: P1 2件
- Revision 4の受入推奨: なし
- 次に認可されたaction: なし。このレビューは設計修正を認可しない
