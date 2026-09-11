# 共通基盤要件 revision 2 — オーナー受入記録

- 状態: Accepted
- 日付: 2026-09-11
- 決定者: プロダクトオーナー
- lifecycle: requirement-authority-review Step 4完了

## 受入対象

- 正本: docs/structured-semantic-authoring-foundation-requirements-v2.md
- SHA-256: df4536be8bed752c81164687112041286ebfefc7869fb80e6952f5839e0b556a
- 候補Seal: b1c177d46b6b242d6eb16c90c9a151d60603517949c1f8c09224ce46d974ac57
- 全文日本語入力: docs/evidence/structured-semantic-authoring-foundation-requirements-v2-owner-review-ja.md
- 入力SHA-256: 336323aee019b34e9cdd9f8179625c832204e93b646c68958197328fe5a20873
- 独立レビュー: docs/evidence/structured-semantic-authoring-foundation-v2-independent-review-ja.md
- レビューSHA-256: b1a768d6d8e7da50a01ebd2c661af6690c223adb84f22557625df5fe41ab6ed5
- レビューSeal: ba0f70a71dbf061dfdb9a70c6125178cfd46646e77d9d7b5b28422a6fe0477a6

## 判断の経緯と範囲

オーナーは独立レビューを明示的に依頼した。固定revision 2のレビューはcompletedとなり、
前回3件の指摘の解消を確認し、ACCEPTを推奨した。その結果の提示後、オーナーは次のように述べた。

> 承認します。次のタスクを教えて

この指示を上記の正確なrevision 2の受入として記録する。独立レビュー前の曖昧な承認ではなく、
レビュー結果提示後の今回の承認を根拠とする。候補本文・日本語入力・レビューは変更しない。
固定候補のヘッダは作成時点の状態のままであり、現在の受入状態は本記録で表す。

受理した範囲は、構造化データの生成・修正・意味保存移行の共通基盤要件である。
失敗終了と移行元からの再試行を許可し、途中コンテキスト永続化を必須としない。
退避情報の閲覧は移行中のマイグレータに限定する。
既存契約の維持・後継ADRによる置換範囲を明記し、現在の実行上限をこの受入で引き上げない。

## 後続事項

次の推奨タスクはキャラクタV3作成要件revision 4の整合である。
現在の未受理revision 3 R14/R19の同一attempt継続・通常失敗を終端にしない規則を、
受理済み共通基盤へ合わせる。退避情報の閲覧制限と、共通基盤への依存も明記する。
キャラクタ固有の意味保護、生成・修正・移行の成果条件は維持する。
この次タスクは情報として提示するものであり、本記録では実行開始しない。

要件受入はADR、実装、有償実LLM評価、deployment、production migration、
candidate activation、pointer変更、releaseを認可しない。
数値評価基準・実LLM品質・費用・収束は未検証のままである。

## 根拠とSealの解釈

根拠は docs/evidence/structured-semantic-authoring-foundation-v2-acceptance.think。
CLI LLMThink監査はfatal/error/warningが0である。
Sealgraphでは過去のDRAFT候補・レビューへのCauseを保持するため、本記録のSealにもdraftを使用する。
これはprovenanceの状態であり、オーナーが本書に記載した正確な要件をAcceptedとした事実とは別である。
