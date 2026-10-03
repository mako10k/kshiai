# ADR-0046: 既存の条件付き契約を型と実行時で一致させる

- Status: Accepted
- Date: 2026-10-03
- Decision owner: Product owner
- Authority: [同名.think](0046-align-conditional-contracts.think)
- Related: [ADR-0045](0045-preserve-action-intent-producer-values.md), [修復PERT](../action-contract-repair.pert)

## Context

行動修復に続き、TurnEvent、V3規範、意味移行、compiler capability、skeleton phaseに実行時だけの条件が残る。所有者は類似対応を順次実施し、コミット、デプロイするよう指示した。

## Decision drivers

- 生成元の値と既存の有効なJSONを保持する。
- 欠落値を固定文言、castで埋めない。
- 動的な値の一致・登録参照検証は実行時で継続する。

## Considered options

1. runtime refinementのみ維持する。静的な欠落検知が残る。
2. 全条件を型だけに移す。動的な意味検証は表現できない。
3. 有限の条件をschema unionから推論し、動的検証を併用する。採用。

## Decision

既存runtime条件を判別unionに表現し、生成元は元の値を分岐で保持する。TurnEventのpayloadとsource排他、V3規範のforce/disposition、移行operation/provenance/payload、登録済みcompilerペア、skeleton操作部分集合を対象とする。skillIdは現在の欠落時の失敗分類と入力互換を監査し、既存契約変更が必要なら別の決定へ分離する。判断内容やバージョンを仮値で補わない。

## Consequences

### Positive

- runtimeで拒否される有限の構造を内部producerでも検出できる。

### Negative and risks

- 広い型の内部producerで、元の値を保持する分岐が必要になる。
- 動的な参照の存在、長さ上限、意味整合性はruntime検証が必要。

## Compatibility and migration

有効なwire形式、DB、固定revision、公開ゲーム規則を保持する。既存の必須条件以上の入力拒否は追加しない。所有者の今回の明示指示に基づき、検証したcommitを既存の未リリース環境へ必要更新としてデプロイする。正式release/main統合や大規模migration受入れと区別する。

## Verification

条件別の型拒否、schema拒否、元payloadの完全一致、既存関連回帰、build、typecheck、npm test、公開healthと配置artifactのreadbackを確認する。

## Implementation references

- [修復PERT](../action-contract-repair.pert)
