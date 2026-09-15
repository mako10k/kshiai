# D11 集中型セマンティック・オーサリング・カーネル設計 v1 Revision 3 — レビュー

- 状態: レビュー完了、`REVISE`
- 日付: 2026-09-15
- 厳密なレビュー対象: DRAFT Seal `76d701c299b6…`
- ファイル SHA-256: `49181675114f6ced237ced68a335aa1e1edbb0eaa788379f0d6c09dc36a3e6f1`
- 範囲: 英語版設計 Revision 3 全文と、その完全な日本語投影
- 照合した権威: 受入済み ADR-0032、ADR-0031 から保持された決定、受入済み共通基盤
  要件 v3、受入済みキャラクター・オーサリング要件 v5、および設計自身の閉じた
  run/request 状態契約
- 独立性: 現在の Codex タスク内で実施。別主体による独立レビュアー要件を満たす証拠ではない
- 対象外: 設計修正、受入、実装、provider 呼出し、cutover、deployment、本番影響、commit、push

## 結論

P1 指摘 1 件により `REVISE` とする。Revision 3 は、provider transport 時間、worker
lease 時間、意味的進捗、累積リソース会計を正しく分離した。しかし、回復しない経路と
代替 request 経路のどちらについても、閉じた provider timeout 遷移を定義していない。
この遷移欠落を残すと、実装またはテスト fixture が failure、retry、late result の意味を
新たに決めることになる。

## 指摘

### [P1] provider timeout 時の request と run の遷移を閉じる

523–529 行は、別の provider call を、policy の許可、累積リソース admission、現在有効な
worker fence、blind replay でない recovery strategy のすべてが成立する場合に限定する。
しかし、いずれかが不成立の場合の遷移を定めていない。このため閉じた run 状態機械には、
recovery 0、recovery 消費済み、admission 失敗、fence 無効の各場合の遷移がない。

同じ段落は、代替 request の scheduling 前に timeout 済み request を outstanding でない
状態へ移すとも定めていない。610–612 行では、その request が outstanding である限り
provider completion を受理できる。request の終端化・置換規則がなければ、最初の late
result と代替 request の result のどちらを適用できるかが曖昧になる。

必要な修正:

1. timeout 済み request を原子的に終端化し、その最大 reservation と transport receipt を保持する。
2. 同一 run 内 recovery を admission できる場合、現在の run/worker fence の下で別 identity の
   代替 request を発行し、timeout 済み request の late result は適用せず、安全に記録可能な
   receipt のみ保持する。
3. recovery が不許可、消費済み、admission 不可、または現在の fence を維持できない場合、
   run を recoverable technical outcome の `failed` に移し、source と accounting を保持し、
   owner 起動による新 run の再開 recipe を記録する。
4. recovery 0/1 の conformance fixture は、これらの遷移を決定するのではなく証明するものにする。

根拠: 設計 523–529、596–626、728–736 行、ADR-0032 42–55 行、共通基盤 v3 F9
242–258 行および F15 360–373 行。

## Revision 2 からの重要な差分

Revision 3 は、提案されていた whole-attempt と provider の固定時間値を正しく削除し、
それぞれを provider route 別 policy と worker platform 別 policy に置き換えた。各値は引き続き
owner の決定対象である。今回の指摘は、新設された provider timeout recovery 境界だけに
限定される。以前修正された skeleton と portrait authority の決定には影響しない。

## 代替案とトレードオフ

1. **timeout 遷移を修正する（推奨）:** 数値時間や route を選ばずに状態契約を閉じられる。
   設計本文と必須 fixture に少量の追記が必要になる。
2. **遷移を実装へ先送りする:** 今回の設計作業は減るが、外部的に重要な failure/retry 決定を、
   受入権威なしに code と test へ移してしまう。
3. **同一 run 内 transport recovery を禁止する:** fence と cost の扱いは単純になるが、まだ未決定の
   policy 選択を recovery 0 に早期固定する。

## リスクと未確定事項

- provider timeout、worker lease、recovery 回数の厳密な値は未決定である。
- provider 収束性と代表的 latency は未検証である。
- このレビューでは runtime、deployment、本番 behavior を実行していない。
- 同一タスク内レビューは、別主体による独立 reviewer identity の証拠ではない。

## Evidence chain の結果

- `Evidence-TIMEOUT-001`: 設計は recovery を条件付きで許すが、条件不成立時の run 遷移と
  timeout 済み request の終端化を定義していない。
- `Claim-TIMEOUT-001` (`📜`): Revision 3 には、受入を止める provider timeout 状態契約の
  欠落がある。
- `Reasoning-TIMEOUT-001`: F9/F15 は stop、receipt 保持、late-result 拒否、明示的な新 attempt
  retry を要求する。fixture が欠落した規範的意味を補うことはできない。
- `Action-TIMEOUT-001` (`proposed`): provider timeout 遷移だけを修正し、得られた厳密な設計
  revision を再レビューする。

## レビュー判断

- 判定: `REVISE`
- 指摘: P1 1 件
- Revision 3 の受入推奨: なし
- 次に認可された action: なし。このレビューは設計修正を認可しない
