# ADR-0065: 実行行動からの裁定受渡しと中立な空項目の省略

- Status: Accepted
- Date: 2026-10-09
- Decision owner: Product owner
- Related: [ADR0064](0064-permissive-attempts-and-explicit-adjudication-failures.md), [正式計画](../adjudication-handoff-repair.pert)

## Context

E01: 所有者は裁定受渡し・失敗ログ・不要入力の修正を「進めてください」と指示し、本番配備までを目標とした。
E02: エンジンはplannedActionを消費するが、裁定準備は消費後のplannedActionを探索していた。適用は実行済みactionsを参照し、空の裁定との差分が見逃される。rc19保存記録の自由行動20件はすべてadjudication_unavailableでfailureSubtypeなし。
E03: 提供されたxAIログ2件は自由行動裁定ではなく事後のsemantic reconciliation。入力には画像URL・選択追跡・中立な空項目が残っている。

## Decision drivers

- C01/E01/E02: 実際に実行する自由行動と裁定対象を一致させる。
- C02/E01/E03: 正準の否定・不明の事実を維持し、裁定に不要な追跡情報と中立空項目を削る。

## Considered options

1. 消費済みplannedActionを復元する。状態の役割を混ぜるため採用しない。
2. 明示的な実行actionsを必須引数として渡し、裁定対象・受領結果のcoverageを検証する。採用。
3. 全null・空値を無差別に落とす。未知・不在・否定の意味を失うため採用しない。

## Decision

D01/C01: prepareFreeActionsForTurnは必須のreadonly ResolvedBattleAction[]を受領する。executedなfree_actionのみを既存のintent projectionで裁定対象にする。呼出側はengineResolved.actionsを渡す。結果は対象sideの一対一coverageを確認し、不足・重複は技術的検証失敗とする。
D02/C01: 自由行動裁定に既存LLM利用scopeのbattle/tick/action IDを接続し、dispatch guardがその関連IDを消さない。取得済みHTTP receiptのrequestIdは既存台帳で追跡する。構造化ログはfailureStage/reasonCode/fallbackKind/appliedを区別し、生エラーや秘密を出さない。
D03/C02: semantic裁定資料からimageUrlとselection追跡情報を省く。nullのskippedReason/selectedPolicyIdのみを省く。空のtopology/surface_conditions/coefficient_modifiers/appearance_changes/visible_conditions/coefficientsは、実際に省略したキーを一度だけ「空で該当なし、未観測ではない」と宣言して省略する。非空値、false、0、環境提案null、その他未知・否定の事実を保持する。資産や正準snapshot自体を削らない。

## Consequences

### Positive

- 消費後の状態によらず実行行動が裁定へ届く。
- 呼出成功と結果受領・適用成功を区別できる。
- 正準値を保持しながら不要な構造を減らせる。

### Negative and risks

- これまで欠落していた自由行動裁定の実呼出が増える。上限・完走は実測で検証する。
- この圧縮だけで潜在・実況の入力経済性を達成したとは扱わない。

## Compatibility and migration

保存形式・既存資産revisionを移行しない。既存の「実送信promptは最新版」の所有者決定に従う。公開中rc19は配備まで変更しない。物理的可否の新方針ADR0064の完全適用は、自由行動の結果表現と数値適用の接続を別途確認する。

## Verification

実エンジンが予定を消費した状態から裁定準備・適用へつながる回帰試験。missing coverage分類と構造化ログ。neutral空項目省略、非空・false・0・null意味の保持。型・未封印停止・因果封印・正式試験・同一SHA CI・Stage・公開独立readback。

## Implementation references

- backend/src/services/free-action-service.ts
- backend/src/services/battle-service.ts
- backend/src/services/awareness-adjudication-guard.ts
- backend/src/llm/adjudication-prompt-prose.ts
