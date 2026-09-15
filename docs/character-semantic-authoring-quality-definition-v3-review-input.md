# 品質属性・レビュー十分性定義 revision 3 — 初回オーナーレビュー入力

- 候補: `docs/character-semantic-authoring-quality-definition-v3.md`
- SHA-256: `2cb49ea4151c2dbc6816f3187a114a221580c6e024694c56fc46e13853ff1cff`
- 状態: requirement-authority-review Step 2完了、owner route `REVIEW`
- owner指示: 2026-09-15、revision 2に「REVISE」、提示されたrevision 3に「REVIEW」
- 正本: 候補の日本語本文全体
- 前候補: revision 2、SHA-256 `b1e738829933a77a955cca7d39a8ed2d930f84ca74b45c8062514c16b078d4b2`
- revision 2 review: `docs/evidence/character-semantic-authoring-quality-definition-v2-independent-review.md`

## 目的と概要

revision 2で残った、review前に実結果を要求しながら結果はreview後にだけ記録するという時系列矛盾を
閉じる。review前は7入力項目と`未評価`の結果slot、review後は既存の3結果の一つへの確定とする。
新しいreview工程、評価項目、例外、外部version/API、数値threshold、provider、production policy、
配備・activation権限は追加・変更しない。

## revision 2からのmaterial difference

変更は1件だけである。

- **結果の時系列を分離:** review inputは、属性、対象、境界、守る成果または避ける損失、測定量または
  不変条件、判定基準、証拠方法の7入力項目と、`未評価`の結果slotを持つ。review報告でだけslotを
  `適合`、`不適合`、`判定不能`のいずれかへ確定する。入力不足をreviewerは補完せず、結果を
  `判定不能`とする。

上記以外の品質定義、profile基準、review終了条件、未決値、適用範囲、authority境界は変更していない。

## source provenanceと既存authority

規範sourceは、受入済み共通基盤要件revision 3、キャラクター要件revision 5、
意味マイグレーション要件revision 6、ADR-0031である。revision 2とその独立レビューは、
revision 3の変更範囲を定めるreview provenanceであり、受入済み要件ではない。

既存authorityはすべて維持する。本候補は機能要件、外部version/API、既存hard ceiling、provider、
production policy、配備・activation権限を変更しない。

## in scope

- 候補revision 3全文
- revision 2独立レビューF1のclosure
- revision 2で閉じた事項と、変更していない品質属性、任意改善、未決値、既存authority境界の回帰確認
- 候補7章の12 acceptance criteria

## out of scope

- 数値threshold、corpus構成、provider/model、production policyの選択
- implementation、PERT変更、provider評価、配備、production操作
- 他機能・他repositoryへの一般化
- revision 1、revision 2、またはそれらのreview recordの書換え

## unresolved unknowns

候補8章のcorpus、成功・失敗・質問・収束率、latency、token/cost、Stage観測値は未決である。
revision 3も、その値をreviewerが創作せず別owner decisionへ残す。

## independent review questions

1. review前の必須内容が7入力項目と`未評価`の結果slotに分かれているか。
2. `未評価`がreview結果ではなく、review報告でだけ3結果の一つへ確定するか。
3. 入力不足をreviewerが創作せず、review結果を`判定不能`とするか。
4. revision 2 F1のpre-review/post-review時系列矛盾が閉じているか。
5. revision 2で閉じた全claim current disposition、current-fit後の証拠再利用、影響範囲だけの新規検査、免除禁止が維持されているか。
6. 安全性・互換性・性能等の定義と利用者価値境界が意図せず変わっていないか。
7. 任意改善の非blocker化、review完了と適合・受入の分離、未決数値が維持されているか。
8. 受入済みsource、既存上限、外部namespace、後続effect authorityと矛盾しないか。

## Step 2 owner route

ownerは次のいずれかを選ぶ。

- `REVISE`: 独立review前に候補を改訂する。
- `REVIEW_THEN_REVISE`: owner質問を追加して独立reviewし、その結果後に必ず改訂する。
- `REVIEW_THEN_DECIDE`: owner質問を追加して独立reviewし、同一snapshotをStep 4で判断する。
- `REVIEW`: 上記8質問のまま独立reviewし、同一snapshotをStep 4で判断する。

選択routeは`REVIEW`。owner追加質問なしで独立reviewを行い、同一snapshotをStep 4へ進める。
