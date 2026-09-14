# 顕在意識 V3 — WIP 引継ぎ

2026-09-10。対象ブランチは
`codex/compact-psyche-repair-integration` である。作業開始時に
`origin/codex/compact-psyche-repair-integration` を fetch し、基点は双方とも
`9cb73b3556d770bdc4da6c252b00326b00778462` であることを確認した。

この WIP は顕在意識 V3 実装そのものを再設計するものではない。未完だった t029 の
ローカル検証記録、ADR 検査の復旧、PERT 文法の整合を固定する。実モデル品質評価、
設定 activation、有料 provider 呼出し、Stage/本番展開、merge は実行していない。

## この WIP に含む変更

- `scripts/check-adrs.mjs` と root の `npm run adr:check` を復元し、現行
  `llmthink dsl audit` の出力を厳格に判定するようにした。既定では ADR-0015 以降を、
  引数指定時は指定された正本だけを検査する。
- `docs/dialogue-expression-realization.pert` の project version を、work event を
  許す `version 6` に訂正し、t029 の検証済み範囲と未解決の手続き境界を記録した。
- バックログと実装計画を、V3 正本への限定 ADR 検査と最終ローカル検証が済んだ一方で
  t029 は active のままである状態に同期した。
- [再開後のローカル検証記録](agency-v3-resume-verification-2026-09-09.md)を追加した。

## 確認済み結果

以下は source を変更した後、shared を先に build して実行した最終結果である。

```text
npm run build --workspace=@kshiai/shared                  exit 0
npm test                                                    exit 0 (709 tests)
npm run typecheck                                           exit 0
npm run build                                               exit 0
npm run static:lizard                                       exit 0
node --import tsx --test backend/src/services/conscious-agency-binding.test.ts \\
  backend/src/services/conscious-agency-persistence.test.ts \\
  backend/src/services/conscious-agency-runtime.test.ts \\
  packages/shared/src/conscious-agency.test.ts \\
  packages/shared/src/psyche-reaction-policy.test.ts        exit 0 (41 tests)
git diff --check                                            exit 0
```

変更した ADR 正本の正式検査も通過した。

```text
npm run adr:check -- docs/adr/0027-unified-conscious-agency-and-psyche-boundary.think \
  docs/adr/0028-versioned-conscious-agency-contract.think  exit 0
perttool document check docs/dialogue-expression-realization.pert
                                                            exit 0, PTDAG-208 warnings 20
```

`npm test` の最初の一回は古い `@kshiai/shared/dist` を backend が参照したため失敗した。
shared build 後の上記成功を最終結果とし、source または契約の失敗として扱わない。
frontend build の 500 kB chunk 警告も既存のままである。

## 未解決の境界（t029 を完了にしない理由）

1. 既定の `npm run adr:check` は未変更の ADR-0015、0016、0017、0019 で exit 1 になる。
   現行 LLMThink が旧 top-level DSL または旧 premise 構文を読めないためである。受理済み
   ADR を検査通過だけのために書き換えない。V3 の ADR-0027/0028 限定検査の成功とは分ける。
2. `.sealgraph/config` は `repository_format = 5` だが、PATH 上の SealGraph
   `0.1.0-dev` は format 4 専用であり `status` / `fsck` を実行できない。format 5 対応の
   source は別ブランチにあるが Go 1.26 が必要で、この環境の Go 1.22.2 では toolchain を
   取得できなかった。`sealgraph init`、format 変換、rebind、reseal、objects/refs の置換は
   行っていない。
3. t030 以降の有料比較は別途の明示承認が必要であり、この WIP はその準備・実行・承認を
   含まない。

## 再開手順

1. format 5 を読める SealGraph バイナリ、または Go 1.26 の利用可能な環境を用意し、まず
   読み取り専用の `status` と `fsck` を実行する。既存 graph を初期化・移行・再登録しない。
2. 旧 ADR DSL をどう検査可能にするかを別の意思決定として扱う。受理済み ADR の意味や
   根拠を検査都合で書き換えず、必要なら ADR/移行方針を先に確定する。
3. その二つの手続き境界が解消した後に t029 の seal/証跡要件を再評価し、完了扱いの可否を
   決める。実モデル比較を始める場合は t030 の契約・費用上限・明示承認を先に用意する。
