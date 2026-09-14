# 構造化意味オーサリング基盤 — 要件候補 revision 3 日本語レビュー訳

> この文書は `docs/structured-semantic-authoring-foundation-requirements-v3.md`
> の全レビュー範囲の日本語訳である。英語版が正本であり、本訳はユーザレビュー
> 支援用である。
> 対象は英語正本revision 3の全体。完全な同一性情報は別添検証記録に保存する。

- 状態: Step 1候補、セルフレビュー完了、オーナーレビュー待ち
- 日付: 2026-09-11
- 受理時の置換対象: 受理済み基盤要件revision 2（同revisionのacceptance記録を参照）
- 改訂根拠: 自動実行の機械的安全策を追加するオーナー指示
- 基準: docs/structured-semantic-authoring-foundation-requirements-v2-acceptance.md
- 意思決定者: Product owner
- 対象: 構造化された選択可能アセット向けの再利用可能なオーサリング
- 初期適合対象: キャラクタ、戦場プリセット、ナレーションスタイル
- 最初の高度利用者: V3キャラクタの作成、修正、移行
- 根拠: Accepted済みの構造化選択可能アセット作成ワークフロー、Accepted済みの
  構造化アセットEnvelope/Projection決定、キャラクタV3作成要件候補revision 4（未受理）、
  再利用可能な基盤を確立するというオーナー指示

## 目的

次の処理を行える、1つの再利用可能なプロセスを提供する。

1. 少量の自然言語または構造化入力から、構造的に完全なデータを作成する。
2. 重要な意味を維持しながら、既存の構造化データを別の構造へ投影する。
3. 結果が構造的に正しく、固定された入力、認可された変更、保護対象の
   ドメイン意味と重大な不整合がないことを確認する。

通常の結果は、自動回復と検証を終え、オーナーレビュー可能な候補である。不足情報は
原則として生成義務になる。軽微で調整可能な不整合は、整合的に解釈または調整できる。
人間Q&Aは、妥当な解決案によって保護対象の意味が変わる、明示的・重大・解消不能な
衝突だけに使う。

基盤はプロセスとエビデンスの仕組みを所有する。キャラクタ、戦場、ナレーション
スタイル、戦闘エンジン、開示、その他のドメイン意味は所有しない。それらはversioned
Domain AdapterとAccepted済みドメイン要件に残す。

## Authorityの扱い

### 維持するAuthority

- Runtime動作について、構造化定義は生成説明より優先する正本であり続ける。
- 自然言語sourceはprivateなauthoring provenanceであり、それ自体はdisclosureやruntime
  authorityを付与しない。
- immutable generation、idempotent attempt、owner acceptance、append/CAS activation、
  exact generationへのbattle bindingを変更しない。
- provider workはsubmit/read/commit transactionの外に置き、battle selectionやbattle
  creation中に実行しない。
- disclosure ceiling、audience policy、consumer projection、runtime knowledge、domain
  compiler ruleはserverが強制する。
- 各asset familyには、引き続きAccepted済みのschemaとdomain behaviorが必要である。

### Acceptance時に置き換えるAuthority

Accepted済みのstructured selectable-asset workflowは現在、upgrade converterがsourceに
存在しないfactを生成してはならないとしている。この一律禁止を次の分類付きsynthesis
規則へ置き換える。

- `protected_anchor`は、明示的に認可された変更がない限り維持する。
- `adaptable_preference`は可能なら維持するが、整合した結果のために解釈または調整できる。
- `open_creative_space`は生成した意味で補完できる。
- server-owned fact、mechanic、identifier、ownership、permission、disclosure grant、
  runtime observationをLLMが生成してはならない。

生成または調整したmaterial claimには、provenanceとfrozen sourceとの関係を記録する。
Domain Adapterは生成をさらに狭められるが、serverに留保されたauthorityを広げたり、
protected anchorを黙って上書きしたりできない。

この候補はowner acceptanceまでauthorityにならない。Acceptanceが認可するのはrequirement
baselineだけであり、ADR、実装、provider call、評価、deployment、data migration、candidate
activation、releaseは認可しない。

### 個別の既存契約の扱い

古いワークフローの生成禁止だけでは、現在のキャラクタ移行のAuthority全体を表せない。
受理済みV2互換性要件revision 6 R11とADR-0030 D7は、由来を記録した生成補完を既に認可している。
この許可と、元情報の保存・開示・runtime authorityの制限を維持する。

必要な後継ADRを受理した後にこの基盤を採用するconsumerには、次を適用する。

- revision 6 R14とADR-0030 D8/D9: candidate全体をLLMでレビュー・再レビューする方式を、
  部分的な意味検査とサーバによる全体照合へ置換する。構造検証と、構造依存・LLM提案の意味依存・
  レビュー指摘を含む修復範囲は維持する。
- ADR-0030 D9: 現行実装の最大2回修復・6回requestという上限は維持する。
  新基盤の予算は後継ADRで決定し、この候補で現行実行上限を引き上げない。
- revision 6 R9とADR-0030 D10: 固定入力、呼出ごとの記録、失敗記録、現行generationの保護、
  完了attemptの冪等性を維持する。再試行可能性は、明示的に要求された新attemptで移行元から
  再構築することで満たせる。失敗したattemptの途中実行を継続する必要はない。
- ADR-0030 D5: キャラクタカプセルの閲覧を移行中の登録済みマイグレータに限定すること、
  256 KiB上限、参照先generationとともに保持すること、既存のowner data lifecycleを維持する。
  汎用的なpolicyへの委譲は、これらを置き換えない。
- ADR-0010/0014: immutable generation、owner activation、導入済み範囲のqueue実行、
  既存attemptのidentityとreplay動作を維持する。再試行要求やQ&A回答に必要な具体API追加は
  後継設計で扱う。

未受理のキャラクタV3作成候補revision 4は、移行元からの再試行と移行中だけの退避情報閲覧を、
受理済み基盤revision 2へ既に整合させている。参照先はその特定の基準のままであり、
今回の候補を自動継承しない。基盤revision 3受理後、別途レビューするキャラクタ後継候補で
依存先とドメイン進捗契約を整合させる。過去文書や受理済みADRは書き換えない。

### 受理済み基盤revision 2との差分

F15に機械的な資源上限、一定区間での膠着・循環検出、信頼する内部状態の整合性検査、
失敗時の扱いを追加する。F2にドメイン所有の進捗指標、F9にF15の制約を追加し、
適合検査と受入基準に安全策のケースを追加する。不足の生成、部分的な意味修復、例外的な
人間Q&A、移行元からの再試行、退避情報アクセス、互換性は変更しない。
これは要件文書の改訂であり、外部製品バージョンの新設ではない。

## 必須の基盤動作

### F1. 3つのOperation Mode

基盤は、1つのorchestration modelのもとで`create`、`revise`、`migrate`を異なるmodeとして
扱う。

- `create`はsparse source、許可されたreference、clarification、target contract、policyを
  固定する。
- `revise`はさらにimmutable source generation、要求変更scope、expected current pointerを
  固定する。
- `migrate`はexact source data、Accepted済みsource-to-target transition、compatibility state、
  expected current pointerを固定する。

Attempt、work item、question、answer、candidate、immutable generation、current pointerは異なる
identityのままとする。

### F2. Domainが所有するSemantic Policy

各Domain Adapterは次のversioned contractを提供する。

- source/target schemaとfocused schema slice
- dependency closureと合法なwrite scope
- protected anchor、adaptable preference、open creative space
- Accepted済みのcopy、move、split、synthesis、retirement、deferral
- identifier、deterministic default、reference、compiler invariant
- semantic equivalence、contradiction materiality、reconciliation lens
- disclosure、consumer projection、owner-facing review projection
- F15の監視に用いる、フェーズを考慮した進捗指標、関連状態の同値性、許容する一時的後退。
  基盤が監視の仕組みを強制し、Adapterが指標のドメイン上の意味を定義する。

基盤はasset-family field pathを含めず、このcontractなしにdomain correctnessを推論しない。

### F3. ClaimとObligationのAccount

Serverはmaterial source claim、requested change、constraint、clarification、Accepted
transformation、generated addition、adjustment、conflict、preservation recordをprovenance付きで
記録する。すべてのrequired targetと関連source dispositionを、dependency、resolver、attempt、
status、receiptを持つobligationとして追跡する。

不足は原則として`needs_owner`ではなく`generate`になる。直接のtarget fieldがないという
理由で、migrationが関連source valueを黙って削除してはならない。

### F4. Focused WorkとCapability公開

作業をsemantic dependency単位に分割する。Work itemには、関連するsource claim/fragment、
writable target fragmentとsliced schema、登録済みreference、constraint、割当済みidentifier、
prior valid result、current findingだけを含める。complete schema、complete candidate、
exhaustive path setは含めない。

Stable capability registryが利用可能なoperationを記述する。選択されたSkillまたは
orchestratorは、現在のwork itemに必要なrequest-scoped query、proposal、validation、review
toolだけを公開する。Toolの可視性はdata accessやwrite authorityを付与せず、server authorization
を別に確認する。

### F5. Resolverに依存しないBounded Result

Deterministic logic、focused LLM、owner answer、Accepted deferralは、共通のbounded proposal
またはdecision contractを返す。affected obligation、source/target fragment、provenance、semantic
dependant、preservation effect、uncertainty、owner-facing explanationを示す。

LLMは変更を提案するだけである。authoritative dataを直接永続化したり、stable identifierを
割り当てたり、policyを変更したり、登録されたdependency closure外を書き換えたりできない。

### F6. TransactionalなPatch適用

Serverは1つのproposalをin-memory candidateとledgerへtransactionalに適用する。minimal patchを
優先するが、合法なscopeには、修正箇所との意味整合を回復するため変更が必要なschema-valid
fieldも含める。

Valid fragmentを置き換える前に、serverはschema、bounds、reference、domain invariant、authority、
disclosure、consumer safety、write scope、preservation、source accountingを確認する。Invalid
proposalはprior valid fragmentを維持し、正確なrepair findingを生成する。

### F7. Progressiveな構造・意味Validation

Validationを比例的かつ段階的に行う。

1. patchごとの即時hard check
2. 意味がdependent contentへ波及する前のsemantic-skeleton checkpoint
3. materialなdependency変更後のaffected-cluster check
4. owner review前の完全なfinal reconciliation

変更のないvalid workは再利用する。Checkpointは、named failure pathを、それによって避ける
手戻りより低い期待costで防げる場合だけ追加する。Whole-object LLM reviewを唯一のcorrectness
oracleにしない。

### F8. Input/Output Reconciliation

Final resultを、frozen input、authorized change、記録済みinterpretation、generated addition、
adjustment、retirement、deferralと比較する。Materialな関係を少なくとも次に分類する。

- preserved
- authorized change
- source-supported synthesis
- creative completion
- coherent interpretation
- low-importance adjustment
- valid deferralまたはpreserved retirement
- material contradiction
- source loss
- unsupported material addition
- unresolved material meaning

Schema validityによってfailed semantic reconciliationを上書きできない。最初の7分類はdomain
invariantを満たせばreview可能なsuccess stateになり得る。最後の4分類はfocused repair、または
F10を満たす場合はhuman Q&Aを必要とする。

### F9. 情報が増えるAutomatic Recovery

人間へ質問する前に、変更のないrequestを反復せず、適用可能で認可済みの回復を使い切る。
Deterministic resolution、focused generation/classification、cause-classified validation、exact
errorとprior valid fragmentを使うfocused repair、decomposition、別の事前認可resolver、
consumer-scoped typed deferralである。

各retryは情報を追加し、問題を狭め、またはmaterially differentなalternativeを検査しなければ
ならない。Blind retry、whole regeneration、未承認provider escalationは禁止する。

Provider障害、不正な結果、認可済み実行予算の枯渇により、attemptを失敗として終了できる。
元情報、そのidentity、失敗理由を保持する。明示的な再試行では新attemptを作り、
元情報・current pointerの変化を再確認し、保持した元情報と適用可能な認可済み入力から
コンテキストを再構築する。関連する確認回答と失敗情報も含める。
完了attemptのreplayを、新たなprovider実行として扱ってはならない。

途中candidate、移行用コンテキスト、checkpoint位置の永続化は必須ではない。
再試行では同じ部分作業フローで処理済みの作業を再計算してよく、その分tokenとcostが増える可能性がある。
この移行元からの再構築は許可するが、LLMへ全体を一括再生成させることは禁止したままとする。
インフラ状態の改善後に同じrequestを再実行することは可能だが、不正出力の反復には上記の
情報を増やす修復が必要である。予算枯渇だけで追加の有償実行は認可されない。
自動回復はすべてF15の上限内で行う。回復を使い切る要件は強制停止後まで代案探索を続ける
意味ではない。技術的な安全停止だけではF10を満たさず、オーナーへの意味的質問を強制しない。

### F10. 例外的なHuman Q&A

次のすべてが成立するときだけHuman Q&Aへ入る。

1. 単なる不足ではなくexplicit problemがある。
2. protected anchor、required correctness、またはmaterially defining traitに影響する。
3. 妥当なautomatic resolutionのprotected outcomeがmaterialに異なる。
4. focused automatic recoveryを使い切っている。
5. owner intentなしには安全に選択、整合、deferできない。

Questionは最小限の関連source/candidate projection、自動選択が危険な理由、妥当な選択肢の
bounded effect、free-form answer path、再開するexact workを提示する。Answerはappend-only scoped
authorityであり、final candidate acceptanceではない。回答後は、実行中のattempt、または元情報と
記録済み回答から再構築した新attemptで自動処理へ戻る。途中実行コンテキストの永続化は必須ではない。

### F11. Server管理のCompletionとActivation

Owner review前に、complete candidateがstrict target schemaと登録済みdomain、reference、compiler、
disclosure、consumer、preservation、accounting、coverage、reconciliation checkをすべて通過する。
Serverはcomplete candidateを検証するが、complete candidateやschemaをLLMへ送らない。

Owner acceptanceはexact candidateとreceiptをbindする。Append/CAS activationはprovider workを
行わない。Failure、decline、pointer drift、cancellation、technical recovery exhaustionはcurrent
immutable generationを変更しない。

### F12. Active Semantics外でのPreservation

変更、retire、または現在未使用のsource meaningのうち保持が必要なものは、restrictedで
versionedなpreservation contractに保存する。閲覧できるのは移行実行時の認可済みマイグレータだけであり、
その移行自身が行う検証も含む。独立したreview readerの許可は設けない。
通常のruntime、public、compiler、authoring consumerは退避領域を参照できない。

Retention、deletion、access、disclosure ruleはdomain/policy decisionのままである。基盤が
preservationを無期限保持authorityへ変換してはならない。

### F13. Compatibility-first Adoption

初期導入では、successor ADRが明示的にversion化またはsupersedeしない限り、既存public API、
immutable generation identity、authoring attempt identity、current-pointer behavior、battle binding、
Accepted common envelopeを維持する。初期変更はinternal orchestration/evidence abstractionであり、
新しいexternally visible product versionではない。

Character、battlefield preset、narration styleをconformance familyとする。V3 character authoringを
最初のadvanced consumerとする。Battle-runtime narrationはinitial lifecycleの対象外とするが、
別途設計されたsemantic-claim/provenance primitiveを将来再利用できる。

### F14. EvidenceとTuning

代表的なowner-reviewed corpusで次を測定する。

- automatic candidate completion
- protected-anchor preservation
- generated-information qualityとsemantic consistency
- unresolved material contradiction率とsource-loss率
- unnecessary human-question率とrecovery当たりquestion数
- recovery convergenceとrepeated-request率
- late-review reworkとcheckpoint blocking time
- provider call、token、latency、cost

既存のAccepted実行上限は明示的な置換まで適用を継続する。
新基盤のnumeric gate、corpus composition、model/provider route、retry budget、token/cost ceiling、checkpoint
budgetには、別途reviewされたevidenceとdecisionが必要である。このrequirement candidateでは
数値を作らない。

### F15. 機械的な実行安全策

LLMオーケストレータではなくサーバが、すべての自動attemptに次の安全策を強制する。
決定論的処理、LLMによる計画、Tool、レビュー、修復も含む。

1. **有限の資源上限。** LLM呼出回数、Tool・作業ステップ数、実行時間、token・cost消費に
   有限の上限を設ける。作業を投入する前に残予算を確認し、1呼出でattempt上限を迂回しないよう
   個々のrequestとresultも制限する。使用量を事前に確定できない場合は、未知をゼロとせず、
   保守的に許容できる上界を使う。分割、入れ子レビュー、resolver変更、修復、フェーズ遷移は
   attempt共通の累積計数を使い、リセットできない。必要な予算がなければ新しい作業を投入しない。
2. **一定区間での進捗監視。** 有限の観測区間で、意味のある進展が続けてない状態と、
   関連状態の反復・交互遷移を検出する。サーバで観測した義務、検証指摘、適用変更と、
   Adapterが定義するフェーズ別の進捗・状態同値性を使い、LLMの自己評価だけに依存しない。
   文章量やTool呼出回数の増加自体は進捗ではない。正当な調査や依存修復では指摘が一時的に
   増えてよく、毎ステップの改善や唯一の汎用意味スコアを必須としない。
   膠着・循環を検出したら、同じ上限内で、F9の情報を増やす有限の回復変更へ進む。
   許された区間・予算内で進捗を回復できなければ、ループを続けずattemptを失敗終了する。
3. **信頼する内部状態の整合性。** 更新境界と完了前に、candidate、義務・由来台帳、
   参照、合法なワークフロー遷移の整合を検査する。途中candidateが完全なtarget schemaを
   満たすことを要求するものではない。不正な外部提案はF6でtransactionalに拒否し、修復できる。
   対して、信頼するcandidate・台帳の不整合や不正な内部遷移により後続実行を信頼できない場合は、
   attemptを停止する。壊れた制御状態をLLMへ修復させない。
4. **安全停止と再試行。** 強制上限、有限の回復で解消しない膠着・循環、信頼できない内部状態では、
   そのattemptの後続自動実行を終了する。追加provider workを投入せず、失敗終了後の遅延結果も
   適用しない。実行中の処理も制限し、対応している場合は取消す。現行immutable generationを
   維持する。停止分類、消費予算、関連する進捗・不変条件の証拠、source identityを含み、
   F9の明示的新attempt再試行に十分なコンパクトな失敗記録を残す。
   停止を回避するため新attemptを自動開始しない。技術的失敗から自動的に人間の意味Q&Aへ
   進めず、その経路には引き続きF10を適用する。

カウンタ、有限の進捗履歴、途中candidateは実行中のメモリに保持してよい。
全会話、途中移行コンテキスト、checkpointの永続化は必須にしない。
再起動時に同じattemptをカウンタだけリセットして黙って再開してはならない。
移行元からの再試行は、新しい明示的要求によりF9に従う。

安全策は暴走実行を制限するものであり、少ない入力や許可された生成を制限するものではない。
意味的正しさの証明でも、F7・F8・F11の検査の代替でもない。
数値上限、観測区間、フェーズ規則、計数・取消の詳細、検出アルゴリズムは、
実動作への導入前に後継設計と代表的テストで定める。具体値が未決定でも無制限実行を許可しない。
既存の受理済み上限は明示的に置換されるまで有効とする。

## 初期Conformance Contract

Common kernelは、family-specific pathを埋め込まず、character、battlefield-preset、
narration-style adapterに対して同じlifecycle contractを実証しなければならない。Conformance
fixtureは少なくとも次を扱う。

1. sparse creationと安全なgenerated completion
2. consequential dependent changeを伴うmeaning-preserving revision
3. generated target meaningとsource dispositionを伴うsource-to-target migration
4. structural failure後にprior valid workを保つfocused repair
5. human inputなしに解決されるminor contradiction
6. 黙って上書きできないprotected contradiction
7. final structural validationとinput/output semantic reconciliation
8. ordinary consumerから除外されるrestricted preserved data
9. internal adoption中に変わらないpublic APIとimmutable-generation behavior
10. 分割・レビュー・修復でもattempt上限の累積計数を維持する
11. 進展のない反復とA/B状態の振動が、有限の回復または失敗に至る
12. 一時的後退を伴う有用な複数ステップ修復に、毎ステップ改善を誤って要求しない
13. 不正提案では信頼する状態を維持し、内部不整合では実行を停止する
14. timeout・予算枯渇で新規作業投入と遅延結果の適用を止める
15. checkpoint必須化や自動予算リセットを行わず、失敗記録から明示的に元情報で再試行できる

Generic conformanceを通ってもDomain Adapterの正しさは証明されない。各familyには独自のdomain
fixtureとAccepted済みschema/behavior authorityも必要である。

## 代案とTradeoff

### Family-specific Workflowを維持する

直近の抽象化作業は最小になるが、recovery、provenance、patch、review、Q&Aの重複が残るため、
採用しない。

### Universal Semantic Transformation Engineを作る

名目上の再利用は最大になるが、domain meaningをgeneric languageへ移し、asset固有correctnessを
隠し、現在のdelivery scopeを拡大するため、採用しない。

### Thin FoundationとDomain Adapter

明示的なadapter/conformance contractが増えるが、semantic authorityを各domainに残しながらstableな
process mechanicsを再利用できるため、採用する。

### 機械的安全策の代案

プロンプトによる注意だけなら実装は軽いが、有限の実行を強制できない。
強制上限だけなら消費を制限できるが、検出可能な循環に全予算を費やし得る。
毎ステップの単調な進捗ゲートは正当な依存修復を拒否する。
採用案の有限区間方式は、小さなメモリ上の計数とAdapterの指標契約を追加する。
誤検出・見逃しは調整上のリスクとして残る。checkpoint永続化エンジンは必要としない。

## RiskとUnknown

- 既存service間にはcurrent shared envelopeで表現されていない差異がある可能性がある。
  抽出時にfalse uniformityを強制せず、その差異を維持しなければならない。
- Importance classificationとsemantic lensがdefining meaningを過小保護、またはadaptable materialを
  過剰保護する可能性がある。Domain evaluationで両方の誤りを測定する。
- Capability promotionやcheckpointが多すぎるとprompt/control bloatを再発させ得る。Successor
  designでbounded exposureとremoval conditionを定める。
- Preservation storageはprivacy/retention riskを生む。正確なretention/access policyは未決定である。
- Numeric quality thresholdとprovider固有動作はbaseline evidence待ちで未決定である。
- 進捗指標は循環を見逃す、または有用な探索を止める可能性があり、代表テストで両方を扱う。
  強制上限は検出精度から独立して維持する。
- 取消後も投入済みrequestがprovider側で完了・課金される可能性がある。request制限と保守的計数で
  消費を制限するが、取消により追加provider costがゼロになるとは保証しない。

## 受入基準

1. Accepted済みno-invention upgrade ruleを、protected/server-owned factの生成を許さない、分類・
   provenance付きsynthesisへ明示的に置き換える。
2. Foundationはprocess/evidence mechanicsを所有し、Domain Adapterはschema、semantic policy、
   invariant、projectionを所有する。
3. Create、revise、migrateはdistinct frozen authorityを持つ1つのlifecycleを使う。
4. Sparse inputは原則としてhuman Q&Aではなくgenerationへ入る。
5. LLM workはfocusedであり、complete schemaやcomplete candidateを受け取らない。
6. LLMはbounded proposalを返し、authoritative stateを直接永続化できない。
7. Repairはsemantic consistencyに必要なvalid fieldも更新できるが、登録dependency closureから
   逸脱できない。
8. Structural validationとfinal input/output semantic reconciliationを両方必須とする。
9. Automatic recoveryの各retryは情報を増やすか別alternativeを検査し、blind retryと
   whole-object regenerationを禁止する。
10. Human Q&AにはF10の5条件すべてが必要で、final acceptanceを意味しない。
11. Preserved retired informationはrestrictedで、ordinary consumerから除外する。
12. Initial adoptionは既存public API、immutable generation、attempt identity、current pointer、
    battle bindingを維持する。
13. Character、battlefield preset、narration styleがcommon conformanceを満たし、character V3を
    first advanced consumerとして維持する。
14. Battle-runtime narrationをinitial authoring lifecycleへ含めない。
15. Evaluationはnumeric gateを創作せず、semantic quality、recovery、human intervention、rework、
    call、token、latency、costを報告する。
16. Requirement acceptanceをADR、implementation、provider、deployment、migration、activation、
    release authorityから分離する。

17. 失敗attemptは元情報identityと失敗理由を保持し、途中candidate/contextの永続化を必須とせず、
    明示的な移行元からの再試行を可能にする。
18. Q&A回答後は自動処理へ戻り、元情報からの再構築を許可する。
19. 退避情報は移行時の認可済みマイグレータだけが閲覧でき、既存キャラクタカプセルの保持・アクセス
    制限を維持する。

20. サーバが有限の資源上限を強制し、attempt内の全作業を合算する。修復・分割・フェーズや
    resolver変更ではリセットできない。
21. 観測済みかつドメインを考慮した指標で膠着・振動を有限区間で検出する。有用な一時後退を
    許容し、有限の回復が不成功なら終了する。
22. 内部整合性検査は修復可能な外部提案と内部破損を区別する。失敗終了後に遅延結果を適用したり、
    データを有効化したりできない。
23. 安全停止ではコンパクトな診断記録を保持し、全コンテキスト・checkpointの永続化や自動再開始を
    必須とせず、明示的に元情報から再試行できる。

## 対象外

- Asset family field semanticsの定義または変更
- Battle-runtime narrationのinitial lifecycleへの一般化
- Exact API、persistence table、module path、patch schema、status name、Skill format、Tool schema、
  provider adapter、promotion protocolの選択
- Numeric threshold、provider route、retry budget、production policyの選択
- 実装、paid/live provider評価、deployment、production data migration、candidate activation、
  pointer移動、rollback、release

## 独立Reviewへ提示する論点

候補が既存の生成許可・全体レビュー・修復予算の契約を正確に対応づけているか、checkpoint永続化を
必須とせず失敗後に元情報から再試行できるか、退避情報の閲覧を移行時のマイグレータに限定するか、
semantic authorityをDomain Adapterに
維持しているか、unsafe inventionなしにsparse generationとmeaning-preserving transformationを
支援しているか、structural/semantic correctnessを両方要求しているか、automatic recoveryが
情報を増やしhuman Q&Aを例外にしているか、initial adoptionで既存external behaviorを維持するか、
battle-runtime narrationやimplementation detailをrequirementへ持ち込んでいないか、numeric gateと
provider policyを明示的なunknownとして残しているかを確認する。

revision 3の追加論点: F15は毎ステップの意味改善や不要な永続状態を要求せず、実行を機械的に
制限するか。通常の提案拒否と内部破損を区別するか。ドメイン指標、既存上限、遅延結果、
技術的失敗、人間Q&AをそれぞれのAuthority内に保つか。
制御可能なAdapterを使い、有償provider呼出なしにすべての安全基準を検証できるか。
キャラクタrevision 4はv2参照の未受理候補のままで、今回の受理だけでその依存を書き換えない。

## Step 2で選択するRoute

このcandidate snapshotを確認後、ownerは次のいずれかを選択する。

- `REVISE`: candidateを修正し、Step 1から再開する。
- `REVIEW_THEN_REVISE`: owner questionを追加して独立review後、Step 1へ戻る。
- `REVIEW_THEN_DECIDE`: owner questionを追加して独立review後、Step 4へ進む。
- `REVIEW`: owner questionを追加せず独立reviewし、Step 4へ進む。

Candidateの文言変更は新revisionとなり、以前のreview状態を引き継がない。
