# ADR-0063: 装備効果を保持するサーバー補正専用STA負担

- Status: Accepted
- Date: 2026-10-09
- Decision owner: Product owner
- Related: [ADR0060](0060-owner-test-contract-recovery.md), PR172

## Context

装備の正効果に負担を追加するとき、現在の補正処理はeffectsの先頭3件だけを残すため、4件目の元効果を失う。所有者は2026-10-09に「補正専用フィールドを採用」と回答した。

## Decision drivers

- 元の効果をすべて保持し、戦闘へ届ける。
- キャラ生成の効果上限4件と、補正のSTA負担上限12を維持する。
- 補正の再適用で負担を二重追加しない。

## Considered options

1. 効果上限を5へ拡張する。生成契約まで変更するため採用しない。
2. 4件が埋まっている場合だけサーバー補正専用フィールドを追加する。採用。
3. 元の4件目を削除する。元情報を失うため採用しない。

## Decision

Equipmentに任意のbalanceTradeoffを追加する。内容はparameterがstamina、deltaが整数-12〜-2の差分とする。正効果があり負担がない装備に既存の計算式で負担を追加する。effectsが4件の場合はすべて保持してbalanceTradeoffへ保存する。空きがあれば従来どおりeffectsへ追加する。既存の負担を再追加しない。LLMの装備生成出力からこの専用フィールドを受理せず、サーバー補正が作成する。戦闘開始時は元効果と専用差分を両方適用する。

## Consequences

### Positive

- 4件目の意味と補正負担を両立できる。

### Negative and risks

- 保存形式に任意フィールドが増えるため、読み取りと戦闘適用の受渡しを確認する。

## Compatibility and migration

既存形式は引き続き読める。保存済み試合や本番DBを移行しない。補正は新しくコンパイルする装備へ適用する。

## Verification

4件すべての効果保持、専用負担の上限、補正の冪等性、空きがある場合の旧表現、戦闘開始時の両方の適用を検証する。元の試験ケースを保持し、型・静的検査と封印された正式試験で確認する。

## Implementation references

- 実装と検証証跡は検証後に追加する。
