# A2 unregistered observed_event_kind — RCA

- 日付: 2026-09-13
- 対象: `ca102` live 分類 `invalid_payload`
- 詳細: `docs/character-authoring-a2-unregistered-event-kind-rca-2026-09-13.llmthink.dsl`

## 結論

xAI は json_schema を受理した（HTTP 200）。不合格はサーバーの登録値検査である。

`actionNorms.when.clauses.value` は Zod 上 `string` で、登録値は `superRefine` だけが拒む。
provider 向け JSON Schema に enum が出ない。

モデルは speech の `reactTo: direct_address` を `observed_event_kind` に流用した。
戦闘が観測する event type に `direct_address` は無い。話しかけられたことは `utterance`。

`direct_address` を observed_event_kind に足すと、マッチしない条項を合法化するため却下する。

## 修正境界

- schemaVersion 2 のまま、clause を kind ごとの value enum にする
- create / fill / repair prompt に登録 event kind と speech 語彙の分離を書く
- 有料再実行、デプロイ、schema-3 はしない
