# キャラクター意味移行 — WIP 引継ぎ

2026-09-13。作業ツリー `/home/mako10k/kshiai`、ブランチ
`codex/compact-psyche-repair-integration`。本資料作成前の HEAD は
`b62ce7e`（確認済み kernel / B4 frontier の reseal）。この WIP コミットは
A2 live 検証、A2 後続の clause 語彙修正、本引継ぎを含む。

公開 authoring route、schema-3 有効化、A3 デプロイ、B8 デプロイはしていない。

## 計画状態

`docs/character-semantic-migration.pert` は当時 `version 15`、`as_of 2026-09-13`
と記録した。ただし `version` は計画改訂番号ではなくPERT文法番号であり、15は
未リリースかつ未定義だった。この誤記は2026-09-14にGrammar 9へ修正し、計画改訂は
コメントとGit履歴で分離した。

到達済み:

- Lane A: `ca101` A1、`ca102` A2、`ca105` A2 後続（clause 語彙）
- Kernel: `cb206` `cb216` `cb217` `cb218` `cb207`（スライス1–5）
- 先行 B3–B5 / D11 は従来どおり done

未到達の次ゲート（いずれも `cr002` の別承認）:

- `ca103` A3: デプロイして新規作成を検証。schema-3 は触らない
- `cb208` B8: dual V2/V3 **read** のデプロイ。provider 呼び出しなし

B5 Seal frontier（`reasoning/adr-0030-b5-action-plan`）は未確認のまま残す。
一括 reseal は禁止。

## 今回の成果

### Kernel スライス1–5（既にコミット済み）

`a44b3d4` 実装、`4844b7f` 対象 REF の draft Seal、`b62ce7e` 確認済み frontier
observer の reseal。カーネルは薄い orchestration + ports + character adapter +
public mapping。route 非カットオーバー。独立レビュー PASS、slice 5 統合レビュー
PASS。証跡は `docs/evidence/semantic-authoring-kernel-slice*-*.md`。

### A2 live（本 WIP）

承認済み freeze で xAI `grok-4.5` へ **1 回**だけ `generateCharacterDefinitionV2`
を送った。再試行なし。分類は `invalid_payload`（HTTP 200）。

- A1 の対象だった自己参照 json_schema は provider に受理された（400 は出ていない）
- 不合格は `observed_event_kind=direct_address`（speech `reactTo` 語彙の混入）
- 実費見込み USD 0.047。2 回目は `result.json` があるため禁止

証跡:

- `docs/evidence/character-authoring-a2-freeze-2026-09-13.md`
- `docs/evidence/character-authoring-a2-2026-09-13/freeze.json`
- `docs/evidence/character-authoring-a2-live-result-2026-09-13.md`
- `docs/evidence/character-authoring-a2-2026-09-13/result.json`

freeze digest は **clause enum 修正前**の schema である。ca105 後の grammar とは
一致しない。修正確認のための 2 本目 live は未承認。

### A2 後続 ca105（本 WIP）

RCA: speech `reactTo` と action-norm `observed_event_kind` は別集合。provider
JSON Schema は `superRefine` を載せず string だった。話しかけは `utterance`。
`direct_address` を event kind に足していない（戦闘事実に存在せず、マッチしない）。

実装: `packages/shared/src/character-norm-clause-v2.ts` で kind ごとの value
enum。create/fill/repair prompt に語彙分離を追加。schemaVersion 2 のまま。

証跡:

- `docs/character-authoring-a2-unregistered-event-kind-rca-2026-09-13.llmthink.dsl`
- `docs/evidence/character-authoring-a2-unregistered-event-kind-rca-2026-09-13.md`
- `docs/evidence/character-authoring-a2-event-kind-local-verification-2026-09-13.md`

## Seal

- CLI: `sealgraph 0.1.0-dev+c23aa34`、repository_format 5
- `init` していない。gitignore 済み `index/` は空ディレクトリを置いただけ
- カーネル実装チェーンは draft（ADR-0031 受入が draft のため）
- 確認して reseal した B4 repository / persistence / postgres smoke / B4 検証
  think・md は CLEAN
- 意図して残した stale: 歴史的 WIP handoff、未確認の B5 action-plan frontier
- セレクタ `adr/0031` は無い。ADR-0031 impact は `acceptance/adr-0031`

## 検証（ca105 時点）

```text
npm test                         exit 0
npm run typecheck                exit 0
A2 --execute 2回目               拒否（result.json 既存）
```

## 再開点

1. この時点ではownerが `ca103`（A3デプロイ）か `cb208`（B8 dual read
   デプロイ）を選ぶ状態だった。その後、ownerは統合A3+B8 Stage候補を選択したため、
   2026-09-14の計画改訂4で`cc301`統合レビュー、`cc303` merge/tag、`cc302`
   単一Stage proofの順へ置き換えた。merge、tag、Stage実行は引き続きそれぞれの
   権限境界を持ち、schema-3とproductionは切らない。
2. A2 修正後の live 再実行は、新しい freeze と別承認が必要。
3. B5 Seal frontier を続けるなら `reasoning/adr-0030-b5-action-plan` を読んで
   要訂正／文面不変／未確認に分類する。下流の一括 reseal はしない。
4. `TurnEvent.type` の `reposition` は observed_event_kind に無い。今回の A2
   不合格原因ではなく、未着手の語彙穴として残っている。

## 境界

- 秘密値（`.env` / API key）はコミットしない
- 本番 character は読んでいない
- カーネルの実 route 配線はしていない
