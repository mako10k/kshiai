# 顕在意識 V3 — 再開後のローカル検証

2026-09-09。`codex/compact-psyche-repair-integration` を
`origin/codex/compact-psyche-repair-integration` の
`9cb73b3556d770bdc4da6c252b00326b00778462` へ追従させてから、
t029の未完了検証を再開した。この記録は実モデル品質、設定activation、
有料provider、Stage/本番展開、merge、commit/pushの実施を意味しない。

## 実施済み

- `docs/dialogue-expression-realization.pert` は、work eventを使える文法世代の
  `version 6` へ訂正した。`perttool 0.10.5` の
  `perttool document check docs/dialogue-expression-realization.pert` はerror 0で通過した。
  既存のPTDAG-208のclosure提案20件は警告のまま保持した。
- 祖先commit `80a9c796250607ad13318bfa059a6725b5962962` のADR検査を
  現行LLMThink CLIの引数に適合させて `scripts/check-adrs.mjs` と
  `npm run adr:check` として復元した。変更した正本だけを明示指定した
  `npm run adr:check -- docs/adr/0027-unified-conscious-agency-and-psyche-boundary.think docs/adr/0028-versioned-conscious-agency-contract.think`
  はexit 0で、両方ともfatal/error/warning=0だった。
- shared exportsを先に再ビルドしてから、`npm test`、`npm run typecheck`、
  `npm run build`、`npm run static:lizard` がすべてexit 0で通過した。
  frontend buildの500 kB chunk警告は既存のまま。Lizard 1.23.0は
  188 files / 3244 functions、全閾値はbaseline以下だった。
- V3重点回帰（binding、SQLite persistence、runtime routing、closed acceptance、
  reaction policy）の41 testsはexit 0で通過した。`0754ca7..HEAD`のTypeScript差分に
  新たな `any`、二重cast、抑制コメントは検出されず、`git diff --check` も通過した。

`npm test` をshared build前に一度実行した際は、backendが古いshared `dist`を読み、
新exportを見つけられず失敗した。sourceまたは契約の失敗とは扱わず、shared build後の
最終全体test成功だけを本記録の結果とする。

## 残る明示的な境界

デフォルトの `npm run adr:check` は全ADR-0015以降を対象にし、未変更の
ADR-0015、0016、0017、0019でexit 1になる。前者三つは現在のLLMThinkが認識しない
旧top-level DSL、0019は現在のpremise構文に非互換である。受理済み正本を検査通過だけの
ために書き換えず、V3の変更正本に限定した正式チェックと区別する。

保持された `.sealgraph/config` は `repository_format = 5` である。現在PATH上の
SealGraph 0.1.0-devはformat 4専用のため、`status`と`fsck`を実行できない。format 5を
読む実装は `sealgraph` の `codex/cause-derived-revision-links` に存在するが、Go 1.26を
要求し、この環境のGo 1.22.2ではtoolchainを取得できなかった。`sealgraph init`、
format変換、rebind、reseal、既存objects/refsの置換は実行していない。

この二つの手続き上の限界を解決するまでt029はactiveのままとする。旧ADR DSLの移行方針と
format 5対応バイナリの用意は、実モデル比較を開始するt030とは別の作業境界である。
