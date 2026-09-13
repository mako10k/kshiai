# A2 有界 live-provider 検証 — 凍結（未実行）

- 日付: 2026-09-13
- PERT: `ca102` / 後継計画 A2
- 状態: **承認済み。1 回実行済み。** 結果は `character-authoring-a2-live-result-2026-09-13.md`。2 回目は禁止。

A1 はローカルで response-schema の object identity を直した。A2 は、事故原因だった
`create_instruction` → `generateCharacterDefinitionV2` → `character_definition_v2`
を、実 xAI へ **1 回だけ**送って分類する。デプロイ、本番 DB、authoring route、
schema-3 有効化、カーネル配線はしない。

## 凍結した呼び出し

機械可読: `docs/evidence/character-authoring-a2-2026-09-13/freeze.json`

| 項目 | 値 |
| --- | --- |
| runId | `character-authoring-a2-2026-09-13` |
| provider / endpoint | xAI `https://api.x.ai/v1/chat/completions` |
| model | `grok-4.5`（engine。現行 create 経路） |
| label | `generateCharacterDefinitionV2` |
| sourceKind | `create_instruction`（fill 経路ではない） |
| schema | `character_definition_v2` |
| schema digest | `1e41abfa1e19b26596258eebd5597a74a212b483969f320a064f40b4b1e2fac3` |
| request digest | `6107a73749e18bb9f667981d74a89ff8844bccd66d2eb77706620bc8925cab97` |
| 送信 bytes | 65314 |
| 予約 input tokens | 18377（bytes/4 + framing 2048） |
| 予約 output tokens | 4096 |
| 予約費用 | **USD 0.0613**（上限 0.75） |
| 料金仮定 | grok-4.5 標準 $2 / $6 per 1M。200k 超の long-context 料金は使わない |
| timeout | 90s |
| temperature | 0.35 |

再試行禁止:

- SDK `maxRetries = 0`
- 429 / 503 も再試行しない
- 定義 repair の 2 本目を出さない
- `fallbackOnError = false`
- mock へ落とさない

入力は合成シート `a2-synthetic-observer` だけ。本番 character は読まない。

分類（実行後）:

- `schema_rejected` — HTTP 400 / unsupported response format（A1 失敗の再現）
- `valid_character_definition_v2` — 200 かつ strict V2
- `invalid_payload` — 200 だが V2 不正
- `transport_error` — 認証・期限・接続
- `unknown_consumption` — 使用量が取れない。会計は捏造しない

## 検証済み（ローカル）

- `character-authoring-a2-freeze` テスト 1 件 pass
- キャプチャ schema は `assertXaiResponseSchema` を通る（自己参照なし）
- 同一 freeze を 2 回取ると digest が一致
- `--execute` は承認前に例外で止まる

## 承認してほしいこと

この freeze.json の **1 回・USD 0.75 上限・再試行なし** で live 実行してよいか。

承認後にやること: 同じ request digest を 1 回送り、receipt と分類を残す。
承認しなければ A2 は凍結のまま。B8 や schema-3 には進まない。
