# 構造化意味オーサリング基盤 — 要件候補 revision 1 日本語レビュー訳

> この文書は `docs/structured-semantic-authoring-foundation-requirements-v1.md`
> の全レビュー範囲の日本語訳である。英語版が正本であり、本訳はユーザレビュー
> 支援用である。
> Review対象SHA-256: `b519d368672338d682b9b34c8a442bbd3279f157a46c08b11e579ef1e1caa79d`

- 状態: Step 1候補、セルフレビュー完了、オーナーレビュー待ち
- 日付: 2026-09-11
- 意思決定者: Product owner
- 対象: 構造化された選択可能アセット向けの再利用可能なオーサリング
- 初期適合対象: キャラクタ、戦場プリセット、ナレーションスタイル
- 最初の高度利用者: V3キャラクタの作成、修正、移行
- 根拠: Accepted済みの構造化選択可能アセット作成ワークフロー、Accepted済みの
  構造化アセットEnvelope/Projection決定、キャラクタV3作成要件候補revision 3、
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

### F10. 例外的なHuman Q&A

次のすべてが成立するときだけHuman Q&Aへ入る。

1. 単なる不足ではなくexplicit problemがある。
2. protected anchor、required correctness、またはmaterially defining traitに影響する。
3. 妥当なautomatic resolutionのprotected outcomeがmaterialに異なる。
4. focused automatic recoveryを使い切っている。
5. owner intentなしには安全に選択、整合、deferできない。

Questionは最小限の関連source/candidate projection、自動選択が危険な理由、妥当な選択肢の
bounded effect、free-form answer path、再開するexact workを提示する。Answerはappend-only scoped
authorityであり、final candidate acceptanceではない。

### F11. Server管理のCompletionとActivation

Owner review前に、complete candidateがstrict target schemaと登録済みdomain、reference、compiler、
disclosure、consumer、preservation、accounting、coverage、reconciliation checkをすべて通過する。
Serverはcomplete candidateを検証するが、complete candidateやschemaをLLMへ送る必要はない。

Owner acceptanceはexact candidateとreceiptをbindする。Append/CAS activationはprovider workを
行わない。Failure、decline、pointer drift、cancellation、technical recovery exhaustionはcurrent
immutable generationを変更しない。

### F12. Active Semantics外でのPreservation

変更、retire、または現在未使用のsource meaningのうち保持が必要なものは、restrictedで
versionedなpreservation contractに保存する。認可された将来migrationとreviewでは利用できるが、
Accepted transitionが明示的に選択しない限り、通常のruntime、public、compiler、authoring
consumerは参照しない。

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

Numeric gate、corpus composition、model/provider route、retry budget、token/cost ceiling、checkpoint
budgetには、別途reviewされたevidenceとdecisionが必要である。このrequirement candidateでは
数値を作らない。

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

## RiskとUnknown

- 既存service間にはcurrent shared envelopeで表現されていない差異がある可能性がある。
  抽出時にfalse uniformityを強制せず、その差異を維持しなければならない。
- Importance classificationとsemantic lensがdefining meaningを過小保護、またはadaptable materialを
  過剰保護する可能性がある。Domain evaluationで両方の誤りを測定する。
- Capability promotionやcheckpointが多すぎるとprompt/control bloatを再発させ得る。Successor
  designでbounded exposureとremoval conditionを定める。
- Preservation storageはprivacy/retention riskを生む。正確なretention/access policyは未決定である。
- Numeric quality thresholdとprovider固有動作はbaseline evidence待ちで未決定である。

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

## 対象外

- Asset family field semanticsの定義または変更
- Battle-runtime narrationのinitial lifecycleへの一般化
- Exact API、persistence table、module path、patch schema、status name、Skill format、Tool schema、
  provider adapter、promotion protocolの選択
- Numeric threshold、provider route、retry budget、production policyの選択
- 実装、paid/live provider評価、deployment、production data migration、candidate activation、
  pointer移動、rollback、release

## 独立Reviewへ提示する論点

候補が競合するno-invention ruleを明確にsupersedeしているか、semantic authorityをDomain Adapterに
維持しているか、unsafe inventionなしにsparse generationとmeaning-preserving transformationを
支援しているか、structural/semantic correctnessを両方要求しているか、automatic recoveryが
情報を増やしhuman Q&Aを例外にしているか、initial adoptionで既存external behaviorを維持するか、
battle-runtime narrationやimplementation detailをrequirementへ持ち込んでいないか、numeric gateと
provider policyを明示的なunknownとして残しているかを確認する。

## Step 2で選択するRoute

このcandidate snapshotを確認後、ownerは次のいずれかを選択する。

- `REVISE`: candidateを修正し、Step 1から再開する。
- `REVIEW_THEN_REVISE`: owner questionを追加して独立review後、Step 1へ戻る。
- `REVIEW_THEN_DECIDE`: owner questionを追加して独立review後、Step 4へ進む。
- `REVIEW`: owner questionを追加せず独立reviewし、Step 4へ進む。

Candidateの文言変更は新revisionとなり、以前のreview状態を引き継がない。
