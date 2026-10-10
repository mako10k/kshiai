# 統合意識の要件・設計案 第1版

## 現在の権限と作業位置

2026-10-10所有者が方向転換と現在地点からのbranch作成を指示。`codex/rc17-release-evidence` の `5221f11d9bd4b68e16b966c8ee276f0ad85ecb31` から `codex/unified-consciousness` を作成。作成前clean、origin同名branchとSHA一致、新branchのremote重複なし。preflightで既存local refsに対応remoteなしを検出。所有者指定の独立した方向転換を理由に再実行し、歴史branch・backup・未完了releaseを保持した。新worktreeなし。

## 所有者指定の要件

- 顕在・潜在の役割を廃止し、一つの意識へ統合する。
- 記憶は優先順位1〜5の配列。指定順位へ挿入し後続を押し下げる。毎回の入力に含め、出力で更新できる。
- 目標・感情・注意対象・行動指針の専用状態を持たず、記憶へ自然文で記す。
- LLMだけが使う意味内容は柔軟にし、機械判断のための不要な分類を増やさない。
- 呼出し回数・入出力・待機を含め経済性を比較する。

## 詳細契約案

[ADR0067 revision2](adr/0067-unified-consciousness-priority-memory.md) D1〜D8と[詳細契約案 第1版](unified-consciousness-contract-v1.md) C1〜C8へ具体化した。記憶操作、同期判断境界、イベント起動、失敗・再実行、上限、保存・新規束縛形式 v6と旧試合互換をレビューする。実測前の数値とモデル候補は受入対象で、runtimeは未変更。

## 責務と検証

意識は本人の知覚に基づく記憶と行為の試みを生成。サーバーは配列操作と構造・参照・実行権限を検証する。記憶本文の意味分類や重要度評価をしない。裁定は世界の成立、実況は確定結果の描写を担当する。自然文フィードバックを使っても内部の失敗receiptや会計は保持する。

比較fixtureは会話応答、負傷、行為の継続と中断、相互作用、誤認の訂正、矛盾する気持ち、無変化の待機。旧意識パイプライン awareness-v5と同条件で測る。成功条件は常時記憶入力・本人間分離・正準所有権・旧試合互換・反応漏れの確認と、calls/token/latencyの実測。目標削減率や料金は未測定。

## Canonical計画

この方向のcanonicalは `docs/unified-consciousness.pert`。旧 `docs/speech-continuity-and-fade-recovery.pert` の完了済み意識パイプライン awareness-v5は歴史的証跡。`docs/adjudication-handoff-repair.pert` の配備未完了は独立した未完了作業であり、本方向の実装・有料実行権限に流用しない。主計画 `docs/plan.pert` から本計画を参照する。

## この文書変更の検証

ADR0067 revision1のLLMTHINK監査clean、PERT document check・precedence/resource両schedule・next成功。次taskはdesign、暫定見積合計10pで実測velocityなし。計画は直列依存で、resource割当による追加制約は未設定。主計画check成功、既存PTDAG-208警告4件。git diff --check成功。

共有生成物が古かった初回のtest/typecheckは失敗し、shared build成功後に再実行した。再実行npm testは811件中809成功・2失敗、実行資格staleの28ファイルはdisabled。失敗は既存のcharacter-definition alias projectionの循環参照とB5 semantic migrationのhistorical v1 payload construction。npm run typecheckはmodel-request-options.tsのreasoning_effort noneとローカルSDK ReasoningEffort型の不一致で失敗。今回runtime sourceは未変更。全体合格・モデル品質・公開反映を主張しない。ローカル診断ログは /tmp/kshiai-unified-tests.log と /tmp/kshiai-unified-typecheck.log。

## 詳細設計完了 2026-10-10

所有者の継続指示に従い詳細契約案 第1版C1〜C8を作成し、ADR0067 revision2へ反映。designを正規perttool start/finishで記録。ADR監査clean、PERT document check・precedence/resource両schedule・next成功。nextはaccept、DESIGNEDのclosureに関するPTDAG-208警告1件を保持。主計画の既存警告4件は変更なし。文書のみのため前回test/typecheck失敗を再実行・合格扱いせず保持した。git diff --check成功。runtime実装はexact revision受入後。

## 実装・検証の追記 2026-10-10

所有者がADR-0067 revision 2と詳細契約 第1版 C1–C8を受け入れ、統合意識パイプライン unified-consciousness-v1 を実装した。[実装・ローカル検証 第1版](unified-consciousness-implementation-v1.md)に現在の境界と検証を記録する。試合束縛形式 v6 を内部で明示選択でき、公開既定と既存試合束縛形式 v5 は保持する。上のruntime未変更・診断失敗は設計時点の履歴であり、現在の検証結果は追記資料を参照する。有料呼出し・本番migration・配備は未実施。

## 全体検証判断の訂正 2026-10-10

所有者の指摘を受け、根拠が古い28ファイルを除外した状態での全体検証完了を撤回した。個別の成功証跡は保持し、公式全体検証は未完了とする。[ADR-0068 revision 1](adr/0068-fail-tests-on-invalid-authority.md)の実行前失敗ゲートへ修正し、canonical PERTのfullVerificationを未着手で追加した。根拠の古いテストを「テスト不要」と扱わない。
