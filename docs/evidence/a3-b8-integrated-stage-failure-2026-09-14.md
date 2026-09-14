# A3+B8 統合 Stage 実行失敗証跡（2026-09-14）

## 対象と境界

所有者が明示した1回の Stage 実行として、注釈付きタグ `v0.22.0-rc.12`
（commit `afcba30fb08c616eaae470ea16705ba2501433b4`）を対象に GitHub Actions
`Stage release` を起動した。自動再実行、schema 3 activation、本番 traffic への promote は
承認範囲に含めず、実施していない。

## 入力

- run: `34828916788`（attempt `1`）
- `battle_causal_narration_mode=narration_guarded`
- `dialogue_context_projection_override=none`
- `expected_dialogue_projection=compact`
- `e2e_max_advances=24`
- `e2e_provider_operation_ceiling=169`
- `character_create_smoke=true`
- `battle_pacing_policy=current`

## 観測結果

- workflow は `2026-09-14T09:37:00Z` に開始し、`2026-09-14T09:44:51Z` に
  `failure` で完了した。
- release tag と必須 CI の照合、narration task queue の確認、backend image build、
  forward-only migration、無トラフィック Cloud Run revision 配置、LLM を使わない
  narration receipt / provider accounting、Cloud Tasks OIDC delivery、immutable Worker
  version 作成、Stage edge / protected-origin smoke は成功した。
- backend image digest は
  `sha256:dd6bbd02ac3337129e6d112c86af04ec3f5ab2b0ac7fcb4f75c8120a30b496b7`。
- Cloud Run revision は `kshiai-api-00143-suz`。workflow log はこの revision が
  traffic の `0 percent` を受ける状態であることを記録した。
- Worker version は `a45af829-5ff1-4c80-ac63-dfff9d250596`、preview URL は
  `https://a45af829-kshiai-web.mako10k.workers.dev/`。workflow log は production
  traffic への deploy が別操作であることを示しており、その操作は実施していない。
- Stage edge / protected-origin smoke は上記 preview URL に対して成功した。
- `Verify email auth mapping and SSE through staging` で Cloud Run Job
  `kshiai-auth-smoke-dg59l` が失敗し、workflow は exit code 1 となった。
- dialogue-bound battle、R2 構成・credential・public media 検証、immutable Stage
  evidence の生成・upload は skipped。run artifact は `0` 件だった。

## 未確認事項と因果状態

- GitHub Actions log は Cloud Run Job の container error を含まず、失敗した内部操作は
  未確認である。
- smoke 実装では A3 character create が後続の V2/V3 read と SSE より先に実行されるが、
  Cloud Run Job log を取得できていないため、A3 create が開始したか、provider HTTP attempt
  が発生したか、その回数と金額は不明である。
- ローカルからの read-only `gcloud run jobs executions describe` は既存認証の再認証要求で
  失敗した。ログイン、account 切替、credential 変更は行っていない。
- root cause: 未確定。
- contributing cause: 未確定。
- escape / detection cause: 未確定。workflow が当該 smoke failure を検出して後続処理を
  停止したことだけを確認した。
- corrective action / recurrence prevention: 原因証跡がないため未決定。

この整理は `/tmp/kshiai-cc302-stage-failure.think` を command-line `llmthink dsl audit`
で監査し、fatal `0`、error `0`、warning `0` を確認してから採用した。

## Claim / Evidence / Action

- `C-A3B8-ST-001`（高）: exact tag の Stage 配置は途中まで成功したが、統合 Stage proof
  全体は不合格であり、`cc302` の完了条件を満たさない。
  - `E-A3B8-ST-001`: run `34828916788` の conclusion は `failure`。
  - `E-A3B8-ST-002`: auth/SSE step が failure、battle・R2・artifact step が skipped。
- `C-A3B8-ST-002`（高）: production traffic promote と schema 3 activation は行っていない。
  - `E-A3B8-ST-003`: Cloud Run revision は `0 percent` traffic、Worker は immutable version
    upload と preview smoke までで、production deploy step は存在せず実行していない。
- `C-A3B8-ST-003`（高）: 現在の証跡から失敗原因や A3 provider 使用量は断定できない。
  - `E-A3B8-ST-004`: GitHub log は Cloud Run Job failure の外形のみで、container log はない。
  - `E-A3B8-ST-005`: ローカル read-only gcloud は再認証要求により取得不能だった。
- `A-A3B8-ST-001`（実行済み）: 承認された workflow を1回だけ dispatch し、run と成果物を
  読み戻した。
- `A-A3B8-ST-002`（未実施）: retry、修正、production promote、schema 3 activation。
- `A-A3B8-ST-003`（次の限定調査）: 有効な既存 GCP 認証で
  `kshiai-auth-smoke-dg59l` の container log を read-only 取得し、最初の失敗操作と A3
  provider attempt の有無を確定する。

## 参照

- GitHub Actions: https://github.com/mako10k/kshiai/actions/runs/34828916788
- Cloud Run execution: `kshiai-auth-smoke-dg59l`
