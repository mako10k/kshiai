# ADR-0044: 行動Intentの条件付き必須を静的型にも反映する

- Status: Superseded
- Revision: 1
- Date: 2026-10-02
- Decision owner: Product owner
- Authority: [同名.think](0044-discriminated-action-intent-contracts.think)
- Related: [ADR-0021](0021-engine-live-continuation-and-type-escapes.md)、[ADR-0028](0028-versioned-conscious-agency-contract.md)、[障害解析](../evidence/battle-advance-error-analysis-2026-10-02.md)

実装途中の所有者の指示により、[ADR-0045](0045-preserve-action-intent-producer-values.md)で置換。
この記録の準備説明による自由行動代替・定型省察代替は最終実装へ採用しない。

## Context

自由行動の説明と対象参照、reflectの分析と指針は実行時には必須だが、
従来のZod追加検証から推論される型ではoptionalだった。
稼働版の代替生成は行動種別のみからIntentを作り、本番と同じ検証エラーを再現した。
所有者は判別ユニオンでこれを閉じる説明に対して「では、それを対応しましょう。
類似対応箇所を挙げて」と実装を指示した。この記録はその指示の範囲を固定する。

## Decision drivers

- 内部の不完全な行動構築をコンパイル時に拒否する。
- 外部JSONは実行時にも検証し、既存の観測・規範・固定アセットの境界を維持する。
- 行動、解決結果、再投影で同じ必須情報を保持する。

## Considered options

1. optionalと追加検証を維持する。内部生成の欠落を静的に検出できない。
2. TypeScript型だけ別定義する。Zodとの二重管理になる。
3. Zodのkind判別ユニオンから型を導出し、内部生成の戻り値を明示する。採用。

## Decision

自由行動には説明と非空対象参照、reflectには分析と指針を構造として要求する。
通常行動の既存フィールドとスキルの既存実行可能性検証は維持する。
行動・解決結果は同じユニオンの各枝から構築し、内部の生成・再投影は
`CharacterActionIntent`として型チェックする。外部入力のparse/safeParseは維持する。

代替自由行動は既存の観測可能なaffordanceの準備説明と参照を用い、
対象がなければ捏造せず次の構築可能な候補へ進む。
reflect代替は既存の決定論的分析・指針を用いる。
候補が構築できない場合の既存null／wait処理は維持する。
行動一覧の自由行動能力チェックは完全な実行Intentの生成と分離する。

## Consequences

### Positive

- 自由行動・reflectの必須情報欠落を型検査と実行時検証の両方で検出できる。
- 同じ情報を落とす再投影や内部構築も修正対象として可視化される。

### Negative and risks

- オブジェクトのフィールドを個別にコピーしていた経路で、判別関係の保持が必要。
- 非空配列や禁止フィールドの構造化で、従来の不正／曖昧な内部値が検出される。

## Compatibility and migration

有効な自由行動・reflectのJSON形式は維持する。DB移行や固定アセット更新は不要。
スキルIDの存在、規範、対象の実在性、上限等は既存実行時検証で確認する。
本記録は本番デプロイ、DB更新、有料provider実行を承認しない。

## Verification

必須情報を欠く値の型上の不適合、各枝の実行時拒否、代替生成、reflect再投影、
能力一覧、戦闘エンジン・保存スナップショットの回帰を確認する。
sharedをビルドしてから関連診断テスト、`npm test`、`npm run typecheck`を実行し、
Seal選択対象と診断実行を区別して報告する。

## Implementation references

- `packages/shared/src/battle.ts`
- `packages/shared/src/action-feasibility.ts`
- `packages/shared/src/battle-turn-causal-receipt.ts`
- `backend/src/services/battle-service.ts`
