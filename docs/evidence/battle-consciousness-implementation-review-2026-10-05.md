# awareness-v5 実接続の検証記録

2026-10-05。対象は所有者が採用した動作契約候補v1と、その後継Accepted ADR0051に従う意識パイプライン awareness-v5の実装。実モデルの品質評価・有料試行・配備はこの検証の対象外。

## 接続した動作

キャラクター定義 v3の不変generationを新規の試合束縛形式 v5へ束縛し、潜在Luna none、顕在・裁定・実況Grokのroleを分離した。入力は自然文、出力は型付きJSONとして検証する。潜在の反射と感情は同じ呼び出しの別出力。顕在jobは凍結入力を保ち、準備済み結果を二つのcutoffで合流する。競合・寿命・次tickへの一回介入はshared reducersが処理する。

作成前のencounterにも独立した永続reservationを設け、作成後runtimeへ開始時計・期限・試行数・費用を原子的に継承する。再実行は保存済み結果を再利用する。正準世界・rating・実況outboxは同一transactionで確定する。必須判断失敗はincompleteとなり、そのtickの世界結果・勝者・評価を作らない。保存処理中の180秒期限超過もtransactionをrollbackする。

実況は凍結receiptからbatchを作り、認知先に許された状態と既に公開された文章だけを次入力に渡す。認知状態と文章の公開は同時に保存し、正準世界の後続更新を巻き戻さない。実際に成立した発声のみ、相手知覚と実況sourceへ渡す。

## 確認結果

- 全workspace型検査：成功。
- 全workspace build：成功。frontendには既存のbundle size警告が残る。
- 新規・変更経路36テストファイルの最終直接実行：214/214成功。
- 既存battle engine・旧実況workerの直接実行：60/60成功。
- 実際のstartBattle→advanceTurn→同一operation再実行を、実SDK・偽HTTP応答・一時SQLiteで確認。実課金なし。生成束縛、12×3、作成時時計継承、receipt、追加送信なし、事前料金証明なしの新規作成、実SDK usageの試合・role別永続化を確認。
- 独立レビュー：最終world transactionの時計再確認漏れを修正し、期限超過で両storeが変わらない回帰テストを追加。rating原子性・失敗時の世界維持・完了operationの再利用に追加指摘なし。
- npm testの最終結果：163成功、2失敗。旧切替試行の新規試合束縛形式 v4期待が、新規試合束縛形式 v5のみという採用契約と衝突。所有者が契約変更を保留。テストを削除して通過扱いにしていない。

## 残る確認

所有者の後続指示により、新規試合は実利用計測ポリシー awareness-v5-usage-v1を束縛する。事前料金証明を必須条件から外し、全SDK物理試行のusageをFK-free ledgerへ保存する。入力/出力/合計/cache/reasoningを分離し、試合・role・side・tick・receiptで相関する。取得不能usage・料金はnull/未知件数として保持し、実価格を捏造しない。USD0.50は観測目安で、証明なしの絶対上限とは扱わない。旧certified policyは移行せず証明必須を維持する。

[集計手順](../llm-usage-measurement.md)のCLIは単価表なしでもtokenをrole/model別に報告し、明示的なrevision付き価格表があれば推定費用を算出する。reasoningをcompletion料金へ二重加算しない。SDKのJSON解析失敗、HTTP失敗、timeout、遅着、stream usageも記録する。壁時計が逆行した検査ではusage保存拒否を発見し、単調時計の経過時間と観測壁時計値を別に保存する修正・決定的回帰テストを追加した。逆行の原因は未特定。

SQLiteのschema初期化と永続化・再読込は検証済み。PostgreSQL用migration0031〜0035を追加したが実PostgreSQL環境での適用は未実施。自然さ・日本語品質・モデルlatency・実費・公開環境の可用性は未測定。

正準計画は ../speech-continuity-and-fade-recovery.pert のawareness-connectとusage-measurement。全体awareness-verifyは旧切替試行の契約判断保留によりsuspendし、usage-verifyで実利用計測を別途検査する。実装で実現した価値は、ローカルで再実行・失敗・遅着を扱える新パイプラインとその検証経路。利用者が公開環境で新方式を使える価値はまだ実現していない。

## バージョン表示と設計の追従

[表示ルール](../version-display-rules.md)を設け、リポジトリAGENTS.mdへ対象名とversionを組にする規則を追加した。キャラクター確認・詳細画面の単独「V3」を「キャラクター定義 v3」へ変更した。保存識別子・旧契約は一括renameしていない。ADR0050は元の決定を保持してSupersededとし、ADR0051が状態・合流・privacy契約を継承して会計条件を置き換えた。全体ADR checkerには既存ADR0039のowner-acceptance marker欠落が残り、今回の新規ADR0051のaudit/projection確認と区別する。

## 最終検証と工数観測

usage-measurementとusage-verifyは完了。全体awareness-verifyはsuspendのまま。全workspace型検査exit0、全workspace build exit0、時計修正後backend build exit0、直接214テストexit0。全体npm testは保留対象2件を含むためexit1。既存ADR0039 marker欠落も未修正。

usage-verifyの標準lifecycle active_timeは19/144h（475秒）。一人のroot workerの継続検証セッションをmonotonicで473.844秒、effort 0.131623phとして記録した。これは最終検証のみの小標本で、別途delegated時計修正の42.99秒はこの標本へ含めない。全実装工数とは扱わず確信度は低い。perttool project observe-velocityを完了後に実行したが、観測結果にmissing_baselineが残り採用可能velocityは未算出。計画が旧hour形式であることは確認したが、baseline不足との因果対応は未検証。point変換や速度値を捏造して適用していない。次の計測checkpointは、保留されている旧試行契約の方針確定後に、該当taskのstart/finish/effortを記録した時点。

今回の追加変更の残作業は0。保留中の旧切替試行対応は方針確定後に暫定1〜3内部時間（低確信、2fixtureと試行検証契約の追従・確認を想定）。有料体験評価と配備は別の権限・作業で、ここから完了日を推定しない。
