# vt104 WIP引継 — 2026-09-30

- 中断: 2026-09-30T21:13:21+09:00
- 所有者指示: 「今日は帰ります。作業中断。引継資料作成、WIPコミット、プッシュ で終了としましょう。」
- 継続先: `/home/katsumata-m/.codex/worktrees/cc304-focused-revise-kshiai`、`codex/cc304-focused-revise`
- 中断前HEAD: `f58ac2f6e676f9eab486c98787908ee69f7bc60f`。この引継を含むWIP commitは後続。プッシュ先は同名origin branch。

## 再開時の最優先前提

所有者の最新明示: 互換性・既存データ維持は基本方針として後回し。マイグレーション延期はその具体例。本番/Stageは一体で未リリース。メール認証も後回し。環境名productionだけで既存顧客・SLA・保全の必須性を推定しない。

[要件v3](../character-v3-battle-cutover-requirements-v3.md)と[計画再修正](vt104-unreleased-trial-rescope-2026-09-30.md)を現行方針として読む。Googleログイン→自分のキャラクター→Neva/RioのV3対戦進行・再読込・結果を優先。保全/snapshot/復旧/旧版互換性を初回試行の前提へ戻さない。全DB/Googleユーザ削除の許可には読み替えない。

## 今回の計画再修正は途中

実施済み: 要件v3、owner policy/監査、ADR0042の具体実装方向候補（Proposed）、子PERT projectとvt104–vt108のscope/source/resource/一部estimate、旧execution/workflow/smoke資料に現行方針への注記。

未実施: 子milestone VST_CUTOVERのdescription、gate vg108のreason、親csm001/cc314のscope/rollup更新。ここは旧finished履歴保持・snapshot/八smoke前提が残っており、最新owner方針との不整合である。中断指示後に通常開発を再開しないため、そのままWIPとして保存した。

二つのCLI失敗を区別する:
- vt104 estimate変更previewがPTACT-103で拒否。歴史的start planned_value1pとの不一致。実績を書き換えず、vt104 duration1pを保持してscopeだけ更新した。内部残工数0.5–1.5hは別の概算。
- milestone setは--actorを未サポートとしてpreviewで拒否。milestone/gate/親更新はそれ以降未適用。task/project更新は既に標準preview→digest guarded writeで適用済み。

再開時はcurrent CLI helpを確認し、milestone setで対応している引数だけを使う。要件v3を根拠に残るmilestone/gate/親の記述を標準CLIで追従し、child/parent document check・dag analyze --schedule both・dag nextを再実行する。履歴を消したりvalidationを直接DSL上書きで迂回しない。

## ローカル実装と証拠

cutover core・限定Stage adapters、Supabase共通verifier、PG/R2/HTTP/V3 SSEのローカル試験がWIPにある。直近source555 paths aggregate `6a7e05dbaf89c3f637305ddd5245ed474bab53cdb6d743140fbe1308c49a954d`、implementation Seal `24b2f5a035a699c2e2236ef6d901f0dc6c554b9075d99627195be79a3fc328ce`。これらは旧詳細設計に対する実装証拠であり、新しい要件v3へのconformanceではない。

[validation JSON](vt104-stage-smoke-local-validation-2026-09-30.json)に直近選定npm test206/206、typecheck/build、deployment3、PGcontrol3、PGadapter実行、auth CLI/Hono SSEの範囲を記録。active37/provisional2/disabled141の選定試験であり全repository/実Stage完走ではない。このcloseoutではコード変更を追加せず、再実行はしていない。

既存adr:checkはADR0039にACCEPTANCE markerがないため失敗している。owner受入記録は存在する。今回のADR0042はCLI監査成功、Proposedであり、新しい詳細の受入を捏造しない。旧Accepted理由本文・Seal履歴は保持し、旧Sealから新方針を導けると主張しない。

PG17の隔離serverは停止済み。実Stage V3試行は未実行。cloud停止/DB削除/migration/配備/promotionは行っていない。workflowの変更も未実装。

## secdatと機密

owner指示のage鍵登録は完了済み。main kshiai domainのsnapshot-recovery storeにprivate identity/public recipientを登録、独立recipient/roundtrip/fsck v2確認。private keyはrepository/ログ/平文鍵fileへ保存していない。public receiptは[登録記録](vt104-owner-key-secdat-registration-2026-09-30.json)。鍵は保管済みのまま、snapshot実施を初回試行のgateにしない。鍵再生成scriptを再実行しない。

GitHubはmain worktree domainのsecdat secret-only GH_TOKEN経由。新しいdomain/認証identityを作らない。コミット対象に.env/secret keys/DB/distを含めない。今回チェックはパターン検出であり、あらゆる秘密不在の数学的保証ではない。

## 目的と残工数

計画再修正の残りはmilestone/gate/親追従と再解析、0.15–0.5 agent h（低）。これはvt104残0.5–1.5hの内数。
vt1040.5–1.5h、cc314/Stage1.75–5h、csm0014.75–12h、いずれもagent概算・低確度。親は子1.75–5 + 後続3–7。外部承認/owner操作待ちは別で全体終了日未定。実Stage可用価値は未達。

vt103の再観測velocityは25p/17h（2p/declared elapsed1.36h、1標本）。person effortなし、運用/計画変更へ直接換算しない。vt104はsuspendedのまま、最新中断前に新しいresume eventは記録していない。この計画修正の完全なactive effortは未測定であり実績へ捏造しない。再開の実時刻からtask resume/次のcheckpointを記録する。

## 次の行動

1. 最新owner方針にmilestone/gate/親を追従して計画修正を完了する（上記0.15–0.5h、低）。
2. vt104で既存workflow/controlの最小接続候補を詳細化し、Google/V3実経路だけを通すfile set・試験出口・配備対象を示す（vt104残の内数）。具体設計の未決事項だけをownerへ提示する。
3. 許可された実装・配備・旧未完了処分・owner登録・実対戦の順に、正本DAGと権限を確認して進める。

本日の作用は引継・WIPコミット・同名branchへのpushまで。merge/release/配備や共有workday stop/endは含めない。
