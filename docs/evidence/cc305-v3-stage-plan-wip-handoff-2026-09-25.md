# 初回 V3 Stage 試行 計画修正 WIP 引継ぎ — 2026-09-25

## 継続対象と確定した範囲

- リポジトリ: `mako10k/kshiai`。継続ブランチ: `codex/cc304-focused-revise`。計画修正コミット: `457f82c940952c413a94620f045f600d5ac3dd60`。確認した remote main: `c526972d289d46146b02d37a31d15e35efcccc80`。
- 所有者の初回 Stage 試行は、新規 V3 キャラ Neva と Rio の V3-only 対戦。V2–V3 混在と V2→V3 移行は初回試行の範囲外。後続の移行一件は `cc316` として残す。
- 今回の計画修正は `docs/character-semantic-migration-plan-revision-11.md`、正本 `docs/character-semantic-migration.pert`、委任子計画 `docs/character-v3-stage-trial.pert` に反映済み。`CS_STAGE_TRIAL R2` は実 Stage プレイと両 V3 revision の固定を要求する。旧移行経路の `cc305` レビューは別の履歴文書へ移し、現行レビューを作り直した。

## 現在地と再開位置

- `cm317` / `VST_LOCAL_CANDIDATES` が示すのは、別の `codex/v3-stage-trial-candidate` worktree の `77ed6a0` に Neva と Rio のローカル fixture があることだけ。現在の継続ブランチへ実装は未統合であり、登録・内容受入・Stage 操作・所有者プレイは未実施。
- `vt102` は同じ別枝で suspended の部分 WIP。V4 battle binding の一部はあるが、regular turn、reflect、retry/reload、aftermath、narration/presentation を通した完全試合の証拠がない。別枝の ADR-0032 と現行枝の ADR-0032 は identity が衝突する。コード、ADR、Seal の丸ごと merge/cherry-pick は行わず、現在の受入済み根拠と差分を照合して必要な変更だけを統合する。
- 現行主計画の `cc305` も suspended。旧 20:59:22 開始・21:04:54 中断 event は旧移行経路のレビュー時刻として保持し、新しい V3-only `cc305` の完了には数えない。`dag next` の主計画に開始推奨はなく、子計画は `vt101` を開始候補とするが、現在適合と別枝との統合範囲を確認してから実行する。
- 再開時はこのブランチと二つの PERT を読み、`docs/evidence/cc305-stage-candidate-review-2026-09-25.md` を参照する。最初の具体的な判別は、Neva/Rio fixture と `vt102` WIP が現行受入済み要件・ADR とどこで一致/衝突するかをファイル単位で照合すること。これが `vt101` 登録・選択と `vt102` V4 全経路の統合方法を決める。

## 見積り・検証・権限

- 子計画 `vt101`–`vt107` の残計画値は13p、DEV 一名の resource schedule も13p。主計画 `cc314` はこの13pを一度だけ集約し、`cc305` は別に1p。後続 `cc316` は旧見積り由来の仮1p。主計画の残りは25p。
- `3p/1d` は同一日完了の短いローカル3 task（`cc311`、`cc312`、`cc315`）の perttool 観測値で、Stage作業の実測ではない。条件付き内部予測は初回試行約4.7実働日、最終内部作業約8.3実働日。2026-09-28から平日一名・祝日なし・外部待ちなしならそれぞれ10月2日頃、10月8日頃。外部承認、配備、所有者プレイの日付は含まない。次の完了taskで再観測する。
- 二つの `perttool document check`、`dag analyze --schedule both`、`dag next --format json` は成功。`git diff --check` と今回の scope/依存 assert も成功。アプリコードは今回変更していないため、アプリテストの新しい合格は主張しない。
- 今回の WIP は計画と引継ぎのみ。tag、PR、merge、release、provider call、Stage/production 配備、データや pointer 書込み、所有者受入は未実施。それぞれ別権限と exact identity の確認を要する。
