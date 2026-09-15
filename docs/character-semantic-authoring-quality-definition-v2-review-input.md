# 品質属性・レビュー十分性定義 revision 2 — 初回オーナーレビュー入力

- 候補: `docs/character-semantic-authoring-quality-definition-v2.md`
- SHA-256: `b1e738829933a77a955cca7d39a8ed2d930f84ca74b45c8062514c16b078d4b2`
- 状態: requirement-authority-review Step 2完了、owner route `REVIEW`
- owner指示: 2026-09-15「REVIEW」
- 正本: 候補の日本語本文全体
- 前候補: revision 1、SHA-256 `3a7380e50ec4aedf8cf6bc730031adbb0a7bbc34820e9b6f0f49590ff0b1931f`
- revision 1 review: `docs/evidence/character-semantic-authoring-quality-definition-v1-independent-review.md`

## 目的と概要

revision 1で分離した安全性、互換性、性能、利用者価値等の定義と有限reviewの目的を維持し、
独立レビューF1〜F3だけを修正する。新しいreview工程、外部version/API、数値threshold、
provider、production policy、配備・activation権限は追加・変更しない。

## revision 1からのmaterial differences

1. **review statusと検査証拠を分離:** 新snapshotでは全in-scope claimへ現在のdispositionを付ける。
   以前のreview statusは持ち越さない。既存証拠はcurrent-fit確認後に再利用でき、新しい検査実行は
   影響claimだけに限定できる。
2. **`免除`を削除:** quality resultを`適合`、`不適合`、`判定不能`の3状態にした。適用外は固定scopeで
   扱い、必須claimを外す場合は元のauthorityによる要件変更へ戻す。
3. **profileの役割を固定:** `QV-01`〜`QM-01`をclaim templateと明記し、各review inputが3章の
   8項目を完成させる。未決値をreviewerに埋めさせない。

上記以外の品質定義、profile基準template、未決値、適用範囲は変更していない。

## source provenanceと既存authority

規範sourceは、受入済み共通基盤要件revision 3、キャラクター要件revision 5、
意味マイグレーション要件revision 6、ADR-0031である。revision 1とその独立レビューは、
revision 2の変更範囲を定めるreview provenanceであり、受入済み要件ではない。

既存authorityはすべて維持する。本候補は機能要件、外部version/API、既存hard ceiling、
provider、production policy、配備・activation権限を変更しない。

## in scope

- 候補revision 2全文
- revision 1独立レビューF1〜F3のclosure
- 変更していない品質属性、任意改善、未決値、既存authority境界の回帰確認
- 候補7章の12 acceptance criteria

## out of scope

- 数値threshold、corpus構成、provider/model、production policyの選択
- implementation、PERT変更、provider評価、配備、production操作
- 他機能・他repositoryへの一般化
- revision 1またはそのreview recordの書換え

## unresolved unknowns

候補8章のcorpus、成功・失敗・質問・収束率、latency、token/cost、Stage観測値は未決である。
revision 2も、その値をreviewerが創作せず別owner decisionへ残す。

## independent review questions

1. 新snapshotの全in-scope claimにcurrent dispositionを要求し、以前のreview statusを持ち越していないか。
2. 既存証拠のcurrent-fit再利用と、新規検査実行のimpact scopeが明確に分かれているか。
3. bytes未変更でも新しい矛盾証拠または依存変更があるclaimを再評価するか。
4. `免除`がquality resultから除かれ、reviewerが必須claimを外せないか。
5. scope除外と、元のauthorityによる要件変更が区別されているか。
6. profile行がclaim templateとされ、review inputで8項目を完成させるか。
7. revision 1の安全性・互換性・性能等の定義と利用者価値境界が意図せず変わっていないか。
8. 任意改善の非blocker化、review完了と適合・受入の分離、未決数値が維持されているか。
9. 受入済みsource、既存上限、外部namespace、後続effect authorityと矛盾しないか。

## Step 2 owner route

ownerは次のいずれかを選ぶ。

- `REVISE`: 独立review前に候補を改訂する。
- `REVIEW_THEN_REVISE`: owner質問を追加して独立reviewし、その結果後に必ず改訂する。
- `REVIEW_THEN_DECIDE`: owner質問を追加して独立reviewし、同一snapshotをStep 4で判断する。
- `REVIEW`: 上記9質問のまま独立reviewし、同一snapshotをStep 4で判断する。

選択routeは `REVIEW`。owner追加質問なしで独立reviewを行い、同一snapshotをStep 4へ進める。
