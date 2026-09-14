# 意味マイグレーション継続メモ — 2026-09-10

現在の作業ブランチは `codex/compact-psyche-repair-integration`。
ADR-0030の承認、B3の共有契約、B4の永続化、PostgreSQLスモーク修正と検証を保存する。

## 接続環境

ユーザーは本日、ルータでIPv6を許可していないと明示した。
この環境でIPv6のDIRECT_URLを再試行しても解消を期待しない。
接続情報はメインチェックアウト `/home/katsumata-m/kshiai` のsecdatドメインに存在する。
前回はDATABASE_URLを一時的に管理接続にも使用して隔離スモークを完了した。

## 検証と限界

前回の全725テスト、型検査、ビルド、jscpd、lizardは成功。
PostgreSQLスモーク成功後の残存一時スキーマは0、publicのB4テーブルは不存在。

ただし、前回回答の「publicスキーマには変更していない」という全面的な断定は撤回する。
search_path修正前の試行は修飾なしSQLを実行しており、public全体の実行前比較は取得していない。
残存一時スキーマ0とB4テーブル不存在だけでは他のpublicオブジェクトへの影響を否定できない。
その影響有無は未確定として引き継ぐ。推測による削除・巻き戻しは行わない。

## B5の到達点と次の実装

e0f2224のcommit/push後に、cb205（B5）を実装した。今回のB5変更はローカル未コミット。
6種の意味変更操作、候補全体の意味レビュー、意味的な影響先へ拡張する最小修正、
要求ごとの記録、差分統合後の全体再検証、ユーザー向け意味差分を接続した。
対象22テストと全747テスト、型・ビルド・静的検査、ADR-0030指定チェックは成功。
ADR全件チェックは既存0015・0016・0017・0019の問題で未成功。
詳細は[B5検証記録](adr-0030-b5-local-verification-2026-09-10.md)を参照。

次は専用PERTのcb206（B6）：候補の所有者受入と正確な内容の束縛、
候補・退避・receiptのappend、現在世代CAS、replay/drift/rollback。
実行開始前に前提の鮮度とCLI LLMTHINK監査を確認する。
テストダブルによるローカル検証は、実モデル品質や本番復旧の証明ではない。
実provider、deployment、設定activation、本番migration、schema-3 policy切替は別gateのまま。

本メモは継続地点と未確定事項の記録であり、共有作業日の終了記録ではない。

## B5実LLM検証の準備

ユーザーの指示で、B6前に合成キャラ1件の実LLM検証を準備した。
[実行条件レビュー](semantic-migration-grok-2026-09-10-v1/owner-review-ja.md) revision 1を参照。
準備証跡a724ae39。最大6要求・費用予約1.50 USD、xAI grok-4.3。
準備段階では実API呼出し0。既存B5は変更せず、追加9テスト・全756テスト、
型・ビルド・静的検査、オフライン6要求を確認した。現在世代は変更していない。
この準備をB6完了や本番復旧へ読み替えない。B5と今回の準備は未コミットのまま。

## 承認後の実LLM検証結果

所有者の「はい。」で上記revision 1を承認し、準備証跡を変更せず1回実行した。
初回要求がHTTP 400「自己参照する定義は非対応」で拒否され、再送せず停止。
汎用JSONの内部再帰型をproviderのstrict出力文法へ直接渡した接続設計の不整合を、
実応答・送信スキーマ・ソースで確認し、CLI LLMThink監査を通した。
意味保存・修正能力は未評価、usageと実費用は不明。現在世代は不変。
[結果とRCA](semantic-migration-grok-2026-09-10-v1/result-ja.md)を参照。
同一runは消費済み。次の判断点は出力スキーマのprovider適合化であり、
修正や別runの再実行を自動的には開始しない。B6・本番復旧も未完了。

## 所有者指示後のRCA・ローカル是正

上の停止点に対し、所有者が「是正を進めてください。妥協せずRCAで根本原因を探して」と指示。
内部JSON検証器とprovider出力文法の混同を是正し、v2 promptに非循環の等価表現を接続した。
移行先V3仕様にも残っていた5項目の自己参照aliasは、キャラ作成と共通の補正へ統合した。
xAIの3つのstrict送信入口に共通検査を接続。全768テスト、型・ビルド・静的検査が成功。
[根本原因・是正・限界](semantic-schema-root-correction-2026-09-10.md)を参照。
変更はローカル未コミット。実LLM再送・本番変更は0。旧v1 runは消費済みのまま保持。
新版を実LLMで試すには、新規runとして準備・承認を行う。旧v1 proofや承認を使わない。
B6は未実装であり、実provider受理・意味保存品質も引き続き未確認。

## v2新規runの準備完了・実行承認待ち

所有者の「では次のタスクを実行」に従い、v2の新規run準備を実施した。
新しい固定run識別子とprompt-v2をランナー・合成試行・準備証跡へ接続。
旧v1の入力・承認・HTTP400・消費済み状態は保持し、再送していない。
準備証跡451cc1c5、実装d40eaef0。全769テスト、型・ビルド・静的検査成功。
オフライン6要求18イベント、実API0、現在世代不変、activated=false。
[v2実行条件全文・日本語](semantic-migration-grok-2026-09-10-v2/owner-review-ja.md) revision 1が承認待ち。
モデルgrok-4.3、最大6要求、予約上限1.50 USD。本番・B6・commit/pushは対象外。
次の実行はこの正確な候補の承認後、ソースとproofの一致を再確認して1回だけ行う。
ローカルの準備成功を実API受理や意味保存品質の成功とは報告しない。

## v2承認後の実行結果：API受理、移行は未収束

所有者の「お願いします。」によりv2 revision 1を承認し、proof451cc1c5を変更せず1回実行。
全6要求HTTP200、2回修正後もreview_required。行動規範・fallbackは空のままで、互換性blocked。
初回スキーマ拒否は解消したが、意味移行全体の成功ではない。
同じ欄へのretireと置換の重複拒否、および未登録レビュー指摘による全体棄却を確認しCLI監査済み。
モデルが重複操作を繰り返した深い理由と、ローカル試験の見逃し原因の全容は未確定。
usageは入力162840・出力2895、割引なし推計0.2107875 USD。請求確定額ではない。
現在世代不変、activated=false。DBは/tmp/kshiai-semantic-probe-NvZi2V/probe.sqliteに保持。
[v2結果・原因と限界](semantic-migration-grok-2026-09-10-v2/result-ja.md)を参照。
v1/v2は消費済み。追加送信、コード修正、本番、B6、commit/pushはこの実行に含めていない。
次は記録した非収束問題の調査・是正判断。既存承認を新runや修正の権限に流用しない。

## 追加調査後の修正：prompt-v3、ローカル検証完了

所有者の「もう少し調べて」「では、修正してください」に基づくローカル是正。
診断範囲と書込み範囲を分離し、不正なレビュー指摘があっても有効な指摘を次の修正へ保持する。
retireによる現役値削除と自動保全を区別し、拒否された置換の旧V2項目も診断へ載せる。
必要機能と利用可能機能を混同させない指示を追加。実際の利用可能一覧の入力追加はしていない。
新規試行でprompt-v3を明示する。v1/v2履歴・固定ランナーは保持し、消費済みrunは再送しない。
追加9件を含む全778テスト、型・build・jscpd・Lizard、ADR-0030指定チェック成功。
[修正内容・根拠・未確定事項](semantic-repair-result-2026-09-10.md)を参照。
変更は未コミット。実API・本番・現在世代・B6・commit/pushは未実施。
Grok収束品質は未検証。実LLM検証には新版の新規run準備と別承認が必要。

## 終了時引継ぎ：2026-09-10、WIP保存対象と再開点

所有者の「引継資料を作成し、WIPコミット、プッシュで終わり」に基づく保存用記録。
上の各節は当時の状態を残した履歴であり、「未コミット」「承認待ち」はその節の時点を表す。
この節を含むWIPコミットが今回の継続点。push後のリモート一致は最終応答で確認結果を報告する。

### 保存先と作業範囲

- ブランチ：`codex/compact-psyche-repair-integration`。同名のoriginブランチへ保存し、mainへのmergeはしない。
- 今回の作業場所：`/home/katsumata-m/.codex/worktrees/compact-psyche-repair-integration-kshiai`。
- primary checkout `/home/katsumata-m/kshiai` の別作業には触れない。別PCでは同名リモートブランチを確認してから再開する。
- 保存範囲：B5意味移行サービス・共有契約・回帰テスト、provider schema是正、v1/v2合成試行と実LLM証跡、prompt-v3是正、計画・調査記録、対応するSeal参照と不変オブジェクト。
- closeoutのCLI LLMThink監査はfatal/error/warningとも0。共有根拠の重複hintは、保存判断と保存後検証の役割分担であり矛盾ではない。

### 完了したことと未完了のこと

ローカルでは778テスト、typecheck、build、jscpd、Lizardが成功。ADRチェックはADR-0030指定の成功であり、全ADRの成功を意味しない。既存のfrontend chunk-size警告と、旧ADR-0015/0016/0017/0019の全体チェック上の問題は未解消。

prompt-v3はローカル修正・回帰検証まで完了。実Grokでの収束改善、本番の新規キャラクタ作成・選択肢の復旧は未確認。B6（候補承認、原子的な保全・receipt保存と世代CAS、drift/replay/rollback）は未着手。本番DB・現在世代・deploymentは変更していない。

### 正確な再開点

1. 同名ブランチの最新リモートと作業状態、作業時間を確認し、この末尾と[修正結果](semantic-repair-result-2026-09-10.md)を読む。
2. 実LLM検証を続ける場合、prompt-v3を明示した**別の新規run**を準備する。既存固定ランナーはv2の履歴・再現性を保つため、そのままv3実行には使わない。
3. 新runの入力・実装snapshot・上限・日本語レビューを提示し、対象を特定した実行承認を得てから送信する。v1/v2のrun ID、proof、支出承認を再利用しない。
4. 実結果に基づく原因判断と是正判断は、細部もCLI LLMThink監査を通す。ローカル成功を実モデル成功に置き換えない。B6へ進む場合も現在の前提・受入条件を再照合する。

v1/v2は消費済み。v2は6要求HTTP200でも移行はreview_required・互換性blockedのまま。保存されたJSON/Markdown証跡はGitに含むが、`/tmp/kshiai-semantic-probe-Me4suO/probe.sqlite` と `/tmp/kshiai-semantic-probe-NvZi2V/probe.sqlite` はこのPCだけの一時DBで、push対象ではない。別PCでそれらの存在を前提にせず、履歴から既存runを再送しない。

利用可能アビリティの実一覧はfrozen attemptへ追加していない。必要機能から「利用不能」を推測しない指示までが今回の範囲であり、実一覧の追加はsnapshot契約の別検討事項。

今回終了するのはこのタスクであり、共有作業時間のstop/endは行わない。認証情報・`.env`・SQLite・生成distは保存対象外。

## 2026-09-11 再開：prompt-v3独立runの準備完了、有料実行待ち

本日開始09:00をexactで登録。再開時HEADと同名originは77e448cで一致、作業ツリーはクリーン、mainは1cdf210、該当PRなし。既存worktreeを再利用した。
「続きをお願いします」に基づき、昨日の修正後の実モデル観測に向けたローカル準備を実施。B6・本番復旧・追加の製品ロジック変更は行っていない。

新runは `semantic-migration-grok-2026-09-11-v3`、準備証跡abfee0cf、実装9b9c45bc。
専用入口 `backend/src/scripts/replay-semantic-migration-v3.ts` を追加し、元の入口のv2既定値は保持。
全779テスト、typecheck、build、jscpd、Lizard、ADR-0030指定チェック成功。
オフライン6要求・18イベント、実通信0、現在世代不変、activated=false、snapshot一致。
入力140,463〜156,320 bytes、予約推計合計1.17402875 USD。実課金ではない。
ローカル準備DBは `/tmp/kshiai-semantic-probe-Q92eJS/probe.sqlite`。実API開始記録は未作成。

次は[実行条件全文・日本語 revision 1](semantic-migration-grok-2026-09-11-v3/owner-review-ja.md)の所有者承認待ち。
grok-4.3、最大6要求、予約上限1.50 USD、再試行なし。本番・B6・commit/pushは対象外。
承認後に同一snapshot・証跡・秘密注入・TLSを再確認し、この新runを1回だけ実行する。
v1/v2の履歴・消費済み状態・支出承認は再利用しない。実モデルでの改善は未検証のまま。

## 2026-09-11 v3承認後の実行結果：部分改善、移行は未収束

所有者の「はい。」によりv3 revision 1を承認し、proof先頭abfee0cfを変更せず1回実行。
全6要求がHTTP200・receipt succeeded。入力185,996、出力2,280、総188,276 tokens、
公表非キャッシュ単価による推計0.238195 USD。請求確定額ではない。
最終はreview_required、candidate/compatibilityはnull、activated=false、現在世代は不変。
実行DBは `/tmp/kshiai-semantic-probe-ZEYD4I/probe.sqlite`。同一runを再送しない。

v2で失われていた有効な兄弟レビュー指摘の保持は改善した。初回生成も方針2件、
基本行動規範、fallbackを内容上は正しく作成したが、actionNormsのretireとの重複で規範だけ拒否。
後続レビューの誤指摘により、正しかったfallbackがnull・空配列へ、正しかった優先度40が60へ
変更された。統合処理がtarget断片のV3検証前に値を候補へ適用する機序を根本原因として確認し、
CLI LLMThink監査はfatal/error/warning=0。最終全体検証は不正を検出しactivationを封じ込めた。

[v3結果・RCA](semantic-migration-grok-2026-09-11-v3/result-ja.md)を参照。
次の直接是正候補は、各操作を一時候補上でtarget断片検証し、不正操作だけ拒否して
直前の有効値を保持すること。レビューの事実照合と、公開statement・非公開selfAwarenessを
混ぜた出典の開示継承は別の設計論点。製品修正、追加run、本番、B6、commit/pushは未実施。

## 2026-09-11 V4局所是正：不正なtarget断片を反映前に拒否

上記RCAの直接原因に対し、新規prompt-v4だけで操作単位の反映前検証を追加した。v1〜v3の
消費済み再生意味は変更していない。不正なfallback修正は`operation_fragment_schema_invalid`
として拒否し、直前の有効値を保持する。同一応答内の有効な兄弟操作は反映し、エラーと
保持済み完全候補を次の限定修正入力へ渡す。

全780テスト、typecheck、build、jscpd、Lizard閾値、ADR-0030個別チェックに合格。
全ADRチェックは既知のADR-0015/0016/0017/0019だけが失敗する。Viteの既存chunk-size警告あり。
[V4修正結果](semantic-migration-v4-fragment-guard-result-2026-09-11.md)と
[事後監査](semantic-migration-v4-fragment-guard-verification-2026-09-11.think)を参照。

実LLMでのV4収束、レビュー事実照合、混合由来の開示継承、B6、本番、activationは未実施。
provider呼出し、commit、push、deployも行っていない。Sealgraphの長時間処理と進捗不足は
[Issue #13](https://github.com/mako10k/sealgraph/issues/13)として発行・読戻し済み。

## 2026-09-11 V4残課題是正：レビュー根拠化と公開由来の分離

LLMレビューの登録パス妥当性を事実妥当性と扱っていた経路を是正した。V4レビューはR14どおり
修復closureを広げられるが、修復errorsになるのは独立したサーバ検出事項だけとした。
未裏付けレビューは`review_claim_unverified`として保持し、自動変更せず`review_required`で止める。
selector付きaction normの欠落と、別norm由来の値変更もV4サーバ検証で検出する。

公開statementと非公開selfAwarenessを同じ操作が参照する場合も、完全一致する公開テキスト葉だけから
既存権限を継承する。V1〜V3の履歴再生は不変。全784テスト、typecheck、build、jscpd、Lizard、
`git diff --check`に合格し、変更実装・検証・RCA・日本語結果をSealした。Sealgraph本体は変更していない。

[V4レビュー根拠化・公開由来分離の結果](semantic-migration-v4-grounding-result-2026-09-11.md)と
[事後監査](semantic-migration-v4-grounding-verification-2026-09-11.think)を参照。
実LLMでのV4収束、B6、本番、activation、commit、push、deployは未実施。

## 2026-09-11 有償失敗の固定コーパス化

所有者の「1回の失敗を無駄にせず次につなげる」指示により、v3の6応答を呼出単位で再評価した。
正答、誤答、後続への波及、V4の防止・検出、残る未知を
[有償失敗の回収記録](semantic-probe-v3-failure-harvest-2026-09-11.md)へ記録した。

保存済み6 receiptを直接読む回帰を追加し、全応答のschema・review finding・総188,276 tokensを固定。
第1・3・5生成応答について、V3ではfallbackが`["basic-action"]`から`null`、空配列へ壊れ、
V4では全段で正しい値を保持し、誤ったpriority 60はsource lineage findingになることを確認した。
整形した模擬応答への置換ではない。

次の実LLM実行はまだ準備・承認していない。固定コーパス、V4局所回帰、全体検証、新しいprepare
proof、完全な日本語レビューと当該snapshotへの明示承認を実行前ゲートとする。prompt縮小は費用候補
だが、完全候補や由来を欠落させる危険があるため未実装。新たなV5も作成していない。

## 2026-09-11 Local Ollamaを用いた簡易契約チェック

所有者の指示により、xAI有償呼出しの代わりにLocal Ollamaを簡易チェックとして評価した。
xAI用Providerは変更せず、共通Provider境界の後ろにOllamaネイティブAdapterを追加した。

初回v1はOllama 0.21.1がxAI用の任意JSON値schema表現を拒否しHTTP500。タグ一致の公式
grammar変換器で再現し、共有Zod由来の再帰JSON SchemaへAdapter内だけで復元して是正した。
完全V4初回入力のv2は143,952 bytesで、schema受理後180秒でtimeout。再送・時間延長はしていない。

「簡易」の範囲をAdapter契約へ戻したv3は、6,717 bytes、HTTP200、schema issue 0、期待操作と
完全一致。input 122、output 136、total 258 tokens、約29.2秒だった。これは実通信・schema受理・
receipt変換の証拠であり、完全移行品質、修復収束、xAI同等性の証拠ではない。
[Local Ollama結果](semantic-migration-ollama-result-2026-09-11.md)を参照。
