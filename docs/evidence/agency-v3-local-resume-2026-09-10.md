# 顕在意識 V3 — 現PCでの再開・Seal読戻し

2026-09-10。別PCの `d22330426cce8159bdc62788ace9964160aa719a` を
既存 `codex/compact-psyche-repair-integration` へfast-forwardで取り込んだ。
更新直後はremote同名refとHEAD一致、作業ツリーclean。別の作業ツリーは変更していない。
本日の共有開始はユーザー指定08:50で登録し、planned_end17:50を読戻した。

## 今回確認・実施したこと

- 別PCの変更は1commit、runtime sourceの変更なし。復旧したADR checker、
  PERT文法修正、検証記録を取り込んだ。
- このPCの既存SealGraphはformat 5のstatus/fsckに成功した。
  別PCのformat 4バイナリ／Go取得失敗は別環境の記録であり、このPCの阻害条件ではない。
  バイナリ導入、ストア初期化・移行・既存履歴置換は行っていない。
- sharedをbuildしてから、V3 binding / persistence / runtime / closed acceptance /
  psyche-reaction-policy / dialogue settings の6試験ファイルを実行しexit 0。
  全709件・全typecheck・全build・Lizardの最終成功は別PCの
  [引継記録](agency-v3-wip-handoff-2026-09-10.md)を参照。
  今回その全件を再実行したとは扱わない。
- 現PCでも `npm run adr:check` の全体実行を確認。
  ADR-0027/0028はaudit cleanだが、旧4件のため全体exit 1。
- 更新したPERTは `perttool document check docs/dialogue-expression-realization.pert`
  exit 0。既存PTDAG-208の20警告は履歴上のmilestone closure提案として保持。
- runtime、schema、prompt、設定値は変更していない。
  実装計画revision6、責務設計改訂8、backlog revision10、PERT改訂19（DSL6）に
  現PCの到達点を反映。t029はactiveを保持し、t030以降は開始していない。

## Sealの個別確認と結果

[機械読戻し](agency-v3-seal-readback-2026-09-10.json)に変更前impact、
個別のレビュー根拠、新旧HEAD、Cause、全source比較を保存した。

- 登録表v7の未登録15件を、原資料と依存先を確認して個別登録した。
- 現行計画4件は編集前の正確な旧Sealにimpactを実行し、個別に本文を確認してresealした。
  新targetと旧revisionの関係をCauseに明示し、古い履歴は保持した。
- 結果: **62/62 REF登録、全62 sourceがHEAD一致、候補なし、Stale 0、fsck ok**。
  fsckのSeal総数は124（開始時105）。15新規＋4更新に対応する。
- 旧V1要件／レビュー、旧検証記録のbytesは変更していない。
  過去の「検査未実施」や途中の708件という記述は当時の記録であり、
  現在の成功へ書き換えたり、V3実モデル品質の根拠へ昇格させたりしていない。
- 本再開記録とreadbackは補助記録であり、自己参照するSealを追加していない。
  62件は登録表v7の範囲。未登録の全依存や意味的正しさまで保証しない。

## 残っている旧ADR検査の問題

| 対象 | 現PCで再現した失敗 | 判断の境界 |
|---|---|---|
| ADR-0015 / 0016 / 0017 | 先頭の旧 `ADR-NNNN` 形式をCLIが拒否。checkerはAcceptedの所定受入markerも見つけられない | marker不一致だけで実際にowner承認がなかったとは判断しない。正本・履歴を照合する必要がある |
| ADR-0019 | `premise OPTIONS based_on ...` をCLIが拒否。Proposedの所定pending markerにも不一致 | 既存提案の意味とauthorityを保って扱い方を決める。受入済みへ変更しない |

作成機構は、保存済みDSL／受入表現と復旧した現行parser/checkerの契約不一致である。
どちらの履歴が現行正本の意図に合うか、その互換化方式と承認証跡の補い方は未確定。
「テスト不足」をこの不一致の根本原因としていない。
検査除外・成功扱い・Accepted本文の検査都合での改変はしていない。

次の判断点は、旧ADRの意味と受入履歴を保存したまま検査互換性を回復する扱い。
t029の最終完了判定はその処置と既存完了条件の照合後に行う。
実モデル比較／設定activation／有料provider／展開／mergeは別の承認境界に残す。

## 監査と保存状態

[CLI LLMThink判断](agency-v3-seal-resume-2026-09-10.think)は先に監査し、
fatal/error/warning=0、hint1（長文表記の助言）を確認してから個別登録と文書更新を実施した。
今回の成果はローカル未コミット。新たなcommit/pushは実行していない。

