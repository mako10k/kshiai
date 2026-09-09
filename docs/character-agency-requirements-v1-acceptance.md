# 初回キャラ主体性要件 revision 1 — 受入記録

日付: 2026-09-09。状態: **Accepted**。
requirement-authority-review step 4のowner判断として、下記の正確な要件snapshotを受け入れる。

## 承認対象

- 文書: `docs/character-agency-requirements-v1.md` revision 1。
- SHA-256: `f733f85a153349e4be28785fef05d93006d057e0e5d507a8423b658f9bb7f444`。
- レビュー入力: `docs/character-agency-requirements-v1-review-input.md`。
- 入力SHA-256: `ebaa28931c71a13f458e73063426b78bf69f02b2f53eefe2a6189e1cbd2feab5`。
- 独立レビュー: `docs/evidence/character-agency-requirements-v1-independent-review-2026-09-09.md`。
- レビューSHA-256: `ab8fd910611cd411956c08749322e3920eca0945f3be3c2fe444f451faef53de`。

## owner判断と履歴

第1回ownerレビューでREVIEW_THEN_DECIDEを承認。
独立レビューはcompleted、確定的な矛盾は検出されず、未変更snapshotと所見をownerへ返した。
その結果説明に対し、ownerは次のとおり回答した。

> 要件として承認します。

これをstep 4の**ACCEPT**として記録する。要件本文の書換えや所見の無断追加はしない。
要件ファイルのProposed表記、レビュー入力の経路待ち、レビュー結果の第2回判断待ちは、
各snapshot作成時の履歴として保持する。現在の受入状態はこの記録で判定する。
本文を変更する場合は別revisionを作成し、要件レビューをstep 1から行う。

## 受入範囲と残事項

承認はCA-01＋最小CA-02の要件revision 1に対するもの。
既存V1/V2の互換契約、ADR-0027の責務、追加契約ADRの実装前承認という本文の境界を維持する。

レビューで残った作者指定とfallbackの出典識別、心理反応の有界投影、旧フィールドの
writer/寿命・残存処置、世代設定・provider計上・上限の具体化は、本文が予定する詳細契約の残作業。
新しい失敗組合せの動作と実モデル改善も未検証であり、受入によって検証済みに変わらない。
任意の将来機能を追加の必須要件にしない。

追加契約ADRの受入、runtime実装、課金、展開、commit/pushは今回の要件承認と区別する。
PERTのt028は追加契約ADRの確認も含むため、この記録だけでタスク全体を完了にはしない。
今回はこの受入記録と判断根拠だけを追加し、要件・レビュー原本、PERT、ADR、Seal、実装は変更しない。

判断根拠: [CLI LLMThink](evidence/agency-requirement-acceptance-2026-09-09.think)、
`agency-requirement-acceptance-2026-09-09`、fatal/error/warning=0。
