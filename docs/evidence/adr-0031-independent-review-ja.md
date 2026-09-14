# ADR-0031 revision 1 — 独立レビュー報告

- 実施日: 2026-09-11
- 対象: `docs/adr/0031-focused-structured-semantic-authoring-kernel.think` revision 1
- 対象の短縮識別子: SHA-256 `cf6230399132…`
- 対象状態: Proposed（オーナー受理待ち）
- レビュー担当: 独立レビューエージェント `adr0031_review`
- レビュー範囲: ADR内部整合性、および受理済み要件・関連ADRとの整合性
- 判定: **PASS**

## 結論

現在のアーキテクチャ判断を妨げる内部矛盾または関連ADRとの矛盾は見つからなかった。
P0、P1、P2、P3の指摘はいずれもない。これはADRのレビュー合格であり、ADRの受理、
実装、実LLM評価、ランタイム有効化を意味しない。

## 主要な確認結果

1. `D1`〜`D2` は、基盤が進行・証拠・終了を、Adapterがドメイン意味を、Portが副作用を
   所有する責務分割を維持している。内部では型付き値を通し、未知JSONのdecodeを外部境界に
   限定しており、文字列化往復や未検査castを許していない。
2. `D3` は、Skillから要求単位で必要なToolだけを公開し、公開と認可を分離する。
   全スキーマや全候補をLLMコンテキストへ漏らさないという要件と整合する。
3. `D4`〜`D5` は、限定patchを一括適用しつつ、意味的依存箇所まで修正可能にし、最終的には
   サーバ側で全体照合する。不足は通常生成し、人間Q&Aを受理済みの5条件に限定している。
4. `D6` は ADR-0014/0024 のqueue、pure read、durable wake、owner fenceを保持する。
   process/lease喪失時のfenced failureは、空のcounterで同一runを再開せず、明示的な新attemptへ
   戻すため、既存の「requeueまたはfail」境界と両立する。
5. `D7`〜`D8` は、全LLM作業に累積・有限の上限を適用し、不明使用量をゼロ扱いしない。
   停滞、反復、A/B振動を検出しながら、有用な一時的後退は許す。無効な提案と、信頼済み
   制御状態の破損も区別している。
6. `D9` は内部結果型と公開status文字列を分離し、完全検証後だけレビュー可能にする。
   owner acceptanceは候補とreceiptを固定し、既存のprovider-free CAS activationを保持する。
7. `D10` は ADR-0030 のうち、全候補をLLMレビュー・再レビューする `D8`/`D9` topologyだけを
   採用consumerについて置換し、`D2`〜`D7`、`D10`〜`D12`の意味と、現行経路の2 repair /
   6 request上限を維持している。ADR-0010/0011、ADR-0027/0028の責務境界も保持される。
8. `D11` の具体DTO、patch schema、数値、window、公開API対応、永続化変更、Adapter適合試験の
   後続設計への延期は、今回の判断を曖昧にする欠落ではなく、実装採用前の明示的な後続ゲートである。

## 指摘一覧

| 優先度 | 件数 | 内容 |
|---|---:|---|
| P0 | 0 | なし |
| P1 | 0 | なし |
| P2 | 0 | なし |
| P3 | 0 | なし |

## 未検証・後続で決める事項

以下は問題なしと確認済みなのではなく、ADRが後続設計・検証へ明示的に残した事項である。

- 正確な型付きDTOとpatch schema
- 実行上限の数値、進捗検出window、状態正規化規則
- 公開retry/Q&Aへのmapping
- 永続化とfenceの具体的変更
- character、battlefield、narration-style Adapterの適合性
- 実モデルでの品質、収束、費用

これらは実装設計またはprovider評価のレビュー対象であり、ADR-0031の受理だけでは確定しない。

## 証拠と監査

- 正本 `D1`〜`D11`: `docs/adr/0031-focused-structured-semantic-authoring-kernel.think:14-56`
- owner acceptance未了: 同 `:58-59`
- 基盤要件の責務・限定作業: `docs/structured-semantic-authoring-foundation-requirements-v3.md:32-34,133-193`
- キャラクタ要件の責務境界: `docs/character-v3-authoring-requirements-v5.md:28-30,58-93,159-212`
- 独立レビュー推論: `docs/evidence/adr-0031-independent-review.think`
- CLI LLMThink監査: fatal 0、error 0、warning 0、info 0、hint 9。
  hintは長文をblock textにすると読みやすいという表記上の助言のみで、判定を変えない。
- 正本、Markdown投影、全文日本語訳に、レビュー中の変更は加えていない。

## オーナー判断の選択肢

- **ACCEPT**: このrevision 1をアーキテクチャ判断として受理する。具体的な実装契約は
  `D11`の後続レビューで決める。実装自体は別の指示が必要。
- **REVISE**: 指定した論点をrevision 2で修正し、再レビューする。判断を精密化できる一方、
  後続設計は受理まで進められない。
- **限定再レビュー**: 特定の関連ADRまたは境界だけを追加監査する。疑義を狭く解消できるが、
  今回の独立レビューでは新たな指摘根拠は見つかっていない。

推奨は **ACCEPT**。理由は、受理済み要件を実現する責務・安全・互換境界が十分に固定され、
具体化すべき事項は `D11` に分離されているためである。欠点は、実装可能性と数値妥当性を
この時点では証明しないことである。
