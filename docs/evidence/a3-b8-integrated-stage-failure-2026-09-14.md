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
- 再認証後の service readback でも `kshiai-api-00143-suz` に percent はなく、
  既存 revision `kshiai-api-00141-vis` が `100 percent` のままだった。新 revision は
  Ready / Active / ContainerHealthy で image digest も workflow 出力と一致した。
- Worker version は `a45af829-5ff1-4c80-ac63-dfff9d250596`、preview URL は
  `https://a45af829-kshiai-web.mako10k.workers.dev/`。workflow log は production
  traffic への deploy が別操作であることを示しており、その操作は実施していない。
- Stage edge / protected-origin smoke は上記 preview URL に対して成功した。
- `Verify email auth mapping and SSE through staging` で Cloud Run Job
  `kshiai-auth-smoke-dg59l` が失敗し、workflow は exit code 1 となった。
- 再認証後に同 execution の container log を read-only 取得した。A3 create の
  provider HTTP attempt は2回で、`xai/generateCharacter` は `grok-4.5` で成功、
  `xai/generateCharacterDefinitionV2` は `grok-4.5` で
  `Expected double-quoted property name in JSON at position 1628` により失敗した。
  bounded execution interval に retry log はなく、SDK の `maxRetries` も `0` である。
- dialogue-bound battle、R2 構成・credential・public media 検証、immutable Stage
  evidence の生成・upload は skipped。run artifact は `0` 件だった。

## 未確認事項と因果状態

- direct failure mechanism: provider 応答を network boundary の `JSON.parse` が拒否し、
  A3 create attempt が `failed` になった。provider router は `reason=other` と分類し、
  fallback を行わなかった。
- trigger: `generateCharacterDefinitionV2` の応答が構文上有効な JSON ではなかった。
- root cause: provider 側で不正 JSON が生成された機構は、raw response と provider 側説明が
  保存されていないため未確定。モデル出力そのものを terminal root cause とはしない。
- contributing cause: parse error を終端とし、429/503 以外を再試行・provider fallback
  しない既定方針により、この run は停止した。ただしこれは受入済み方針どおりの動作であり、
  code defect とは判定していない。
- escape / detection cause: なし。workflow は不正候補を acceptable とせず、battle、R2、
  evidence 作成前に停止した。
- provider HTTP attempt は2回。token usage と dollar cost はログにないため不明。
- corrective action: parse/retry方針を無断で変更せず、`cc302` を未完了のまま保持する。
- recurrence prevention: syntax repair または parse-error retry の導入は、意味変更リスクと
  受入済み terminal-error policy の変更を伴うため、この失敗だけからは採用しない。

初回の未確定整理は `/tmp/kshiai-cc302-stage-failure.think`、再認証後の因果分類と
次アクションは `/tmp/kshiai-cc302-stage-failure-rca.think` を command-line
`llmthink dsl audit` で監査し、いずれも fatal `0`、error `0`、warning `0` を
確認してから採用した。

## Claim / Evidence / Action

- `C-A3B8-ST-001`（高）: exact tag の Stage 配置は途中まで成功したが、統合 Stage proof
  全体は不合格であり、`cc302` の完了条件を満たさない。
  - `E-A3B8-ST-001`: run `34828916788` の conclusion は `failure`。
  - `E-A3B8-ST-002`: auth/SSE step が failure、battle・R2・artifact step が skipped。
- `C-A3B8-ST-002`（高）: production traffic promote と schema 3 activation は行っていない。
  - `E-A3B8-ST-003`: Cloud Run revision は `0 percent` traffic、Worker は immutable version
    upload と preview smoke までで、production deploy step は存在せず実行していない。
  - `E-A3B8-ST-003A`: 再認証後の service readback は既存 revision `00141-vis` が
    `100 percent`、Stage revision `00143-suz` が `0 percent` であることを示した。
- `C-A3B8-ST-003`（高）: A3 provider attempt は2回で、2回目の JSON parse failure が
  直接の停止機構である。provider 側の生成機構と金額は不明である。
  - `E-A3B8-ST-004`: container log は最初の call の成功と2回目の parse failure を記録した。
  - `E-A3B8-ST-005`: SDK `maxRetries=0`、application retry は429/503限定で、該当時刻帯に
    retry log はない。
- `A-A3B8-ST-001`（実行済み）: 承認された workflow を1回だけ dispatch し、run と成果物を
  読み戻した。
- `A-A3B8-ST-002`（未実施）: retry、修正、production promote、schema 3 activation。
- `A-A3B8-ST-003`（実行済み）: 再認証後に `kshiai-auth-smoke-dg59l` と exact revision の
  log を read-only 取得し、失敗操作と provider attempt 数を確定した。
- `A-A3B8-ST-004`（別判断）: 同一 tag・入力・上限で full Stage workflow をもう1回実行する。
  新しい有料A3 call、Stage deploy/migration、失敗時の再試行なしを明示して別途承認を得る。

## 参照

- GitHub Actions: https://github.com/mako10k/kshiai/actions/runs/34828916788
- Cloud Run execution: `kshiai-auth-smoke-dg59l`
