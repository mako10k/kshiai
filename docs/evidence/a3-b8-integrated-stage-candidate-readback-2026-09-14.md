# A3+B8 統合 Stage 候補 readback（2026-09-14）

## 境界

この記録が示すのは、A3 と B8 を同一の Stage 候補としてレビューできる
ローカル実装と検証までである。Stage 配備、schema 3 の有効化、current
generation pointer の移動、生成候補の受入、本番昇格は実施していない。

## Claim / Evidence / Action

- `C-A3B8-001`（高）: historical V2 と new V3 は、保存済み generation ID
  から schema version と content digest を検証して別々に読める。V3 は必要な
  battle compiler capability を投影し、legacy sheet へ変換しても運用フィールドを
  保持する。
  - `E-A3B8-001`: `character-generation-reader.ts` と単体テスト。mixed
    storage/envelope version と digest drift は拒否される。
- `C-A3B8-002`（高）: B8 Stage probe は一時 V2 を current としたまま V3 を
  非 current generation として追加し、両方を保存層から読み、migration work を
  provider request 0 件で再開できる。
  - `E-A3B8-002`: SQLite integration test は current schema version 2、migration
    attempt 1 件、provider request 0 件を確認した。
- `C-A3B8-003`（中）: A3 Stage smoke は明示的に `true` を選んだ場合だけ、空の
  一時 owner で V2 character create を API へ一度要求し、受入可能性を検証後、
  activate/confirm せず discard を readback する。
  - `E-A3B8-003`: workflow contract test、既存 create route acceptance test、
    provider attempt ceiling 30 の実行時 gate。実 provider を用いた Stage 実行は
    未実施なので確信度は中に留める。
- `C-A3B8-004`（高）: ローカル候補は全体回帰 gate を通過した。
  - `E-A3B8-004`: `npm test` は shared 349、backend 437、frontend 20、
    deployment 3、release 5、合計 814 test が成功。
  - `E-A3B8-005`: `npm run typecheck`、`npm run build`、`npm run static`、
    `git diff --check` が成功。build の既存 chunk-size warning は残る。
  - `E-A3B8-006`: `npm run adr:check` は exit 0。ADR-0015/0016/0017/0019 の
    既存 DSL/acceptance 警告は今回の変更外であり、ADR-0030/0031 は clean。

## 保留 Action

- `A-A3B8-001`（実行済み）: 統合候補の実装、監査、ローカル readback。
- `A-A3B8-002`（保留）: remote 更新を再確認し、候補を commit/push/PR として
  固定する。
- `A-A3B8-003`（要 owner 判断）: merge/tag 後、Stage workflow を
  `character_create_smoke=true` で実行する。A3 は API request 1 回、provider HTTP
  attempt の保守的上限 30、実費不明。一時データは discard と cleanup の対象。
- `A-A3B8-004`（対象外）: schema 3 有効化、production pointer 移動、本番昇格。
