# ADR-0006の既存Accepted基準をSealに登録するためのレビュー

状態: 2026-09-17、オーナー承認後に提示候補をSeal済み。

## 承認・公開記録

オーナーは本候補のroot登録に「はい。承認します。」と回答した。提示済みCandidateの予定Sealと原文一致を再確認し、`acceptance/adr-0006-existing-baseline` を `78f9fec1b418020c221d67930654a6ead967fb85393603a544651cea83a61371` として公開した。公開後はCandidateなし、非draft・非stale、WORKFILE_MATCHES_HEAD。本文は不変。以下は提示時の判断対象と全文翻訳の記録として保持する。

## 判断対象と目的

既存Accepted ADR-0006の変更されていない原文を、既存承認の固定baselineとして登録する。ADR-0014/0024が依拠する耐久outbox・認証されたwake・fenced leaseの根拠を追跡できるようにするためであり、ナレーション機能の変更ではない。

- 正本: `docs/adr/0006-terminal-snapshot-narration-delivery.md`
- 提案REF: `acceptance/adr-0006-existing-baseline`
- 原文SHA-256: `dde999ff40599efb88cebe2e4b918b82fbb42d460479a455f0b8934bd880110f`
- 最終変更commit: `4df77fae80072c61d831618de347b34c57d02ed9`（2026-08-12）
- 提案設定: root=true、draft=false、Causeなし、正本へのsource binding。
- Candidate予定Seal: `78f9fec1b418020c221d67930654a6ead967fb85393603a544651cea83a61371`

Lunaは原文のAccepted状態、ADR-0005のSuperseded状態、ADR-0014/0024への耐久wake/fence契約の適合を確認した。CLI LLMThink監査はfatal/error/warning 0。主担当の候補作成前監査もfatal/error/warning 0。オーナー承認前に公開・下流Cause化しない。

変更はSealGraphへの登録だけで、本文・仕様・実装を変えない。既存の対応Sealは現行REF一覧から見つかっていない。ADR-0015以降のthink形式をこの文書に遡及要求しない。後継Accepted決定を優先し、全文登録を理由に全条項を無条件に現行化しない。SupersededのADR-0005や旧workflowの権威を復活させない。

推奨案は既存Accepted全文をそのままroot登録すること。対案は登録を保留して他の既存承認記録を探すことで、その間はこの固有契約に依拠する下流の根拠修復が残る。仕様から耐久wakeを削除することは対案ではない。

限界: Sealは当時の固定文書と出発点を識別するだけで、実装適合・稼働・テストadmission・全体健全化を証明しない。登録によりrelease、cloud設定、migration実行、deployの権限は増えない。

## 正本全文の日本語訳（レビュー補助）

以下は正本全体の翻訳であり、第二の正本ではない。現在形や移行の記述は元文書の時点の記述として読む。省略箇所なし。

### ADR-0006: 終端snapshotによるナレーション配信

- 状態: Accepted
- 日付: 2026-08-12
- 決定者: プロダクトオーナー
- 置換対象: ADR-0005「battle単位の順序付きナレーションstream」
- 関連: GitHub Issue #98、`docs/battle-narration-stream-design.md`、`docs/issue-98-battle-pipeline-plan.md`

### 背景

ADR-0005は正しい公開identityとbattle単位の順序を定めたが、deploy済みruntimeと安全な復旧に適合しない契約が3点残った。永続化された部分的な文章が再生成されたattemptの文章と混ざり得ること、単一の物理SSE接続が現在の有限なCloud Run timeoutを超えて存続できないこと、そして一つのreceipt応答ではcombatとjudgmentのように複数のcanonical phaseをcommitするadvanceを表せないことである。

### 判断要因

- 異なるprovider attemptの文章を決して混ぜない。
- 無期限の物理HTTP requestを要求せず、一つの論理battle narration streamを維持する。
- combat turnに別の意味を兼用させず、commitされたすべてのcanonical phaseを表現する。
- 再接続配信におけるat-least-onceのネットワーク意味を正直に表す。
- 非同期処理前にcanonicalな勝者とnarratorの権限境界を確定する。

### 検討した選択肢

1. 部分的な文章を引き続き公開し、providerに継続生成を求める。現在のadapter全体で一貫して対応していない。
2. 検証済みの終端ナレーションsnapshotだけを公開し、attemptの進捗は非公開に保つ。token単位のlive表示を犠牲にするが、決定的な復旧と明確な置換の意味を得られる。
3. 部分的な文章を公開し、retry時に見える形でresetする。不安定な文章を公開し、履歴replayを複雑にする。

### 決定

選択肢2を採用する。

- 公開する論理ナレーションidentityは引き続き `(battleId, turnReceiptId)`。公開 `narrationId` は存在しない。
- advanceは順序付き `receipts[]` を返す。各opaque receiptはcommit済みの一つのphase（`prologue | combat | judgment | aftermath`）を識別し、battle内の一つのナレーション順序を所有する。
- ナレーションproviderの進捗は非公開。公開文章は、検証済みの一つの終端 `completed` snapshot、または決定的な終端failure/fallback snapshotとして初めて現れる。新attemptは以前のattemptへ追記しない。
- battle streamは論理的には連続し、物理的には有限。認証されたfetch-SSEはplatform timeoutの前後にopaqueで永続的なcursorから再接続し、認可を更新する。
- 配信はat-least-once。clientはevent IDで重複を除き、receipt blockを終端snapshotで置換する。
- ナレーション生成はbattleごとの厳密な順序を保つ。後続canonical advanceはそれを待たない。
- battle全体のrevisionとcanonical phase sequenceはCASでcommitする。gameplayは勝者、終了理由、phase所有のmemory、rating、semantic/world state、characterが発したspeechを決定的にcommitしてから、不変のナレーション入力を作る。narrator/refereeの文章はそれらを上書きできない。
- presentation continuityを保持する場合は、workerが実行可能となる時点で以前の終端ナレーションentryから導出し、ナレーションread modelだけに保存する。canonical battle入力ではない。
- Cloud Runのscale-to-zeroからの起動には、耐久outboxと認証されたqueue pushが必要。workerのwriteはナレーション専用のfenced leaseを使う。
- managed push実装はGoogle Cloud Tasks。outbox IDごとに決定的なtask名を一つ導出し、`ALREADY_EXISTS` は冪等なenqueue成功として扱う。taskには正確なworker audienceに結び付いたGoogle OIDC tokenを持たせる。worker endpointはそのservice-account emailだけを受け入れる。曖昧または失敗したCloud Tasks API callでpendingのまま残ったoutbox rowを、startup scanと後続battle mutationでretryする。
- wakeのdispatchは完了を意味しない。復旧待ち時間を超えた非終端entryは、単調増加するdelivery generationでoutboxを再度有効にする。task identityを `(outbox ID, generation)` から導出し、同一generationの曖昧なretryは重複排除する一方、実際に失われた、または試行を使い切ったtaskは置換できるようにする。有効なfenced worker leaseがある間は復旧を阻止する。
- battle advancementはcheckpointへのすべてのwriteに別の単調増加fencing tokenを使う。lease所有権を失うと、battle revisionがまだ進んでいなくても、その後のwriteは失敗する。

### 結果

#### 良い影響

- retryや引継ぎで、異なる文章が混在する公開paragraphを作れなくなる。
- 有限requestとtoken更新をまたいでcursorによる復旧ができる。
- 複数phaseのadvance出力に明示的なidentityと順序が与えられる。
- canonical gameplayをナレーションの遅延・失敗から独立させられる。

#### 不利益とリスク

- ユーザーはnarratorのtoken単位の進捗ではなく、queued/generating状態の後に完成blockを見る。
- `receipts[]`、presentation read model、queue wake-up、fenced leaseにより移行範囲が増える。
- battleごとの厳密な順序により、presentationに限って先頭処理待ちが生じる。

### 互換性と移行

- ADR-0005は歴史的な根拠として残し、`Superseded` とする。
- 既存の埋め込みlogは、feature gateで制御された合成presentation read modelを通じて引き続き読める。legacy identityが曖昧な箇所でreceiptを捏造しない。
- 既存advance SSEは、advanceのphase/final stateだけのために一時的に残す。非永続のnarrator進捗は互換性の受入後に除去する。
- native `EventSource` は要求しない。bearer認証されたfetch streamを維持する。
- release、queue infrastructureのdeploy、production migration、production observationには別途認可が必要。

### 検証

- 失敗または放棄されたattemptは部分的な文章を公開しない。
- workerの引継ぎは同じ論理receiptについて一つの終端blockを作る。
- advanceはcombatとjudgmentのreceiptをcanonical sequenceで返せる。
- runtime timeoutをまたぐ物理再接続は、at-least-once event stream上でreceiptごとに一つの見えるblockを作る。
- 以前のナレーションがqueued/generatingの間も、後続advanceはcommitできる。
- ナレーション出力は、勝者、mechanics、world、非公開memory、rating、perception、canonical drama stateを変更できない。
- queue再配信とstale workerは、一意なidentityとfencingによって拒否される。

### 実装への参照

- 詳細設計: `docs/battle-narration-stream-design.md`
- 作業に応じて、実装commit、migration、test、evidenceを追加する。
