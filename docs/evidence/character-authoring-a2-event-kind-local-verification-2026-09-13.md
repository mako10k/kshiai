# A2 follow-up — registered action-norm clause vocabulary

- 日付: 2026-09-13
- PERT: `ca105`
- RCA: `docs/evidence/character-authoring-a2-unregistered-event-kind-rca-2026-09-13.md`

## 実施

schemaVersion 2 のまま、`CharacterNormClauseV2` を kind ごとの value enum にした。
provider JSON Schema に `observed_event_kind` の登録値が載る。`direct_address` は
speech `reactTo` に残し、action-norm event kind には足していない。

create / fill / repair prompt に語彙分離を書いた。話しかけは `utterance`。

## 検証

- `npm test` pass
- `npm run typecheck` pass
- A2 freeze キャプチャは引き続き acyclic
- provider schema の observed_event_kind enum に `utterance` があり `direct_address` がない

有料再実行、デプロイ、schema-3 はしていない。
