# 構造化意味オーサリング基盤 — スライス5統合レビュー

- 実施日: 2026-09-12
- 対象: PERT `cb207`（Kernel slice 5: integration review）
- ブランチ: `codex/compact-psyche-repair-integration`
- 判定: **PASS**。テスト・型・ビルド・静的解析・ADR-0031 指定検査は成功。Sealgraph は互換 CLI で fsck / stale / impact を完走した。全件 ADR 検査の歴史的失敗（0015 / 0016 / 0017 / 0019）と既存 stale は残件として記録し、自動 init / repair / 一括 reseal はしていない。
- PERT `cb207` は本記録を根拠に done、`cm207` は reached とする。

## 範囲

ADR-0031 D1–D9 と実装設計スライス1–4の接続を追跡した。実 authoring route の配線・activation・provider 実行はしていない。`backend/src/routes.ts` に `/answers` / `/retries` は無い。

## ADR-0031 追跡

| 条項 | 実装の所在 | 所見 |
| --- | --- | --- |
| D1 薄いカーネル | `orchestration.ts`, `ports.ts`, `adapters/` | カーネルは scheduling / transaction / progress / termination。character path は adapter 内。 |
| D2 型付き契約 | `packages/shared/src/semantic-authoring.ts` | 内部は TS 値。`unknown` は decoder 入口。live review base に `z.unknown()` は無い。 |
| D3 焦点付き capability | `capability-session.ts` | session 上限、revoke、query と mutation の分離。 |
| D4 トランザクション適用 | `kernel.ts`, character adapter | revision mismatch と stage reject は trusted を保持。repair は adapter 計算閉包。 |
| D5 Q&A 五条件 | orchestration + public mapping | 内部 `needs_owner_answer` は公開 `failed` + `AUTHORING_OWNER_ANSWER_REQUIRED` + 厳格 `OwnerInteractionV1`。 |
| D6 インメモリ scratch | kernel state + durable ports | 再開は新 attempt。durable は fence 付き。 |
| D7 有限政策 | `accounting.ts`, policy V1 | 数値上限は設計どおり。timeout は予約全額課金。 |
| D8 進捗/サイクル | `progress-monitor.ts` | 4+3 stall、cycle、回復1回。 |
| D9 閉じた結果 | resolver kinds + public mapping | 内部3種。cancelled/expired は run status。公開 status 列挙は増やしていない。 |

## 検証コマンド

```text
npm test                         exit 0
  shared 346 / backend 429 / frontend 20 / deployment 3 / release 5
  合計 803、fail 0
npm run typecheck                exit 0
npm run build                    exit 0（Vite の既存 large-chunk 警告あり）
npm run static                   exit 0（jscpd + lizard baseline 維持）
node scripts/check-adrs.mjs \
  docs/adr/0031-focused-structured-semantic-authoring-kernel.think
                                 exit 0、projection status=Accepted
npm run adr:check                exit 1
  0015 / 0016 / 0017 / 0019 は歴史的構文・受入表記。今回未変更。B5 と同じ残件。
  0024–0031 の指定検査は clean。
```

`routes.ts` は answer/retry mapper を import していない。

## Seal

`.sealgraph/config` は `repository_format = 5`。最初の試行では CLI `sealgraph 0.1.0-beta.6` が format 5 を読めず、`unsupported or malformed config` で失敗した。`sealgraph init` も repair もしていない。

owner が CLI を `sealgraph 0.1.0-dev+c23aa34` に更新したあと、gitignore 済みの空ディレクトリ `.sealgraph/index/`（および cache / logs / locks / tmp）を作成して read-only 検査を完走した。これは init ではない。

| コマンド | 結果 |
| --- | --- |
| `sealgraph fsck --format json` | `result=ok`。blobs 2386、seals 762、refs 324、unreferenced 0、historical_or_detached 175 |
| `sealgraph status --format json` | 324 REF。`SEALED_STATE_CLEAN` 137、`DRAFT` 91、`STALE_TRANSITIVE` 88、`STALE_DIRECT` 16 |
| `sealgraph stale --frontier --scan` | 3 REF、すべて `STALE_DIRECT`：`reasoning/adr-0030-b5-local-verification`、`reasoning/semantic-migration-v4-fragment-guard-verification`、`reasoning/semantic-migration-v4-grounding-verification` |
| `sealgraph impact --all-paths acceptance/adr-0031` | exit 0。source seal `1d185fac5011…`、downstream 23 REF |

セレクタ `adr/0031` は存在しない（`REF not found`）。ADR-0031 の impact は `acceptance/adr-0031` で取る。

ダンプは `docs/evidence/semantic-authoring-kernel-slice5-seal-2026-09-12/`。status / stale-all の生 JSON は数十 MB あるため要約だけ残した。`fsck.json`、`stale-frontier.json`、`impact-acceptance-adr-0031.json` は生の成功出力。

既存 stale は一括 reseal していない。frontier 3 件は B5 / semantic-migration-v4 の検証 REF であり、今回のカーネル実装を壊している証拠ではない。stale は検証対象であり、ゼロ stale は cb207 の完了条件ではない。

## 後続

- 実 route 配線は別ゲート（B8 / `cb208` 以降）。
- 既存 stale の個別 reseal は owner 判断。一括 reseal はしない。
- 全件 `adr:check` の 0015 / 0016 / 0017 / 0019 は歴史的残件のまま。
