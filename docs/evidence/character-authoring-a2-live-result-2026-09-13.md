# A2 有界 live-provider 検証 — 実行結果

- 日付: 2026-09-13
- PERT: `ca102`
- 承認: freeze.json の 1 回・再試行なし・USD 0.75 上限
- 判定: **A2 完了**。response-schema は provider に受理された。strict V2 本文は 1 件の未登録 enum で不合格。

## 呼び出し

- 1 回。repair 2 本目なし。429/503 再試行なし。
- HTTP 200
- 分類: `invalid_payload`
- usage: prompt 17241 / completion 2083 / total 20201
- 推定費用: **USD 0.047**（予約 0.0613、上限 0.75、overrun なし）
- digest は承認 freeze と一致

機械可読: `docs/evidence/character-authoring-a2-2026-09-13/result.json`

## 分類の意味

事故時は xAI HTTP 400 `Unsupported response format`（自己参照 definitions）だった。
今回は 200 なので、A1 の object-identity 修正は実 provider で通った。

不合格は `CharacterDefinitionV2Schema` 側:

`actionNorms.1.when.clauses.0.value: unregistered observed_event_kind value: direct_address`

provider は json_schema を受け付けたが、生成した `observed_event_kind` が登録値ではない。
これは A1 の対象外。2 本目の repair は凍結で禁止した。

## していないこと

デプロイ、本番 DB 書き込み、authoring route、schema-3、A3、再試行。
