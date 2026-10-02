# 実環境の試合進行エラー解析（2026-10-02）

## 確認結果

- 対象: `btl_e24ccddf1d8ec96b0073323f2bf256db`。
- 公開 `/api/health` は正常応答。稼働リビジョンは `kshiai-api-v2-retired-fce86a5`。
- Cloud Runログでは、導入の進行が2026-10-02 12:36:14 UTCに成功した後、12:36:16–42 UTCと14:19:34–38 UTCに計9回、試合進行が失敗。
- 14:19 UTCのログ本文を時刻順に確認し、Zodの次の検証エラーを確認した。
  - `description`: `free actions require a natural-language description`
  - `subjectRefs`: `free actions require at least one observer-safe subject reference`
- 失敗した進行リクエストのHTTPステータスは200。エラーはSSEの `error` イベントで伝わるため、HTTPステータスだけでは検出できない。
- PostgreSQLの対象1試合を読み取り専用トランザクションで確認。`status=active`, `turn=0`, `assetManifest.schemaVersion=4`, `prologuePending=false`, `revision=1`, `causalExecution.bucketIndex=0`。進行操作は `phase=combat`, `status=active` で、エンジン継続状態は未保存。

## コード上の原因候補と再現

稼働ソース `fce86a53434f5561baa70fb567cd2196cb92ba17` の
`backend/src/services/battle-service.ts:1620` にある
`deterministicLaterBucketFallback` は、通常攻撃等を選べない場合に、
`wait` / `reflect` 以外の最初の行動を選ぶ。この候補には `free_action` が含まれる。
選択後、スキル以外は `{ kind: selected.kind }` だけを
`CharacterActionIntentSchema.parse` に渡すため、自由行動の必須情報が欠落する。

同ファイルの `buildEngineNormConstraint`（1641行）では、V4試合に対し
この代替行動を事前に構築する。`engineInput.resolveNormConstraint`（4965行）から
呼ばれるため、LLMが実際に自由行動を返さなくても失敗し得る。

稼働コミットからこの関数本体を抽出し、TypeScriptを変換してローカルの
実スキーマを注入した最小再現を実施した。

| availableActions の唯一の候補 | 結果 |
| --- | --- |
| `free_action` | 本番と同じ2件の検証エラー |
| `basic_attack` | `{ kind: "basic_attack" }` として成功 |
| `wait` | `{ kind: "wait" }` として成功 |

本番で自由行動の必須情報が欠けたことと、この関数の欠陥は確認済み。
本番ログは例外のメッセージだけでスタックを保存していないため、
この試合での正確な呼び出し地点と、どちらの参加者の規範で候補が絞られたかは未確定。

## 対処の方向

代替行動は、行動種別だけでなく、生成可能な完全なIntentとして選定する必要がある。
自由行動を種別だけで自動生成せず、当該試合の固定された規範・観測可能な対象・
既存の機械的代替規則に従って、有効な代替Intentを構築する。
無条件に `wait` に変更するとキャラクターの規範に反する可能性があるため、
規範との整合性を含む回帰確認が必要。

再読み込みや同一リクエストの再試行だけでは、この決定的な検証エラーは解消しない。
修正後は既存試合の固定アセットを保持して再開できることを確認する。

## ローカル同期と作業範囲

`git fetch --prune origin` 後、既存の作業ブランチを保存したまま `main` に切り替え、
`git merge --ff-only origin/main` で更新。ローカルとリモートの `main` はともに
`933e6aefda461d71d6f7e5d31bcad6ed1d7c63bb`。
本番ソースは `origin/codex/cc304-focused-revise` に存在し、`main` より先行する。
この解析は稼働コミットを指定して行った。

本番のDB更新、試合の再実行、LLM呼び出し、デプロイは行っていない。
ソース修正はなく、確認は公開ヘルス、限定したログ参照、対象試合の読み取り、
ローカル最小再現に限定。全体テスト・型チェックはこの解析では実行していない。
