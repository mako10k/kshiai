# ADR-0061: 改善分析の終了試合数による利用条件

- Status: Accepted
- Date: 2026-10-08
- Decision owner: Product owner
- Related: [要件候補revision1](../character-improvement-eligibility-requirement-candidate-r1-2026-10-08.md)、ADR0060、ADR0011/0043

## Context

分析頻度の5/10閾値について所有者へ確認し、「現行の5試合・追加10試合を採用」と直接回答を受けた。

## Decision drivers

終了した試合の蓄積を材料に手動分析し、UI/APIで同じ条件を使う。

## Considered options

現行5/追加10の採用、閾値変更、保留。所有者は現行条件を採用した。

## Decision

要件候補revision1の初回5終了試合・前回成功分析のsnapshot件数+10を採用。所有者限定・手動起動・成功保存時だけ分析回数/snapshot更新・GET非起動を維持する。終了試合は同一所有者も数える現在の数え方であり、未終了は除く。

## Consequences

前回17件で分析すれば次は27件。10の倍数や経過日数ではない。履歴削除で現在件数が減る場合、到達が遅れる。閾値の最適性、分析品質、同時起動の二重課金防止をこの決定で証明しない。

## Compatibility and migration

コード/schema/保存済み分析snapshotの変更なし。有料試行・自動分析・公開配備は許可されていない。

## Verification

元4ケースの初回閾値・再分析閾値・不足表示・保存snapshot起点を保持して検証し、Accepted契約へSealする。

## Implementation references

packages/shared/src/character-improvement.ts と対応元4ケース。
