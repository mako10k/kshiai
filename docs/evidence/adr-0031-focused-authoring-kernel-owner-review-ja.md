# ADR-0031 revision 1 — 全文日本語レビュー訳

正本は同名の .think、英語Markdownはその投影。本書はレビュー範囲全体の日本語訳である。
状態: Accepted。日付: 2026-09-11。決定者: プロダクトオーナー。
対象は基盤のアーキテクチャと既存契約の扱いであり、稼働系への切替ではない。
関連: 受理済み基盤要件v3、キャラクタ要件v5、ADR0010/0011/0014/0024/0027/0028/0030。

## 背景・根拠・判断要因

受理要件は全体一括作成を、部分生成・意味照合・有限の自動回復へ置き換える。
既存の移行とfamily authoringの入口は分かれており、現行コードは比較資料であって新契約ではない。
この設計の前に、以前の作業をWIPコミットd879c87へ保存した。

正本E1は受理済みの基盤v3・キャラクタv5の固定snapshotで、正確な同一性は受入記録にある。
E2はADR0030 D8/D9の全体レビュー・最大2修復6request、0010/0011のimmutableな構造・投影、
0014/0024のqueue・fence契約である。過去実装のテスト成功を新設計への適合とは扱わない。

判断要因は部分的LLM context、意味保護、通常の不足生成、再利用可能な制御、
有限実行、簡素な元情報からの再試行、owner・activation・privacy境界の維持である。

## 比較した代案

1. family別loop維持: 抽出費用は小さいが、回復・安全策が重複する。
2. 汎用変換言語: 再利用は広いが、意味の所有場所を移し、新言語・schemaの負担を加える。
3. 薄い型付き基盤とAdapter/Port: 統合契約の費用はあるが意味を各domainに残す。
   受理済みの基盤方針に従い、これを選択する。

## 決定

### D1

型付きの薄い制御基盤、ドメインAdapter、副作用Portに分離する。基盤は作業選択・義務・提案の一括適用・証拠・進捗観測・終了を管理する。Adapterはschema、保護対象の意味、依存範囲、部分投影、意味検査、完成条件を所有する。Portはprovider通信、時計・計数、owner境界付き永続化を担当する。基盤にキャラクタ項目のpathや戦闘中の認知規則を入れない。

### D2

内部契約群SemanticAuthoringRunV1とSemanticAuthoringAdapterV1を導入する。公開asset/schemaの版名ではない。runはmode、固定入力identity、target/policy/adapter版、expected pointer、owner、実行fenceを束縛する。候補・部分値はAdapterごとの具体型を保つgenericとし、unknown JSONのdecodeは外部境界だけで行う。内部はTypeScript値を渡し、JSON文字列の往復や未検証castを使わない。提案・指摘・質問・受理回答・終端結果を異なる型で表す。

### D3

版付きSkill記述に目的、合法な操作役割、部分capability要求手順を持たせる。サーバregistryで型付きhandler・部分schemaへ対応づける。探索metadataを小さくし、現在の部分作業に必要なToolだけを公開し、終了時に非公開へ戻す。探索・公開もstep予算に数える。可視性は認可ではない。Queryはread-only、更新Toolもpatchの提案だけを返す。全schema/candidateはサーバ内に置き、全件Queryや累積context組立による迂回漏洩を許さない。

### D4

元情報を固定し、保護・調整可能・創作余地を分類する。決定論的baselineと義務graphを作り、部分的な意味clusterを解決する。キャラクタの骨格を依存内容へ展開する前に検査し、その後は影響clusterを再検査する。提案は元candidate版、登録済み変更範囲、source claim、影響、意味依存、由来を持つ。candidateと台帳を仮適用し、権限・部分構造・参照・対応を検査して一括反映する。古い版や不正提案は部分反映しない。完成時は全体schema・compiler・開示・網羅・入出力意味照合が必須で、各意味検査には部分投影だけを渡す。

### D5

修復は既にschema-validな依存項目も変更できる。指摘には検査したclaim参照、影響範囲、不整合、未知を持たせ、指摘を通じて事実・権限を創作できない。意味的不整合は機械的証明だけでなく部分的なLLM評価を要する場合があるが、サーバは参照・権限を検査し、最終意味照合を必須とする。上限内で情報を増やす修復・分割・事前認可代案を使い、不足は原則生成する。受理済みの5条件を満たす場合だけ意味的なowner質問を行い、範囲付き回答を保持し、実行中または明示的新attemptの自動処理へ戻す。

### D6

ADR0014/0024のqueued command、純粋read、永続wake、owner境界付きfenced workerを維持する。実行用scratch・途中candidate・有限監視履歴はメモリに置く。固定source・identity・必須provider receipt・失敗理由・質問回答・最終レビュー候補は既存保持規則に従い保存する。終端attemptのreplayではproviderを呼ばない。process/lease喪失後、claim済みrunを計数ゼロで再開せず、保存済みreceiptを使うfenced recoveryで失敗終了し、未確定の実行中消費は保守的に計数する。claim前の配信再試行は通常の再queueが可能。明示的owner再試行は新attemptを作りsource/pointer driftを再確認し、source内容の新規化や全context checkpointは要求しない。

### D7

LLM計画、Tool、検証・レビュー、修復・分割はattemptごとの固定実行policyと累積計数を共有する。LLM呼出、step、時間、入出力量、token・costの有限上限をrun受付前に必須とし、無制限defaultを設けない。実行中requestと出力上限を含む保守的予約で受付し、既知usageを精算するが未知消費をゼロへ戻さない。投入・適用境界で期限を確認する。provider/model変更は固定policyの許可が必要。枯渇後は新規作業と遅延結果適用を止め、可能な取消を行うが、課金ゼロは保証しない。

### D8

Adapterが提供する義務・claim網羅、重大指摘、正規化した関連状態の有限なフェーズ別履歴を使う。文章だけの変化は進捗としない。意味同値性はAdapter、無進捗区間・反復・交互状態の検出は基盤が担当する。回復戦略の変更はpolicyで制限し、無限反復を許さない。有用な一時後退は合法。フェーズ変更で観測基準を変えても資源計数をリセットせず、未解決clusterの再出現を隠さない。更新境界でcandidate/台帳/参照/遷移整合を検査する。不正提案は信頼する状態を維持し、信頼する制御状態の破損はLLM修復せず終了する。

### D9

内部結果はレビュー可能、owner回答待ち、失敗を型付きreceiptとともに区別し、公開status文字列の新設とはしない。完全検証済み候補だけをレビュー可能とする。owner受理は正確なcandidateとreceiptに結びつき、既存append/CAS activationはproviderなしで履歴generation・battle bindingを維持する。停止記録には分類・計数・指摘・source identityを保存し、hidden chain-of-thoughtは保存しない。技術的失敗だけでは意味的Q&Aにしない。退避はactive semantics外で、移行中の認可migratorだけが閲覧し、既存の256 KiB・owner lifecycleを維持する。

### D10

この設計を必要な契約判断後に採用するconsumerでは、ADR0030 D8の全体LLMレビューとD9の全体再レビュー構成を部分検査・サーバ照合へ置換する。D2〜D5のschema/consumer/capsule意味、D6のidentity固定、D7の由来・権限、D10終端記録、D11 activation、D12 policy/cutoverは維持する。D10は途中run context永続化を必須としない形に具体化する。現行2修復・6request上限は既存実行に維持し、異なる数値policyは新経路実行前に別途受理済みの後継決定を必要とする。ADR0010/0011の構造先行公開profile・開示を維持し、決定論的移行のみ・生成禁止は受理要件の範囲だけ分類付き生成へ置換する。ADR0014/0024の配信、0027/0028のruntime責務は維持。本案がProposedの間は旧ADRをSupersededへ変更しない。

### D11

キャラクタV3作成・修正・移行を最初の高度Adapterとし、キャラクタ・戦場・ナレーションスタイルfixtureで同じ基盤をfamily pathなしに検査する。既存APIとgeneration/compiler identityを維持する。実動作導入前に具体的な型付きDTO/patch schema、数値実行policy、検出・観測区間規則、公開retry/Q&A対応、永続化/fence変更、Adapter適合をレビュー可能な実装設計で定める。そこで本ADR・受理要件を弱めない。制御Portで不足生成、保護矛盾、依存修復、文章変化を伴う循環、有用な後退、遅延・stale書込、process喪失、read無副作用、source再試行、退避漏洩防止、activation driftを先に検査する。実モデル品質・収束は別途認可したprovider証拠が必要。

## 効果・費用・リスク

共通の実行制御により、モデルcontextを拡大せず安全と由来を扱える。
Adapter契約、進捗の正規化、fence付き終端状態統合の費用が増える。
誤検出で有用な探索を止める、または循環を見逃し有限予算を使い切る可能性がある。
元情報からの再試行では再計算が発生する。
保守的予約に収まる消費上界を示せない経路は実行できない場合がある。
経路・policyの変更には別の権限が必要で、自動迂回しない。

## 互換性と移行

D10は条項単位の置換提案であり、稼働環境が変わったという宣言ではない。
旧request/response identityを新フローとして読み替えない。
route接続前に公開retry/Q&A互換と正確なAdapterを決める。
source generation、旧attempt、battle binding、authoring policyを維持する。
ADR0030全体を失効させず、schema・退避・activation等の大部分を維持する。
今回の受理では既存ADRのlifecycle statusを変更しない。今後status/linkを変更する場合は、
正確な影響レビューと別の判断を必要とする。

## 検証と実装接続点

D11の検査matrixを用いる。今回は基盤実装、provider検証、新policy実行は行っていない。
接続候補はsharedのstructured-assets.ts / character-semantic-migration.ts、
backendのcharacter-authoring-service.ts / character-semantic-migration.ts /
family-authoring-runners.ts / character-authoring-jobs.ts、および
repositories/family-authoring-jobs.tsである。これは実装許可ではない。

## レビューと残る設計範囲

2026-09-11、正本、Markdown投影、全文日本語レビュー範囲、P0〜P3指摘なしの独立PASSレビュー、
差分、論点、代案、リスク、未知、ACCEPTまたはREVISEの選択肢を提示した後、
プロダクトオーナーは受理前の正本SHA-256
`cf623039913261e5735166f91ad07aa82d6640393614f82cbadc47a1e2367e16`
で特定される正確なADR-0031 revision 1に `ACCEPT` と回答した。

この受理によりD1〜D11をアーキテクチャ判断として採用する。D11に記載した、数値policyの
権限を含む実装設計の作成・レビューが次の認可済み段階である。ただし実装自体は別途認可を
必要とする。本書は実行可能仕様の完成ではない。既存PERTの実行milestoneを完了扱い・
用途変更しない。provider呼出、評価、deployment、production migration、candidateまたは
asset受理、pointerまたはpolicy activation、rollback、release、既存ADRのlifecycle status
変更を認可しない。
