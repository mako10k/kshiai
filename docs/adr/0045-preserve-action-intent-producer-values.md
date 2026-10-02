# ADR-0045: 型修復で行動判断の値を作り替えない

- Status: Accepted
- Revision: 1
- Date: 2026-10-02
- Decision owner: Product owner
- Authority: [同名.think](0045-preserve-action-intent-producer-values.think)
- Related: [ADR-0044](0044-discriminated-action-intent-contracts.md)、[ADR-0021](0021-engine-live-continuation-and-type-escapes.md)、[ADR-0028](0028-versioned-conscious-agency-contract.md)

## Context

判別ユニオンへの修復途中、代替自由行動を観測可能な対象の準備説明から作り、
代替reflectへ定型文を供給する案を実装した。所有者は「型制約を満たすだけの
その場しのぎ」を否定し、値の連携が文字列リテラルへ置換される懸念を示した。
これは型表現の修復が判断主体の意味を変更してはならないという追加制約である。

## Decision drivers

- 型を満たすための対象参照、説明、分析、指針を生成しない。
- 有効な生成元の値をエンジン、結果、因果記録まで保つ。
- 不完全な能力メタデータを実行Intentとして扱わない。

## Considered options

1. ADR-0044の自動的な自由行動・省察生成を続ける。判断内容が変わるため撤回。
2. 欠落情報をcastやダミーで補う。契約の目的に反するため不採用。
3. 判別ユニオンを維持し、能力と判断内容を分離する。採用。

## Decision

ADR-0044のkind判別ユニオンと共通再投影を引き継ぐ。
自由行動の説明・対象参照、reflectの分析・指針は、完全な生成元の値を保持する。
これらの能力だけから代替内容を推測せず、決定論的代替の候補から除外する。
機械的に完全なIntentを作れる通常行動・既存スキルのみを代替に使用する。
構築可能な候補がなければnullを返し、既存の呼び出し側のnull／wait処理を維持する。
規範ゲートを通る有効な自由行動・省察を待機に置換してはならない。

能力一覧では自由行動・省察を、説明等を埋めた仮Intentではなく能力として評価する。
Mockの既存の判断ロジックは型を明示して保持するが、不完全なkindだけの出力は止める。

## Consequences

### Positive

- 型修復が判断内容の捏造や上書きにならず、値欠落を生成元で検出できる。
- 候補選択と完全なIntent構築の違いを明示できる。

### Negative and risks

- 自由行動・省察だけが残り判断内容が欠落する場合は、代替を構築できない。
- nullの場合の既存待機処理は今回拡張しない。将来の行動欠落方針の変更は別の判断を要する。

## Compatibility and migration

有効な行動のJSON形式、固定アセット、DB構造を維持する。
有効な自由行動・省察がそのまま採用されることと、説明・対象・私的分析が
結果と因果記録の投影で保持されることを確認する。
本番デプロイ、DB更新、有料provider実行は別の作業である。

## Verification

型上の必須情報欠落拒否、自由行動・reflect再投影の完全一致、
代替で内容を作らないこと、V4の自由行動限定規範で完全な提案が実行されること、
関連回帰、`npm test`、`npm run typecheck`を確認する。
テスト根拠はSealに基づく選択結果と明示的診断を分けて記録する。

## Implementation references

- `packages/shared/src/action-intent-contract.test.ts`
- `backend/src/services/character-action-fallback.test.ts`
- `backend/src/services/v3-battle-creation.test.ts`
