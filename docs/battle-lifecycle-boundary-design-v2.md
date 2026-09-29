# 対戦ライフサイクル — 基本・詳細設計候補 revision 2

- 状態: Proposed
- 日付: 2026-09-29
- 上位: [切替要件revision 2](character-v3-battle-cutover-requirements-v2.md)、[ADR-0039 revision 1](adr/0039-v3-battle-lifecycle-and-cutover.md)。受入済みauthoring R18、ADR-0010/0007を継承。
- 前版: [revision 1](battle-lifecycle-boundary-design-v1.md)。本候補が現在のレビュー対象。旧版の「物理削除方式未決」と旧見積りは歴史的記述。
- 実装担当: vt109 登録、vt102 binding/consumer、vt110 ライフサイクル・切替、vt103 統合。

## 基本設計：責務と境界

| 所有者 | 入力 → 出力 | 変更理由・依存方向 |
|---|---|---|
| Asset authoring/catalog | 候補・所有者確定 → immutable generation/current pointer、ready読込 | キャラクターの編集と互換性。対戦へはread portのみを公開 |
| Battle domain | 固定binding・command・state → 次state、receipt、適格性判定 | 対戦規則。DB/HTTP/providerを参照しない |
| BattleLifecycle | 認証済みactor、command、operation identity → 確定結果／再送／利用終了／競合 | 操作の順序・認可・transaction。domainと狭いportへ依存 |
| Battle storage | 新規作成／revision更新／履歴読込／削除計画 → 永続結果 | SQLite/PostgreSQLの保存とCAS。engineの判断を持たない |
| Narration adapter | コミット済みbattle receiptと固定入力 → 非同期投入・公開 | 表示生成。Battle正史の結果を変更しない |
| Transport | HTTP/SSE/action/taskの入力 → 同一use caseの呼出しと形式変換 | 通信方式。参加資格を個別実装しない |

一つのBattleLifecycle巨大クラスへ全処理を集める代わりに、create/read/advance/discardの小さなuse caseと共有規則を用いる。将来プロセスを分ける場合も、Battleが正史、Assetが世代、Narrationが表示生成を所有する境界を保つ。今回の納品は同一プロセス内の境界であり、プロセス分割そのものは別の設計対象である。

## 詳細設計：公開操作と失敗時の契約

| 操作 | 入力 | 出力・原子性・再試行 |
|---|---|---|
| `selectCandidates` | actor、検索／random/auto条件 | Asset catalogのready候補を共通V3参加資格で選別し、自キャラ・相手候補へ返す。管理画面の旧世代閲覧はcatalogの管理用readとして維持。最終createも同じ規則で再検証 |
| `create` | actor、request、idempotency key | 決定的battle IDを得て削除記録を照合。既存なら認可後に保存結果を再送。新規ならexact ready V3世代を読み、V4 bindingを検証してINSERT。競合時は同一operationの保存済み結果へ合流 |
| `read/list` | viewer、battle IDまたは検索条件 | 認可された保存state/完了履歴。本文は記録済みsnapshotを使用。削除IDと不存在は通常の利用不可応答で扱い、列挙による情報開示を増やさない |
| `advance` | actor、battle ID、operation ID、期待revision | 存在・認可・進行資格→HTTP/state再送→lease→計算→revision/fence付きUPDATEとoutboxの同一transaction。競合は再読込へ、再送は同一確定receiptへ合流 |
| `discardCutover` | 認可済みoperator、frozen対象ID/hash、停止確認、回復snapshot identity | 対象・状態をtransaction内で再照合し、ID削除記録と本体/従属削除を原子的に確定。件数と保持集合を返す。再実行は同じ対象・同じcutover IDの読戻しとなる |
| narration task/read | battle ID、receipt/lease identity | 存在・固定入力・leaseを確認。消えた対象のtaskは完了としてack。公開・保存直前も存在/所有権を照合。providerから遅れて届いた結果は会計を完結し、公開対象から除く |

各use caseの結果型で `created/replayed/unavailable/conflict` 等を区別する。HTTP上の既存の認可・不存在表現を継承し、SSE/actionも同じ意味を写す。細かな関数名やファイル配置は実装で確定し、各moduleに責務の `R:` コメントを置く。

### 不変binding

両者の `assetId/generationId/contentDigest/snapshot/compilerInputsV4`、dialogue tuple、戦場・実況スタイル・ルールidentityを作成時に固定する。明示した必須consumer集合は `battle-mechanics@3`。authoring時の完全な構造・開示妥当性も保持する。実行時consumerはV4入力へ明示的に分岐し、character現在行から能力や人格を補完する経路を除去する。完了履歴のunknownはunknownのまま返す。

### 作成と更新の分離

`insertNewBattle` は新規IDを作成する一回の操作。`updateExistingBattle` はrevisionとlease fenceを照合するUPDATE専用。UPDATE対象が0行なら競合または利用終了を返す。Battle更新とnarration outboxは同じtransactionへ参加する。計算・provider呼出しはDB transactionの外で行い、最後にfenceを再検証する。

新規INSERTと削除記録の照合は一つのtransactionで行う。切替は全作成workerが停止した状態で実行し、対象確定と新規INSERTの競合を除く。将来のオンライン削除を今回の停止切替の保証から推測しない。

### 削除記録

論理表は `battle_discard_receipts(battle_id PRIMARY KEY, cutover_id)`。正確な対象・件数・snapshot identityは切替証拠に置く。表には旧state・結果・キャラクター情報・実況本文を保存しない。作成前の照合により、元のidempotency行が失われた場合も、同じ旧キーと要求から算出されたIDの再作成を防ぐ。古い要求を識別する限りreceiptは保持する。廃棄できる条件は作成identity契約を変更する将来判断で扱う。

この小さな永続記録が増えることは新しい設計選択として所有者に示す。対戦本体を保持する旧版再開モデルとは用途が異なる。より少ない実装で同じ再送保証を達成できることが示された場合は、受入前にこの候補を改訂する。

## 切替の順序と関連データ

1. vt104で正確なreleaseと停止・回復手順をレビュー。vt105でV3候補を配備し、ゲーム入口とtask投入を閉じたまま維持する。
2. 旧revisionとworkerを停止・収束させ、queueの遅延配送先も新しい存在確認を通る構成へ揃える。送信済みprovider要求の帰結と会計を確定させる。
3. vt108で切替直前snapshotを保全。全battle ID、保存status、関連表件数、finished保持集合hashを固定する。statusの解釈不能行はIDと影響を示し、対象を確定してから適用する。
4. 一つのtransactionで対象再照合、receipt登録、関連削除、保持すべき会計runの終了を行う。対象・件数の不一致は全体をrollbackする。
5. ID不存在、HTTP/state再送、遅延worker、finished保持集合、V3作成可能性を読み戻す。vt106で確定した両キャラクターをStage登録する。両条件が揃った時点で入口を開く。
6. vt107で実プレイを観測。開放後の不具合は新規V3データを保持した前進復旧を計画する。

| データ群 | 対象旧対戦の扱い | 理由 |
|---|---|---|
| battles / lease / presentation / narration entry・lease・retention | 本体削除とcascadeをtransactionで検証 | 正史と表示入力を物理削除 |
| narration events / outbox | battle IDで明示削除 | FK cascadeがない公開・配送データ |
| narration attempts | 会計メタデータを保持、activeを収束 | provider実績を保持。本文や再開入力として使用しない |
| HTTP idempotency | advance scopeと、create response/決定的IDが対象を示す行を除去 | 保存応答本文を除去。再作成防止は削除receiptが担当 |
| provider_operation_runs / attempts、balance_events | 実績を保持。残るactive runはfailedで終了 | Accepted ADR-0007等の会計・観測履歴を継承 |
| asset_generations / current pointer、finished battle群 | 保持 | キャラクター管理と完了履歴を保全 |

削除predicateとcascadeのSQLite/PostgreSQL同等性をローカル試験で確認する。Stageの件数、実際のqueue状態、停止可能時間、snapshot復元確認はvt104/vt108で観測し、実行候補に固定する。

## 正式な登録と統合検証

vt109では固定Neva/Rio候補を、通常のauthoring attempt/candidate-review/confirmへ接続する。所有者が見る候補とreceipt/digestを同一に保ち、appendとcurrent CASを原子的に行う。承認取消・競合・重複確定・失敗時にpointerを保護する。Stageの本物の所有者操作はvt106で確認する。fixture直接importerは試験素材である。ここは既存Accepted R18・ADR-0010/0014の実装であり、新しい対戦切替ADRの採否とは独立して進める。

vt102はexact generationからbindingへ、vt110は選択候補・直接作成の共通参加資格とライフサイクルへ責務を分ける。vt103の終了条件は、同じ経路上での登録・選択・V3対戦完走・途中編集後の再読込・再送・削除と完了履歴の読戻しである。

回帰には通常HTTP、SSE、action alias、state replay、narration snapshot/events/follow/receipt、worker、character別履歴を含める。削除後に保持していたstateのUPDATE、削除前の作成キー、失われたHTTP receipt、provider遅延完了を独立ケースで確認する。型を捨てるcastによってV4 consumer契約を通さない。

## 審査境界・見積り

現在決めるものは責務、永続化・再送・削除の契約、停止切替、保持対象である。SQLの綴り、環境ごとの件数、配備時刻はそれぞれ実装・適用準備へ渡す。商品決定は上位のR1–R5を継承する。

見積り・実績の正本は[子PERT](character-v3-stage-trial.pert)。現状のvt110 0.5/1/2pはtransaction等の再利用を仮定した暫定値であり、実装規模の保証ではない。全入口の閉包確認・最初の削除試験で更新する。完了履歴の移行を要する場合の実作業合計30分枠はADR-0038と共有する。
