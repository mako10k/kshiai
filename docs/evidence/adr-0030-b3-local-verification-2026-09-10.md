# ADR-0030 B3 ローカル検証記録

- 日付: 2026-09-10
- 対象: V3 semantic asset / compiler contract
- 結果: ローカル検証合格
- authority: Accepted ADR-0030 revision 1

## 実装した境界

- `CharacterDefinitionV3`: selector必須の実行可能action norm
- `CharacterConsciousGuidanceV1`: action selector、restrictive disposition、fallbackを持たない顕在意識向け入力
- `CharacterMechanicalConflictFallbackV1`: 登録済みaction、順序、legality再検証、receipt
- `CharacterCompilerCapabilitySetV1`: qualified consumer/compiler capability
- `CharacterDeferredValueV1`: active definition fieldのsentinelではない別collection
- `CharacterBattleCompilerInputsV4`、`BattleCharacterAssetBindingV4`
- basic-action provenance `character_generation_v3`

既存の`CharacterDefinitionV2`、`CharacterBattleCompilerInputsV3`、
`BattleCharacterAssetBindingV3`の意味は変更していない。

## 検証結果

- focused回帰: shared 334 tests、失敗0
- 全体test: shared 334、backend 353、frontend 20、deployment 3、release 5、失敗0
- 全workspace typecheck: 合格
- build: 合格。既存のVite chunk-size advisoryのみ
- duplication: 合格
- Lizard 1.23.0: 189 files / 3277 functions
  - complexity: 116/121、最大87/92、超過量1309/1369
  - function length: 67/67、最大707/733、超過量6881/7390
  - parameter count: 5/5、最大11/11、超過量10/10

## 非対象

database migration、attempt/request persistence、preservation capsule persistence、LLM semantic
change set、repair orchestration、provider call、deployment、production read/write、candidate acceptance、
pointer CAS、rollback、authoring-policy activationは実装も実行もしていない。これらはB4以降の別gateである。

## 判断根拠

- CLI LLMThink: `docs/evidence/adr-0030-b3-local-verification-2026-09-10.think`
