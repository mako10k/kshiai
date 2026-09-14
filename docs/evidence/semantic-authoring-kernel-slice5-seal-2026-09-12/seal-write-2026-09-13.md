# 構造化意味オーサリング基盤 — スライス2–5 Seal 記録

- 実施日: 2026-09-13
- Git: `a44b3d4` Complete focused authoring kernel slices 2-5
- CLI: `sealgraph 0.1.0-dev+c23aa34`
- `sealgraph init` / 一括 reseal / route 配線はしていない

## 方針

ADR-0031 受入と D11 設計が draft のままなので、カーネル実装チェーンも draft で継承した。
変更していない `accounting` / `proposal-decoder` と、歴史的 WIP handoff、B4 repository は reseal していない。
sqlite-bootstrap（`backend/src/db.ts`）だけ非 draft のまま内容を更新した。

旧 Cause を残したままだと STALE_DIRECT になる。新 target を足してから歴史的 target を unlink した。

## fsck

`result=ok`。blobs 2526、seals 803、refs 348、unreferenced 0。

## 対象 REF の最終状態

完了済みカーネル実装・公開写像・adapter・repository・slice 5 レビューは `DRAFT` のみ。

意図して残した stale:

- `implementation/semantic-authoring-accounting-v1` と `proposal-decoder-v1`（ファイル未変更、旧 contracts を Cause に保持）
- `implementation/character-semantic-migration-repository`（sqlite-bootstrap 更新の下流、B4 資料は未確認のため未 reseal）
- `verification/semantic-authoring-kernel-wip-handoff-2026-09-11`（歴史的 WIP）
- `verification/semantic-authoring-kernel-foundation-v1` と slice 1 レビューは accounting/decoder 経由の `STALE_TRANSITIVE`
- `plan/character-semantic-migration` は既存 B3–B5 / 設計 Cause 経由の `STALE_TRANSITIVE`

frontier 3 件は上記のうち accounting、decoder、B4 repository。一括 reseal していない。

## Frontier 継続（同日）

本文が HEAD と一致することを確認した入口だけ reseal した。B5 / probe 連鎖には入っていない。

確認して reseal した REF:

- `implementation/semantic-authoring-accounting-v1`（draft、contracts を継承）
- `implementation/semantic-authoring-proposal-decoder-v1`（draft、contracts を継承）
- `implementation/character-semantic-migration-repository`（非 draft、sqlite-bootstrap の追加テーブルは未使用）
- `verification/semantic-authoring-kernel-foundation-v1` と slice 1 レビュー
- `plan/character-semantic-migration` の B4 repository Cause
- `verification/character-semantic-migration-persistence`
- `verification/postgres-runtime-smoke`
- `reasoning/adr-0030-b4-local-verification`
- `evidence/adr-0030-b4-local-verification`

fsck 再読戻し: `result=ok`。blobs 2546、seals 813、refs 348、unreferenced 0。

現在の frontier は `reasoning/adr-0030-b5-action-plan`。B5 資料は未確認のまま残す。
歴史的 WIP handoff も reseal していない。

## 詳細

- `status-after-seal.json`
- `stale-frontier-after-seal.json`
- `fsck-after-seal-summary.json`
- `seal-write-2026-09-13-summary.json`（初回 seal ID）
- `seal-frontier-2026-09-13-summary.json`
- `stale-frontier-after-frontier-reseal.json`
- `fsck-after-frontier-reseal-summary.json`
