# CI修復と採用済み契約の実装途中記録

作業先は `/home/katsumata-m/.codex/worktrees/cc304-focused-revise-kshiai`、branch `codex/rc17-release-evidence`、HEAD `c9f0861`。変更は未コミット・未プッシュ。本記録は完了や中断の宣言ではない。目標は因果接続の封印、正式全体試験、同一SHAのCI成功、既存公開環境への配備と独立readback。共有作業終了予定は2026-10-09 20:00 JSTで、stop/endは行っていない。

## 採用と実装

- ADR0062: 新規試合のクールタイムを廃止、basic/skill/reflect反復の追加STAは2〜3回目2、4回目以降4。自由行動に一律反復負担を課さず、裁定が追加STA2/4/8、防御低下10/20/30%・次の被攻撃1回、部分実行・不成立を判断する。旧試合の方針を保持する。
- ADR0063: 装備効果4件が埋まる場合は元効果を保持し、計算したSTA負担をサーバー専用balanceTradeoffへ保存する。空きがある場合は従来表現。V3生成inventoryは独自strict schemaで専用フィールドを受理しない。
- 部分実行は確定済み正準対象に対する厳密部分集合のみ適用し、対象の昇格・具体化・属性更新を伴わせない。支払・必要量・不足量を記録し、知覚から潜在/顕在へ同一の型付き情報を渡す。新規ポリシーで知覚が欠ける場合は入力作成を停止する。
- 同時行動合流時に防御低下の消費が失われる不具合を回帰テストで検出し、必須の型付き行動状態を合流へ渡すよう修正した。

## 検証の現在地

CI37773665037の直接失敗はLizardとsharp脆弱性。sharp0.35.5 overrideとSRPによる分割で対処し、閾値は変更していない。型検査・共有build・関連ルール70件・意識受領30件は合格。独立レビューはADR0062/0063をINSIDE/PASSとし、V3入力の誤認指摘は撤回した。診断結果は正式試験の代替ではない。

正式npm testは未封印4件を実行前に停止し、authority_evaluated=false。対象はroutes-structured-character-acceptance、balance、battle-engine、skill-cooldown。証跡と現在ソースhashは `docs/evidence/ci-effort-contracts-2026-10-09/result.json` に保存した。

## 次の継続点

旧R2封印計画は今回のソース変更でhashが一致しない。期限が2026-10-08のpublisherを実行せず、採用ADR・新しいproducer/consumer・元ケース保持を組み込む現在ソース計画へ更新する。元247ユニット+4E2Eの全ケースを再検証し、Causeの封印とbindingのreadback、正式試験、プッシュと同一SHAの全CI成功を確認する。元HEAD・旧bindings・履歴と未関連Pythonキャッシュを保持する。mergeと有料試合は範囲外。配備は所有者が追加した最終目標に含むが、正式試験と同一SHAのCI合格を確認してから進める。

## 11:30時点の封印と検査

元674ソースhashを維持した全247単体ファイル1,468件、4E2Eファイル10件の診断は失敗・skipなし。R3は345既存ノードと47新規ノードの392件で、旧規則と新差分の独立内容レビューを通過。新ADR0062/0063の `.think` 正本も追加してaudit・Accepted投影を確認し、Markdownを正本の子として封印する。既存catalog rootのindex sourceも現在bytesへ固定した。

SealGraphのread-only方法比較では全943ノード・HEAD・試験HEADが完全一致。公式CLI731.964秒、hash検証object読み取り0.552秒、CLI抜き取り照合込み5.674秒。公開は公式CLIでexact cause/source/HEADを再照合する。途中停止でcommit済みjournal未記録の1Sealを発見し、公式show/source compareと計画の完全一致を確認して一度だけjournalへ回復し、再公開していない。現在R3 event197件を保持して処理再開。正式inventoryはまだ変更していない。

正式全体試験前の検査は、392 publication keyと計画由来ref/path/hash/Cause、旧1360HEAD・旧bindings、全251原pathとtest→source bindingの同一性、674source不変、reachable non-draftとsource一致、fsck、正式inventory前後SHA不変を検査する。候補inventory出力後に現在HEAD/staleを照合し、正式inventoryへ反映してから全体正式試験を実行する。

配備手順の現物確認: 既存stage/promote workflowはmain由来の同一release commitと4CI成功を要求し、stageは実providerを使う試験試合も自動実行する。現在はこれらをdispatchしていない。CI成立後、merge/tag・試験試合の件数/費用・protected production approvalの実行権限を、今回の配備要求と照合して具体的候補を提示する。既存gateを省略して配備しない。
