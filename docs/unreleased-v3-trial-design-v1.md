# 未リリース初回V3試行 — 具体設計候補 v1

2026-10-01、Accepted（所有者回答「はい。よいです。」、受入hashはevidence/vt104-design-owner-acceptance-2026-10-01.json）。入力はAccepted要件v3 R1–R5とADR0042。既存HEAD `03ef49c8073731b6b058a22637aefd6db0bdaeb5` の読取りから作成。所有者の基本方針は確定済み。option1の配備方式とローカルfile setを受入済み。

受益者はGoogleログインを使う所有者。出口は通常review/confirmでNeva/Rioを有効化し、自分のキャラクターを選んで一戦を進行・SSE・再読込・結果まで見ること。実Stage証拠はまだなく、実現値0。

## 観測した現在の障害

- stage-release.ymlはメールsmokeと旧persistent-battle-e2eを必須実行する。Google/V3試行の成功証拠へ流用できない。
- cutover-control.tsのopen遷移は八receiptとproductionReceiptを要求する。trialは各HTTPのpath/body/key digest、provider/task/backgroundを事前固定する。所有者が通常画面で選ぶ新しいcommandの本文を先に固定する方式は、自由に一戦を進める今回の試行にそのまま使えない。
- CUTOVER_ID/ARTIFACT_IDが両方未設定ならcurrentCutoverControlはnullで、既存のSupabase認証・所有権・V3 binding・provider会計を使う通常runtimeになる。これはコードで観測した分岐であり、現cloud設定が未設定という意味ではない。
- index.tsの通常起動にはpreset投入・pending task dispatch・authoring wakeがある。無control runtimeを配備する前に旧処理とbacklogを照合する必要がある。単にno-trafficで起動writeを止められるとは扱わない。

## 選択肢と推奨

1. **推奨: 初回試行専用workflowで既存の通常runtimeを使う。** CUTOVER環境変数を候補revisionから明示除去し、一般公開traffic/promotionは変更せず、Worker version previewを候補tagへ接続する。通常の認証済利用者はpreview URLを知れば既存の認可範囲でアクセスできる。所有者だけの新しい認可境界は追加しない。既存controlコードを削除しない。
2. 新しいowner専用trial modeを実装する。二generationと一battleを動的にbindし、HTTP/SSE/provider/taskの許可と費用上限を整える。owner以外を閉じられるが、repository/service/HTTP/provider/worker/schema/CLIと統合試験が必要。既存固定request trialへ曖昧な例外を追加しない。追加内部工数2–5h、低確度。
3. 従来の八receipt/snapshot/promotion方式を完成する。要件v3が後回しにした条件を戻すため非推奨。

選択肢1の重要な差は、owner専用controlを通さず既存アプリの認証・認可へ戻すこと。要件v3はownerが遊べることを求めるが、previewの他認証済利用者への閉鎖を明示していない。このアクセス差は所有者が選ぶ。公開URLの秘匿をアクセス制御とは扱わない。

## 基本設計: 操作・責務・境界

- workflow: exact commit/CI/image digest/backend revision/Worker versionを固定し、必要schemaと配備を行う。配備成功とowner game成功は別receipt。
- アプリ: 既存Supabase verifierと所有権、通常候補review/confirm、immutable generation、V4 battle snapshot、永続化/会計を担当する。reviewをCLIで自動acceptしない。
- operator: 外部実行承認済の旧writer/queue停止と旧unfinished集合のpreview/apply/readbackを担当する。finished/Googleユーザ/全DB削除を追加しない。
- owner: Googleログイン、二候補確認、選択、一戦の進行/再読込/結果確認を担当する。
- validator: credentialを含まないreceiptのidentityと完了証拠を照合する。承認や成功結果を自動生成しない。

## 詳細設計: exact file set

| 対象 | 責務と変更 |
|---|---|
| .github/workflows/v3-trial.yml（新規） | 初回試行準備/配備。existing stage-releaseからimage/tag/backend/Worker準備を再利用し、email/V2 e2e/paid character-create/public promotionを実行しない。既存通常releaseは保存する |
| scripts/verify-v3-trial-evidence.mjs（新規） | source/image/revision/Worker/owner/generation/battle/resultの実receipt照合。準備とgame完了を別modeで検証 |
| scripts/verify-v3-trial-evidence.test.mjs（新規） | 別artifact、missing Google/owner/generation、異なるbattle、未完了結果、simulation receiptを拒否 |
| docs/adr/0042-unreleased-v3-trial-scope.md | 今回の具体配備方式と適用範囲を決定へ記録。受入まではProposed |
| 本資料・evidence・正本PERT | 設計/実績/検証とremaining gatesを記録 |

backend/frontend/control schema/sourceの変更は選択肢1の候補に含まれない。コードに実不具合が見つかった場合は具体修正をその責務へ戻す。presets/backlogの事前照合は実行packetへ渡す。

### workflowの順序と再試行

A. read-only preparation: exact hosted sourceと四CI/release tag、対象service/DB/queue/旧tag/Worker preview設定、認証redirect・CORS、pending authoring/narrationとactive providerを確認する。tag作成自体は別承認。default最新secret versionを固定済identityと扱わずsecret version番号をpacketへ記録する。

B. 停止・処分: 既存旧writer/tag/queueを対象一覧で閉じる。provider会計/送信中jobの収束を読み戻す。既決unfinished集合を正規cutover repositoryでpreviewし、exact IDs/hash/max countを承認してからapply、独立readbackする。旧完了履歴の可読性を出口にしないが、既存finished整合checkをわざわざ削除しない。解釈不能な旧stateを削除範囲へ自動拡張しない。停止上限は既決1800秒を継承し、未成立なら作用を始めず対象操作/上限を提示する。snapshotや実restoreを開始条件へ戻さない。

C. 起動: schema migrationは同imageで必要なforward-only分のみ。migration結果を読戻す。新tag revisionはCUTOVER_ID/CUTOVER_ARTIFACT_IDを明示remove、必要なnarration task target/audienceは新tagへ固定する。no-trafficを明示する。startupが旧pending仕事を再投入しない事前条件を確認してから起動する。未解決authoring backlog等は捨てず、具体対象の別判断へ戻す。

D. Worker: build auth設定を検証し、BACKEND_ORIGINをexact tag URLへ固定してversionを一回upload。shared preview設定は先にread、変更が必要な場合だけmax1の承認対象へ含め、readback。公開Worker version/Cloud Run trafficは動かさない。Google redirect allowlistにpreview URLが適合するか確認し、追加設定が必要ならexact payloadを別承認へ渡す。

E. owner setup: Google loginでmappingを確認。register-v3-stage-trialをexisting owner IDへ一回実行し二attempt/digestを記録。通常画面のreview/confirmで二generation ID/digestを取得する。HTTP token/認証profileをreceiptへ保存しない。

F. owner game: 実browserで自分のcharacter選択→作成→advance/SSE→reload→終局結果。battle ID、二generation、進行前後のrevision/turn/resultとsource/image/Workerを照合する。provider上限は既存provider会計の機構とexact試行budgetをpacketで固定し、未確定の169等をコピーしない。途中失敗も記録し、同request keyの既存結果を読戻してから再試行を判断する。配備やDB applyの曖昧結果を再送しない。

G. 終了: 初回試行を完了してもpublic promotionを実行しない。障害は新V3記録を残して原因を観測し、必要な最小forward修正を別candidateへ。旧版rollback・snapshot復元を保証しない。

## 検証出口

ローカル: workflow構造（no-traffic、CUTOVER二変数除去、email/V2 smoke/promotion不実行）、validatorの混在/不足拒否、npm test/typecheck、既存Google mapping/V3 route/binding試験への影響を確認する。実cloudの動作やGoogle redirectはローカル成功から推定しない。

実環境: source/image/revision/Worker identity、起動/DB、edge/direct保護、Google login/所有権、二generation、実battle進行/SSE/reload/resultをreceipt化。実画面のメディア使用時は表示を確認する。email/snapshot/old readability/public promotionは完了条件から除外。

## phase reviewと残る未知

INSIDE: 最小配備方式、previewアクセス範囲、起動の旧仕事排除、具体file set、実証明の出口は本設計で決める。上記の方針候補と作用順を記録した。
OUTSIDE: exact hosted release/image/secret versions、現cloud writer/backlog、実Google redirect、旧unfinished IDs/count、paid budget、実dispatch/DB/cloud許可は後続execution packetへ。捏造値で埋めない。
BOUNDARY_DISPUTE解消: 所有者は2026-10-01に選択肢1の通常認可方式を受入れた。既決の互換性/保全延期は再質問しない。

設計準備後のvt104内部残工数0.5–1.5h（ローカルworkflow/validator実装＋試験、低確度）。初回実試行1.75–5h、親4.75–12hは暫定レンジを保持。外部許可/owner操作待ちは別、全体終了日未定。vt103の1標本velocityは運用実装のperson effortへ直接使わない。次checkpointは本候補の受入後、最初のローカル実装/試験slice完了時。

所有者の判断: 選択肢1の具体方式とこのfile setのローカル実装・試験を受入済み。受入だけでcloud配備/DB処分/有料呼出し/GitHub writeを許可したことにはしない。
