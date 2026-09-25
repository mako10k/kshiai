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

## 承認済み再実行

初回失敗を記録・同期した後、所有者が同一タグ・同一入力での full Stage workflow
再実行を1回だけ承認した。この承認に基づき run `34832214571`（attempt `1`）を起動した。
3回目の実行、自動再実行、仕様変更、本番 promote は承認範囲に含まれない。

### 2回目の観測結果

- workflow は `2026-09-14T10:15:00Z` に開始し、`2026-09-14T10:22:50Z` に
  `failure` で完了した。
- exact tag / commit と workflow 入力は初回と同じだった。release tag と必須 CI、
  task queue、backend build、migration、無トラフィック revision 配置、LLM を使わない
  smoke、Worker version、Stage edge / protected-origin smoke は再び成功した。
- backend image digest は
  `sha256:60bcd06e36b7050d22501ea9ed61407ae23b1165585fb0f1e534b17b42cf1fc6`、
  Cloud Run revision は `kshiai-api-00144-hir`、Worker preview URL は
  `https://9b1ea527-kshiai-web.mako10k.workers.dev/` だった。
- service readback で `kshiai-api-00144-hir` は Ready / Active / ContainerHealthy だが
  percent を持たず、既存 revision `kshiai-api-00141-vis` が `100 percent` のままだった。
- `Verify email auth mapping and SSE through staging` の Cloud Run Job execution
  `kshiai-auth-smoke-cd2l6` が失敗した。
- exact revision log では `xai/generateCharacter` が `grok-4.5` で成功
  （38133 ms）し、`xai/generateCharacterDefinitionV2` が同モデルで
  `Expected double-quoted property name in JSON at position 1407` により失敗
  （71967 ms）した。provider HTTP attempt は2回で、retry log はなかった。
- dialogue-bound battle、R2 検証、immutable evidence upload は再び skipped、run artifact は
  `0` 件だった。

## 未確認事項と因果状態

- direct failure mechanism: 独立した2回の run で、provider 応答を network boundary の
  `JSON.parse` が拒否し、A3 create attempt が `failed` になった。どちらも最初の
  `generateCharacter` は成功し、2回目の `generateCharacterDefinitionV2` が異なる位置の
  JSON 構文エラーで失敗した。
- request contract: 対象 call は `response_format.type=json_schema`、`strict=true` を送り、
  事前に local `$ref` の循環・解決を検査する。現在の schema をローカル生成して確認した
  最大値は object properties `14`、`maxItems=24`、`maxLength=1600` で、複数 subschema の
  `allOf` と `pattern` はなかった。serialized schema は約75265 bytes、走査した object node は
  639だが、確認した xAI 文書にはこの2つの総量上限は記載されていない。
- provider contract: xAI の Structured Outputs 文書は、対応 schema feature を使う場合は
  schema 適合を保証し、Draft-07 と非循環参照を受理すると説明する。観測された構文不正は
  この説明と整合しない。ただし、request 全体とモデル固有の未記載制約がないことまでは
  確定していない。
- root cause: 2回とも structured-output endpoint が `JSON.parse` 不能な content を返した
  境界上の生成機構は再現した。異なる位置での失敗により、同一の固定不正byte列だった可能性は
  低い。一方、raw response、response digest、request ID、finish reason、provider側説明を
  保存していないため、provider内部またはrequestとの相互作用にある深い原因は未確定。
  モデル出力そのものを terminal root cause とはしない。
- contributing cause: parse error を終端とし、429/503 以外を再試行・provider fallback
  しない既定方針により、この run は停止した。ただしこれは受入済み方針どおりの動作であり、
  code defect とは判定していない。
- escape / detection cause: なし。workflow は不正候補を acceptable とせず、battle、R2、
  evidence 作成前に停止した。
- provider HTTP attempt は各 run 2回、合計4回。token usage と dollar cost はログにないため不明。
- corrective action: parse/retry方針を無断で変更せず、`cc302` を未完了のまま保持する。
- recurrence prevention: 3回目の同一実行は行わない。syntax repair、parse-error retry、
  model/provider route 変更はいずれも現在の受入済み境界を変えるため無断では採用しない。
  次の再開点は、生成内容を不用意にログへ残さずに rejected response と provider 診断を
  識別できる有界再現または観測設計を決めることである。

初回の未確定整理は `/tmp/kshiai-cc302-stage-failure.think`、再認証後の因果分類と
次アクションは `/tmp/kshiai-cc302-stage-failure-rca.think`、2回目失敗後の分類は
`/tmp/kshiai-cc302-two-failures-rca.think` を command-line `llmthink dsl audit` で監査し、
すべて fatal `0`、error `0`、warning `0` を確認してから採用した。

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
  新しい有料A3 call、Stage deploy/migration、失敗時の再試行なしを明示して別途承認を得た後、
  run `34832214571` として1回だけ実行済み。
- `C-A3B8-ST-004`（高）: 2回目も同じ operation が異なる位置の JSON 構文エラーで失敗し、
  `cc302` の完了条件を満たさなかった。
  - `E-A3B8-ST-006`: run `34832214571` の conclusion は `failure`、artifact は `0` 件。
  - `E-A3B8-ST-007`: exact-revision log は最初の call の成功と2回目の parse failure を記録した。
  - `E-A3B8-ST-008`: production service は既存 revision `00141-vis` が `100 percent` のまま。
- `A-A3B8-ST-005`（未実施）: 3回目の run、retry/repair/model route の変更、新しい release
  candidate、production promote、schema 3 activation。

## 参照

- GitHub Actions: https://github.com/mako10k/kshiai/actions/runs/34828916788
- Cloud Run execution: `kshiai-auth-smoke-dg59l`
- GitHub Actions rerun: https://github.com/mako10k/kshiai/actions/runs/34832214571
- Cloud Run rerun execution: `kshiai-auth-smoke-cd2l6`
- xAI Structured Outputs: https://docs.x.ai/developers/model-capabilities/text/structured-outputs
