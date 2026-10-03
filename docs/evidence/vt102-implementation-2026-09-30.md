# vt102 — V3対戦の不変リビジョン束縛

2026-09-30。既存 `codex/cc304-focused-revise`、基点 `4a898d0` の引継から再開した。Accepted 要件v2 R2、ADR-0039 D1、ライフサイクル設計v2、ADR-0011、ADR-0030、移行要件v6 R3/R4に従う。受入文書4点は cc319 の accepted_sha256 と一致した。

## 到達状態

vt102 を done とした。作成時の V3 generation ID、digest、対戦 snapshot、basic-action出所、V4 compiler入力を保存し、SQLite読込、HTTP/SSE/action、再送、通常ターン、reflect、aftermath、実況workerと表示へ維持する。新V4 manifestは完全なdialogue/engine/rule/compiler識別を検証する。キャラクター版とmanifest版は独立したまま扱う。

V3機械規範、意識向けguidance、機械競合fallbackを分離した。guidanceは適用条件・例外・自己認識・優先度で投影する。行動候補が空でも競合receiptを保持し、provider laneを呼ばない。強制攻撃、古い予約行動、通常policy fallbackもエンジンの最終選択で合法候補集合を通す。解消できない空集合はAccepted ADR-0011のwaitを使う。準備後の実資源と継続checkpointの実turnで再評価し、差替理由をreceiptへ記録する。共有compiler契約を別moduleへ移して循環importを解消した。

[実装manifest](vt102-implementation-source-2026-09-30.json)、[判断監査](vt102-consumer-corrections-2026-09-30.think)。独立レビューで見つかった競合receipt消失、guidance条件欠落、エンジンの制約迂回、準備前/再開時の評価根拠とreceipt不一致を修正し、最終の限定レビューで具体的な残指摘なし。

## 検証

[検証JSON](vt102-validation-2026-09-30.json)。Node v25.1.0、実SQLite一時DB、MockLlmProviderを使用。実サービスとHono routeの作成・HTTP/SSE/action進行・同一キー再送・読込を実行した。途中でcurrent pointerと現在行を変え、結果/aftermathまで保存bindingが一致することを確認。保存済み実況入力を実workerで生成し、公開readも確認した。規範競合、強制攻撃、準備後資源、checkpoint再開の回帰を含む。

- `npm run typecheck` 成功（shared/backend/frontend/deployment）。
- `npm test` はactive 15ファイル128件成功、失敗0。provisional 2/disabled 146ファイルを成功へ含めない。新規3ファイル11件はAccepted根拠と実装manifestへCauseを付け、sourceに束縛して通常selectorへ登録した。
- `sealgraph fsck` はok。Sealは記録したidentity/provenanceの検証であり、所有者受入やStage実行の代わりではない。
- UI変更なし。PostgreSQL、実provider、Stage/productionは未実行。

## 実績・残経路

正本のresumeは10:09:28、finishは10:40:08（JST）。開始前の引継/現状調査、完了後の証拠整理はこの区間外。歴史的start/suspendも保持した。[速度観測](vt102-velocity-observation-2026-09-30.json)のelapsed-hour値は9/18からの長い停止を含む277.599722hであり、活動工数の生産性として採用しない。effort-productivityは未観測、履歴identity置換警告も保持する。計画velocityはvt109一件の暫定値を維持し、停止を除いた投入量を観測できる次のcheckpointで見直す。

9/30の子PERTは残資源makespan 9.25p、内部参考予測は先行関係2.020h/資源2.265h。親cc314へ同じ子makespanを引継ぎ、後続移行・評価を含む親は4.959h。作業カレンダー/時刻anchor不足により完了日時は未算出、外部承認・配備待ちは不明。これらは単一登録実績による条件付き予測である。

利用者が新V3対戦をStageで遊べる実現値は引き続き0。今回の寄与は不変世代での実行/再送/実況をローカルで利用・検証できる状態になったこと。次は子nextのvt110：選択候補と直接APIの共通参加資格、狭いライフサイクル、INSERT/UPDATE分離、旧未完了対戦の物理削除と再作成/遅延処理の拒否、完了履歴保持、SQLite/PostgreSQL契約。終了条件は全入口の読戻しと保持集合が一致すること。暫定見積0.5/1/2pは既存値で、最初の削除・再送試験時に見直す。

その後、vt103で正式登録Neva/Rioの統合、vt104–vt108で正確な対象・release・権限・停止/復旧・Stage読戻しと所有者試行を行う。今回のgeneric fixture完走をvt103やStageの達成へ流用しない。vt110のローカル実装は既存Accepted範囲で進められるが、実環境操作、push、merge/deployは個別の実行権限を要する。

今回の変更は既存worktreeの未コミット状態。mainと保存枝を維持し、追加branch/worktree、remote writeは行っていない。
