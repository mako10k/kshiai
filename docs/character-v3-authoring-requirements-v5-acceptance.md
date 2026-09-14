# キャラクタ要件revision 5 — オーナー受入記録

- 状態: Accepted
- 日付: 2026-09-11
- 決定者: プロダクトオーナー
- lifecycle: requirement-authority-review Step 4完了

## 固定された受入対象

- 正本: docs/character-v3-authoring-requirements-v5.md
- SHA-256: 17596f17d6514d5ada160b9d95453ab2bcb9cee9e4b2d2991acb8238b55ee27b
- 提示済み候補Seal: 4e291364ad2aa76da35ae2a74e6d343c951745f1ed78005fb8976a7368fae3b3
- 全文日本語訳: docs/evidence/character-v3-authoring-requirements-v5-owner-review-ja.md
- 独立レビュー: docs/evidence/character-v3-authoring-requirements-v5-independent-review-ja.md
- レビューSHA-256: 583a7abc1c03e0ed5f884c15a5e66a0686b1a20c6797b2baeac77fca619d89be
- 固定依存先: 受理済み共通基盤revision 3とその受入記録

## 受入経緯と効力

オーナーはREVIEWを選択した。独立レビューはcompleted、blocking指摘なし、
ACCEPT推奨となり、その結果と日本語訳の再試行に関する補足を提示した後、
オーナーは「ACCEPT」と明示した。

上記の正確なrevision 5を、V3キャラクタ作成・修正・V2からV3への移行の
要件基準として受理する。過去の未受理候補revision 4を採用候補として置き換える。
正本、訳、レビュー、過去候補は変更しない。
候補本文のヘッダとDRAFT Sealは作成時の履歴であり、現在の受入状態は本記録で示す。

共通基盤F1–F15を継承し、キャラクタ側はドメイン進捗の意味を定義する。
潜在意識・顕在意識・エンジン責務、3modeの完成条件、意味保護、通常の不足生成を維持する。
再試行とは、保持した元情報から新しいattemptでやり直すことである。
元情報を新しくすることを要求しない。この補足は正本R12/R19の既存意味を明確化するものである。

## 残る判断と権限境界

数値予算、観測区間、検出方式・精度、実LLM成功率・意味品質・費用・収束は未検証。
既存最大2修復・6request等の上限は、後継ADRによる明示的置換まで維持する。

要件の受理は、後継ADRの受理、設計の個別選択、実装、実LLM評価、deployment、
production migration、candidate activation、pointer変更、rollback、releaseを認可しない。
今回は受入記録のみを作成し、アプリケーションコードや実行状態は変更しない。

## 推論監査

docs/evidence/character-v3-authoring-requirements-v5-acceptance.think
CLI監査: fatal/error/warning 0。
