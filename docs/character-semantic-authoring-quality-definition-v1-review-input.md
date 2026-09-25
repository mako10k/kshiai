# 品質属性・レビュー十分性定義 revision 1 — 初回オーナーレビュー入力

- 候補: `docs/character-semantic-authoring-quality-definition-v1.md`
- SHA-256: `3a7380e50ec4aedf8cf6bc730031adbb0a7bbc34820e9b6f0f49590ff0b1931f`
- 状態: requirement-authority-review Step 2完了、owner route `REVIEW`
- owner指示: 2026-09-15「一旦これで定義しましょうか。REVIEWで進めて。」
- 正本: 候補の日本語本文全体

## 目的と概要

現在のキャラクター意味オーサリングdeliveryについて、「安全性」「互換性」「性能」等を
相互に代用できない定義へ分ける。品質主張に必要な8項目、現在deliveryの最小profile、
レビュー所見4分類、品質結果4状態、reviewの有限な終了条件を定める。

本候補は新しいレビュー工程を追加しない。既存工程で使う語彙と終了条件を定め、
任意の「よりよく」を現在のblockerにしない。

## source provenanceと既存authority

規範sourceは、受入済み共通基盤要件revision 3、キャラクター要件revision 5、
意味マイグレーション要件revision 6、ADR-0031である。現行plan revision 6は、用語の
利用箇所と未決評価項目を確認する非規範入力として扱った。

既存authorityはすべて維持する。本候補は機能要件、外部version/API、既存hard ceiling、
provider、production policy、配備・activation権限を変更しない。受入時は現deliveryの
品質語彙とレビュー十分性だけを補足する。

## review scope

候補revision 1全文を対象とする。特に次を確認する。

- 属性間の分離と、品質主張8項目
- 現delivery profile `QV-01`から`QM-01`
- 未決数値の扱い
- 所見4分類、結果4状態、review完了条件
- 既存authority、対象外、外部namespaceへの影響なし

実装、PERT変更、provider評価、配備、production操作、他機能への一般化は対象外である。

## acceptance criteria

候補7章の11項目を用いる。追加の暗黙基準は用いない。

## unresolved unknowns

候補8章のcorpus、成功・失敗・質問・収束率、latency、token/cost、Stage観測値は未決である。
今回の判断は、その値を決めることではなく、未決値をreviewerが創作せず明示的な別owner判断へ
残す構造を受け入れるかである。

## independent review questions

1. 安全性は指定危害のriskとして定義され、配備順、変更回避、検査追加で代用されていないか。
2. 互換性はversion行列、方向、操作、保持対象、非互換時の扱いを要求しているか。
3. 性能はworkloadと統計を要求し、hard ceiling、信頼性、費用、利用者価値と混同していないか。
4. 受入済み3要件・ADR-0031のauthorityまたは既存上限を変更していないか。
5. 未決値を成功・失敗へ変換せず、owner decisionとして保持しているか。
6. 任意改善や対象外をblockerへ昇格できず、不適合・判定不能が残ってもreview自体は完了できるか。
7. 変更影響だけを再確認する規則が、既知の矛盾証拠を無視する抜け道になっていないか。
8. 利用者価値がテスト件数、review PASS、配備状態で代用されていないか。

## Step 2 owner route

ownerは次のいずれかを選ぶ。

- `REVISE`: 独立review前に候補を改訂する。
- `REVIEW_THEN_REVISE`: owner質問を追加して独立reviewし、その結果後に必ず改訂する。
- `REVIEW_THEN_DECIDE`: owner質問を追加して独立reviewし、同一snapshotをStep 4で判断する。
- `REVIEW`: 上記8質問のまま独立reviewし、同一snapshotをStep 4で判断する。

選択routeは `REVIEW`。owner追加質問なしで独立reviewを行い、同一snapshotをStep 4へ進める。
