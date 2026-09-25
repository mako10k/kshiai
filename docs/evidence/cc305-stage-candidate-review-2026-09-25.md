# cc305 一件 Stage 試行候補レビュー（2026-09-25）

## 結論

`cc305` のローカルレビュー基準は `3fffb16`、比較先は
`origin/main=c526972d289d46146b02d37a31d15e35efcccc80` である。次の未使用タグ名は
`v0.22.0-rc.13` だが、現時点のコードには移行済み V3 generation を Stage の
実バトルへ結ぶ実行経路がない。このため、`v0.22.0-rc.13` の exact commit は未確定で、
tag、Stage revision、provider 実行、候補受入、pointer 変更は行わない。

旧 `codex/v3-stage-trial-candidate` は、手製 V3 キャラクター二体を使う別目的の WIP で、
正確な V2 source 一件の移行を求める現行 `CS_STAGE_TRIAL` を満たさない。旧 ADR-0032
identity も現行履歴と衝突するため、commit、ADR、Seal、fixture は候補へ取り込まない。

## 現行経路の readback

| 境界 | 観測 | 判定 |
| --- | --- | --- |
| release identity | package version は `0.22.0`、最新注釈付き tag は `v0.22.0-rc.12` | 次の名前は `v0.22.0-rc.13`。exact commit は未確定 |
| Stage deploy | `.github/workflows/stage-release.yml` は exact tag を検査し、Cloud Run revision と Worker version を無トラフィックで作る | 既存の revision identity/readback は再利用可能 |
| focused provider | `backend/src/llm/semantic-authoring-provider.ts` は endpoint、model、pricing identity、単価、transport/worker policy の明示設定を要求する | Stage workflow はこれらを入力・secret・env として渡しておらず route は未確定 |
| migration start | `POST /api/characters/:id/upgrade` は current V2 generation と `battle-mechanics@3` capability を固定できる | exact Stage character/source generation は未選択 |
| owner acceptance | `enableCharacterMigrationAcceptanceTrial` が true の時だけ focused V3 append と current pointer CAS が可能 | `backend/src/index.ts` は指定せず既定 false。Stage で受入不能 |
| battle selection | `getReadyCharacterGeneration` と `startBattle` は current generation を V2 として読む | current V3 を実バトルへ bind できない |
| rollback | 受入前は source pointer が不変で attempt を破棄できる | 受入後に V3 から exact V2 source へ戻すレビュー済み CAS route はない |

Stage workflow は production と同じ `kshiai-database-url` secret を使う。したがって、
既存データを「Stage source」と推定したり、本番 V2 を無断で試行対象にしたりしない。
既存 auth smoke の一時キャラクターは workflow 内で cleanup され、現行のままでは後続の
移行・実バトルまで保持される exact source ではない。

## provider と予算

現行の focused execution policy が機械的に課す上限は次のとおり。

- 同時 provider request: 1
- LLM call: 最大 8
- counted step: 最大 48
- 一回の input: 6,000 token / 24,576 byte
- 一回の output: 1,500 token / 6,144 byte
- 累積 input/output: 32,000 / 8,000 token
- 累積予約費用: 500,000 micro USD（0.50 USD）
- transport recovery: 現行実装では 0

これはコード上限であり、実行許可ではない。Stage 用 endpoint、model、pricing identity、
input/output 単価、transport timeout、worker lease と実支払上限は未決定である。ambient の
通常 battle provider や旧 A3 の `xai/grok-4.5` を focused route として自動採用しない。

## 一件試行を開始できる条件

次の値を一つの候補として固定し、実行直前に readback できること。

1. merged release commit、注釈付き tag `v0.22.0-rc.13`、必須 CI 成功。
2. 専用所有者の一時 V2 character ID、source generation ID、content digest。試行完了まで
   cleanup せず、本番 character/pointer を使わない。
3. focused provider の endpoint、model、pricing identity、単価、timeout、上限
   0.50 USD、call 上限 8、再試行 0。
4. Stage に限り migration acceptance を有効にする revision-local 設定。
5. V3 current generation を capability 検査して battle manifest へ immutable bind する経路。
6. accept 前の source pointer、accept 後の V3 pointer、battle bound generation、旧 generation
   と既存 battle の readback、および一時データ cleanup 手順。

## stop と rollback

source identity/digest、expected pointer、provider/model/pricing identity、予約費用、release
commit、Cloud Run revision、Worker version の不一致では provider call や pointer write の前に
停止する。timeout、HTTP failure、invalid proposal、予算枯渇、candidate digest 不一致、CAS
失敗では自動再試行しない。battle が exact V3 generation を bind しない、旧 generation または
履歴 battle が読めない場合も成功扱いしない。

accept 前の停止では current V2 pointer を維持して attempt を破棄する。accept 後の rollback は
現行経路だけでは成立しないため、exact source generation への CAS restore と readback、または
専用一時 character 全体の検証済み cleanup が候補 revision に必要である。Cloud Run と Worker は
無トラフィック preview に留め、production promote は別操作のまま維持する。

## cc305 の到達状態

route、source、provider、budget、execution、rollback、stop condition のレビューは完了した。
一方、exact source、focused provider identity、受入後 rollback、V3 battle binding、exact release
commit が未確定なので Stage identity はまだ成立しない。`cc305` は完了にせず、この不足を次の
計画判断へ渡す。今回の作業はローカル文書・PERT更新だけで、push、PR、merge、tag、workflow
dispatch、provider call、Stage/production mutation は含まない。

## velocity 観測

`cc311`、`cc312`、`cc315` はそれぞれ start 時の planned value が `1p` で、finish 時の
active time は `3/16h`、`89/1800h`、`67/225h` である。`perttool project
observe-velocity` に同じ task/event を渡した結果は次のとおり。

- active-date throughput: `3p/1d`
- elapsed-hour throughput: `10800p/2809h`（開始 19:51:27、終了 20:38:16）
- effort productivity: `432/77 p/person-hour`（合計 `77/144h`、32分05秒）

日数予測には `3p/1d` を暫定採用し、残り12pを4実働日とした。標本は3 task・1日だけで、
Stage操作や外部判断待ちを含まない。次の完了taskを追加するたび再観測する。

インストール済み perttool 0.11.0/0.11.1 は、このGrammar 9文書を直接 velocity 観測すると
history層で `unsupported_source_version` を返す。今回は上記task/eventとproject identityだけを
一時Grammar 6観測文書へそのまま投影し、perttool 0.11.0の3候補がすべてavailableになることを
確認した。手計算値を perttool の推測結果として扱ってはいない。`cc305` の開始 20:59:22、
suspend 21:04:54 の5分32秒は未完了区間なので、完了velocity標本には加えていない。
