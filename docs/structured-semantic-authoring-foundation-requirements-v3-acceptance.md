# 共通基盤要件 revision 3 — オーナー受入記録

- 状態: Accepted
- 日付: 2026-09-11
- 決定者: プロダクトオーナー
- lifecycle: requirement-authority-review Step 4完了

## 受入対象

- 正本: docs/structured-semantic-authoring-foundation-requirements-v3.md
- SHA-256: b5693f6d47e975ea1cb78adaa686185630db5ffc6d52c74f3481ac77511c99da
- 提示済み候補Seal: b57db67a23f10865a8f903be07d0eb42376424f28b6082d528a92167fc933305
- 全文日本語訳: docs/evidence/structured-semantic-authoring-foundation-requirements-v3-owner-review-ja.md
- 独立レビュー: docs/evidence/structured-semantic-authoring-foundation-v3-independent-review-ja.md
- レビューSHA-256: 8ebda1183d5879622741fa7c9ae564f65f506584a7eefd339447451ccd471c28

## 判断と効力

オーナーはREVIEWを選択し、固定revision 3の独立レビューを実施した。
completed、blocking指摘なし、ACCEPT推奨という結果の提示後、
オーナーは「アクセプト」と指示した。
これを上記の正確なrevision 3の受入として記録する。

共通基盤の要件基準をrevision 2からrevision 3へ置き換える。
候補本文、翻訳、レビュー、旧受入記録は変更しない。
候補ヘッダは作成時点の記録であり、現在の受入状態は本記録で示す。
候補SealのDRAFTは作成時のprovenanceであり、本記録の要件Acceptedとは別である。

受理対象には、累積資源上限、有限区間の膠着・振動検出、信頼する内部状態の整合性検査、
安全停止と明示的な元情報からの再試行を含む。
通常の不足生成、意味依存の修復、一時的後退、例外的な人間Q&Aを維持する。
途中コンテキストやcheckpointの永続化は必須にしない。

## 残る境界

既存ADRの実行上限は後継ADRによる明示的置換まで維持する。
数値予算、観測区間、具体検出方式、実providerの成功率・費用・収束は未検証である。

キャラクタ要件revision 4は、基盤revision 2を参照する未受理候補のままである。
今回の受理でその依存先や候補本文を自動変更しない。

要件の受理は、ADR受理、実装、実LLM評価、deployment、production migration、
activation、pointer変更、releaseを認可しない。今回は受入の記録のみを行う。

## 推論監査

docs/evidence/structured-semantic-foundation-v3-acceptance.think
CLI LLMThink監査: fatal/error/warning 0。
