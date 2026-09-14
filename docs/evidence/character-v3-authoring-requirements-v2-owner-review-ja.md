# 回復可能な焦点化V3キャラクター・オーサリング要件rev2 — オーナーレビュー支援

- Lifecycle: requirement-authority-review Step 2待ち
- 英語正本: `docs/character-v3-authoring-requirements-v2.md`
- 正本digest短縮表記: `6f6a49d2…`
- 状態: Step 1 candidate、自己レビュー完了、未承認
- 置換対象: review中のrevision 1。revision 1自体は履歴として保持
- この文書は正本全体の日本語訳とレビュー情報であり、正本ではない

## 目的・概要

V3新規生成、V3修正、V2→V3移行を、一つの回復可能なauthoring coreで扱う。
十分な入力と利用可能な承認済みserviceがあれば、最終owner acceptance前まで自動で完全な
candidateを生成する。自動回復で解けない意味不足はNG終了にせず、答えられる最小質問へ変換し、
回答を同じattemptへ追記して対象Work Itemから再開する。

LLMを含むresolverは候補を提案するだけで、完全性、入力との無矛盾、Schema、権限、activationは
serverが所有する。

## revision 1からの重要差分

1. 最終input/output semantic reconciliationを独立gateとして追加。
2. bounded automatic recovery cascadeを追加。
3. semantic uncertaintyをterminal rejectionではなくrecoverable owner-input stateへ変更。
4. 質問・回答をprovenance付きの永続状態として定義し、同じattemptへ復帰させる。
5. semantic Q&A、transient retry、operator recovery、owner cancellationを分離。
6. 「ほとんど自動成功」を測るcorpus指標を要求。ただし数値thresholdは未決定のまま明示。

## 完全な日本語訳

### 回復可能な焦点化V3キャラクター・オーサリング — 要件候補revision 2

- 状態: Step 1 candidate、自己レビュー完了、第一回owner review待ち
- 日付: 2026-09-11
- 決定者: Product owner
- review上の置換対象: `character-v3-authoring-requirements-v1.md`
- 対象: V3新規生成、V3修正、V2→V3移行
- source: revision 1、最終入出力整合・自動成功・人間Q&A回復に関するowner指摘、承認済み
  structured-asset authoring workflow、ADR-0010/0011/0014/0027/0028、承認済みmigration
  requirement rev6、承認済みADR-0030

#### 目的

次の3入口に一つのrecoverable V3 character-authoring processを使う。

1. owner natural sourceから新しいcomplete strict V3 characterを作る。
2. existing V3 generationとowner-requested changeから新しいimmutable V3 revisionを作る。
3. V2には適合するがV3では情報不足または役割が異なるcharacterをcomplete strict V3へ移行する。

入力が十分でconfigured serviceが利用可能なら、通常結果はvalidated owner-review candidateの自動生成で
ある。semantic uncertaintyをgeneric rejectionで終了しない。まずbounded automatic recoveryを行う。
required meaningが残れば、最小で回答可能なprovenance-linked questionを作り、recoverable stateを保存し、
owner answerをauthoritative input addendumとして凍結し、同じattemptのaffected Work Itemから再開する。

serverがcomplete assembly、validation、source/output reconciliation、recovery routingを所有する。
mechanical rule、focused LLM、owner answerは同じtyped patch、receipt、validation boundaryを使う。
モデル一回にwhole characterの理解、validation、regenerationを任せない。

#### Authority disposition

##### 維持するauthority

- ADR-0010: immutable generation、persisted idempotent attempt、compatibility、owner acceptance、
  append/CAS activation、read-only battle binding。activation内provider work禁止を維持。
- ADR-0014: queued authoring。submit/read routeはproviderを実行せずworkerがattemptを進める。
- ADR-0011: structured truth、derived public presentation、disclosure gate、owner confirmation、battle
  state分離。V2専用authoring詳細はV3 successor ADRを必要とする。
- ADR-0027/0028: authored input、conscious judgment、reaction-only psyche、deterministic engine ruleの
  runtime責務境界。
- migration requirement rev6: V2 exact preservation、typed defer、drift、本番manifest scope、本番authority gate。

##### 一般化または置換するauthority

- ADR-0030のmigration operation、preservation、receipt、bounded repair、owner-review原則を共通coreへ一般化。
- ADR-0030 D8のcomplete-source／complete-candidate LLM reviewを、complete server validation、focused
  semantic lens、明示的final input/output reconciliationへ置換。
- ADR-0030 D9のwhole-candidate LLM re-reviewを、bounded automatic recovery、focused retry、persistent
  human Q&A resumptionへ置換。
- public API、persistence、lifecycle status、prompt、response schema、contract identityはsuccessor ADRで
  決定し、既存qualified identityを明示的に維持またはsupersedeする。

このrequirement acceptanceが許可するのはnormative requirement baselineだけである。ADR、implementation、
provider use、deployment、policy activation、本番migration、candidate acceptance、pointer movement、rollback、
releaseは許可しない。

#### Required outcome semantics

##### R1. Validationを弱めないsuccess-first

authoritative inputが十分なcaseは、final owner review前にhuman interventionなしでcomplete validated candidateへ
到達するよう設計する。source meaning削除、unsupported value創作、disclosure拡張、defer濫用、schema/semantic
validation緩和、unresolved obligationのcomplete扱いでautomatic successを増やしてはならない。

automatic completion不能でもactionable recovery stateを生成する。semantic ambiguityとauthor intent不足だけで
terminal character rejectionにしない。

##### R2. Mode別の凍結authority

attemptは一つのmodeとauthoritative inputを凍結する。

- create: owner natural source、許可参照material、accepted clarification、V3 contract、authoring policy。
- revise: exact immutable V3 source、owner change request/clarification、許可参照material、V3 contract、expected pointer。
- migrate: exact V2 source、accepted transition rule、許可natural source/clarification、V3 contract、compatibility、expected pointer。

revisionではowner change requestがresolved scope内だけ旧V3より優先する。migrationではaccepted transitionが
explicit semantic changeを許可できる。consistencyは全historical valueとのbyte equalityではなくunauthorized
contradictionの不在である。

attempt、provider request、Work Item、question、answer、candidate、generation、pointerは別identity。

##### R3. Reusable schema-transition blueprint

schema factはsource/target contract pairごとに一度compileし、character requestごとに再発見しない。
versioned blueprintはcopy、move、split、changed-role、added、retired、reference、disclosure、consumer、semantic
dependency ruleを識別し、character固有の推測を含めず、existing attemptを再解釈しない。

##### R4. Server-owned baseline

- create: server constant、安全なbounded default、unresolved target obligationを持つtyped V3 scaffold。
- revise: immutable V3 sourceのexact clone。
- migrate: blueprint-authorized deterministic copy/move。

defaultはcharacter fact、relationship、ability、knowledge、mechanics、disclosure right、owner intentを創作しない。

##### R5. Provenance-linked input claim ledger

material input claim、constraint、requested change、clarification、accepted transformation、unresolved conflictを
exact source provenance付きで記録する。長いnatural sourceはsegment化できるが、全material segmentをcoverageし、
cross-segment contradictionを残す。

owner answerはnew authority recordとしてappendし、prior inputを書き換えない。authority順序とscopeをreview可能にする。

##### R6. Obligation ledger

serverはcompleteness authorityとしてtyped obligation ledgerを管理する。各obligationはprovenance、dependency
scope、status、resolver、attempt history、receiptを持つ。

- Create: 全required V3 targetと、表現・意図的省略・clarify対象の全material input claim。
- Revision: requested change、affected dependant、unrelated V3 meaning保存の証明。
- Migration: 全relevant V2 dispositionと全required V3 target。固定map不在でsourceを消さない。

終了状態はresolved、valid defer、preservation付きintentional retire、needs owner input、technically blocked、
recorded non-semantic system defectによるfailed、explicit cancelledだけ。selected consumer setで許可されたresolved
stateだけがfinal owner reviewへ進む。

##### R7. Focused semantic Work Item

unresolved obligationをarbitrary byte/fieldではなくdeclared semantic dependencyでgroup化する。Work Itemには
relevant source claim/fragment、current target/dependency、sliced writable schema、registered reference/constraint、
必要ID、relevant prior result、scope内error/questionだけを含める。

complete V3 schema、complete candidate、global path全体を便宜で含めない。closureがapproved budgetを超える場合、
decompose、owner input、technical blockのいずれかにし、黙ってrequestを拡大しない。

##### R8. Resolver-neutral focused output

deterministic resolver、configured focused LLM、owner answer、valid typed deferのいずれも、affected obligation、
target/source fragment、provenance、preservation effect、semantic dependant、説明、unknownを持つ同じbounded typed
patch/decisionを返す。

LLMはcomplete characterまたはregistered closure外を書かない。ID、reference、runtime fact、engine rule、disclosure、
ownership、validation、activationはserver authority。

##### R9. Local applyとvalidation

serverは一つのaccepted Work Item resultをin-memory candidate/ledgerへtransactionally適用し、local schema、bound、
reference、disclosure、consumer、preservation、source accounting、conflictを検証する。invalid outputはprior valid
fragmentを置換しない。

server dependency、model-declared dependant、semantic findingはclosureを拡張できる。affected obligationだけをreopenし、
local failureでwhole-character regenerationしない。

##### R10. Bounded automatic recovery cascade

human input前に、適用可能でconfiguredかつauthorizedな次の自動回復を、unchanged requestを反復せず実行する。

1. deterministic exact/rule-complete resolution
2. unresolved semantic workへのfocused generation/classification
3. local validationとcause classification
4. exact error/cause、prior valid fragment、affected closureを使うfocused repair
5. over-broad/conflicting Work Itemを小さなsemantic obligationへdecompose
6. route/budget/data useが独立承認済みの場合だけ別configured resolver/model
7. selected consumerに不要なmeaningだけtyped defer

各stepは情報を増やすか、検査するalternativeを変える。blind retry、whole-output regeneration、unauthorized paid/provider
escalationは禁止。

##### R11. Human Q&A recovery

automatic recovery後もrequired obligationが残れば、attemptをsemantic rejectionではなくpersistent recoverable
owner-input stateへ移す。質問はexact obligationへlinkし、次を示す。

- ownerが理解できるunresolved claim/contradiction
- 自動判断できなかった理由
- 最小限のrelevant source/candidate projection
- bounded choiceとbehavior/disclosure/preservation effect
- 選択肢で足りない場合のfree-form回答
- 回答後に再開するwork

一つのanswerで解けるときだけquestionをgroup化し、重複を除く。raw schema path、internal ID、provider error、hidden
chain-of-thoughtの理解をownerへ要求しない。

##### R12. Answer authorityとresumption

owner answerはappend-only、provenance-linked、question-scopedで、同じattemptのauthoritative input addendumとして
freezeする。final candidate acceptanceではなく、activationしない。

answerは宣言scopeのclaim/obligationだけを変更し、affected dependantをreopenし、focused Work Itemを再構築して
automatic processへ戻す。relevant lens/final gateを再実行し、unrelated valid workを再利用する。新たに区別できた不足
decisionなら複数Q&A roundを許可するが、equivalent question反復はdefect。

##### R13. Focused semantic lens

versioned/machine-checkable lensは少なくとも次をcoverageする。

- identity、background、disposition、goal、guidance、action norm
- ability、combat parameter、action reference、loadout、fallback
- relationship、self-awareness、speech policy、counterpart effect
- appearance、public presentation support、disclosure、consumer
- cross-reference、provenance、authority consistency

各lensはprojectionだけを受け、input claim/obligationへlinkしたbounded findingを返す。deterministic、LLM-assisted、
owner-reviewedのいずれでもよく、whole-character LLM requestをoracleにしない。

##### R14. Final input/output semantic reconciliation

assembly後、各lensはmode別authoritative input claim、authorized change、transformation record、final V3 projectionを比較し、
preserved、authorized change、source-supported synthesis、explicit creative addition、valid defer、preservation付きretire、
contradiction、source loss、unsupported addition、unresolvedへ分類する。

serverがverdictを機械集約する。contradiction、source loss、unsupported addition、unresolved required meaningはcandidate-
readyをblockし、focused repairまたはowner question obligationを作る。schema validityはこのgateを上書きできない。

##### R15. Complete server validation

final owner review前に、complete strict V3 schemaと全server invariantを通す。reference、action legality、compiler
compatibility、disclosure、consumer、ledger closure、preservation、source accounting、lens coverage、final reconciliation、
unresolved required meaning不在を含む。

whole candidateはserverが処理し、LLMへ送る必要はない。structurally validでもsemantically unresolvedならactivate不可。

##### R16. Deferralとpreservation

active CharacterDefinitionV3はstructurally complete。selected consumerに不要なoptional meaningだけ、active field外の
accepted typed deferred collectionを使える。required valueへsentinel、fabricated empty、deferを使わない。

migrationはchanged/retired V2をrestricted capsuleへ保存。revisionはretentionがreversibilityに必要ならdisplaced V3を
保存。creationはpermitted source/decision provenanceを保持。preserved dataはordinary runtime/public/authoring consumerから除外。

##### R17. Owner reviewとactivation

safe projectionとmode別semantic diffでcomplete candidateを提示する。

- create: input intent、created fact、creative addition
- revise: old/new V3、requested/consequential change、unexpected change
- migrate: 全V2 dispositionからpreserved/moved/split/transformed/synthesized/retired/deferred結果

Q&A answerはfinal acceptanceを代替しない。acceptanceはexact candidate/receiptへbindする。public presentationはvalidated
truthから派生し、append/CAS activation内でproviderを呼ばない。failure、decline、drift、cancelはcurrent generationを変更しない。

##### R18. Recoverable conditionとterminal condition

semantic ambiguity、authoring detail不足、focused model failure、repair exhaustionはQ&Aまたはretryable recoveryへ進み、
terminal invalid-character labelにしない。

transient provider/infrastructure faultはrecorded stateからretryable。integrity conflict、unsupported schema/compiler defect、
implementation faultはtechnical/operator recoveryへ進む。explicit owner cancellation、authorized deletion、別途governedな
unrecoverable integrity/security conditionだけがcandidateなしでattemptを閉じられる。いずれもcurrent generationを変更せず、
character concept自体がinvalidとは主張しない。

##### R19. Automatic-completion evidence

rollout前に、owner-reviewed representative corpusで、create/revise/migrateのautomatic candidate completion、auto repair、
question rate、recovered character当たりquestion数、repeated-question defect、latency、provider call、token/cost、final
semantic correctnessを測る。required meaningをdrop/fabricate/improper deferしたり、final owner reviewに発見を委ねたcaseを
automatic successへ数えない。

「ほとんど」の数値定義、corpus構成、release thresholdはlocalおよびaccepted live-model evidenceに基づく別owner decision。
このcandidateでは数値を創作しない。

#### Mode別completion contract

##### Create

allowed owner inputを表現し、supported derivationとcreative additionを区別し、unresolved required target/source claimがなく、
final semantic reconciliationを通ったcomplete strict V3 candidateを一つ作る。

##### Revise

exact immutable V3 sourceからcomplete strict V3 candidateを一つ作る。requested changeとconsequenceを明示し、unrelated
meaningを保存またはaccountする。source generationをin-place変更しない。

##### Migrate

complete strict V3 candidateとrequired preservation/source-disposition recordを作る。全relevant V2 valueとrequired V3
targetをaccountし、unauthorized contradiction、silent loss、fabrication、unresolved required meaningを残さない。

#### Alternativesとtradeoff

- bounded repair後terminal failure: 単純だがanswerable gapをrejectし、回復目的を満たさない。
- automatic relaxation／broad regeneration: 見かけの成功率は上がるがmeaning loss/inventionを隠し、成功ではない。
- automatic-first focused recovery＋persistent Q&A: question/answer/resumption stateと評価costは増えるが、strict correctnessを
  保持しつつanswerable caseを成功routeへ戻す。候補の選択案。

#### Assumptionsとunknown

- automatic-completion数値thresholdとrepresentative corpusはowner未選択。
- Work Item token limit、repair count、question batching、total attempt budgetはsuccessor ADR/provider policy判断。
- semantic lens coverageは実証が必要。optional future lensはrequirement revisionなしにblockerにならない。
- generalized patch/question/answer/lifecycle status/receipt identityは未決定で、既存名を黙って再利用しない。
- Local Ollama/xAIのquality、latency、cost、recovery-rate evidenceは別。

#### Acceptance criteria

1. 3 modeが共通orchestrationとmode別authority/obligationを使う。
2. sufficient-input fixtureがfinal owner acceptance前までhumanなしでcomplete candidateへ到達する。
3. drop/fabricate/improper defer/semantic unresolvedをautomatic successへ数えない。
4. LLM fixtureへcomplete V3 schema/candidate/global path listを渡さない。
5. auto recoveryがcause-informed focused repair、decomposition、valid-work reuse、no blind retryを示す。
6. exhausted semantic recoveryがterminal rejectionではなくminimal/deduplicated owner questionを作る。
7. answerがappend-only scoped authorityで、same attemptをresumeし、affected obligationだけをreopenし、final acceptanceを意味しない。
8. multiple Q&Aがequivalent questionを反復せず、新たなuncertaintyへ進む。
9. final reconciliationが全modeでunauthorized contradiction/source loss/unsupported addition/unresolved required meaningを検出する。
10. complete server validationがstructure/reference/legality/capability/disclosure/preservation/accounting/coverage/reconciliation failureを拒否する。
11. technical failureがretryable/operator-recoverableでcurrent generationを変更しない。
12. mode別final diffとexact owner acceptance後に、providerなしappend/CAS activationする。
13. existing V2/V3 generation、battle binding、queued authoring、public projection authorityと互換。
14. representative-corpus reportがmetricをgamingせずautomatic completion/human recoveryを示す。
15. provider selection、live evaluation、deployment、本番execution、policy activation、rollback、releaseは別gate。

#### Out of scope

- CharacterDefinitionV3 field semantics変更
- 数値success target、provider/model、token/cost ceiling、fallback policy選択
- UI/persistence/worker/adapter/compiler/database実装
- paid/production call、deployment、本番migration、candidate acceptance、pointer移動、policy activation、rollback、release
- 他asset familyへの一般化

#### Proposed independent-review input

independent reviewerは、automatic successがstrictか、answerable semantic failureがすべてQ&Aからresumeできるか、final
reconciliationがauthorized changeとcontradictionを区別するか、human answerがimplicit acceptanceではなくscoped authorityか、
technical recoveryが分離されるか、existing authority/nameが保持されるか、未選択threshold/future workをacceptance blockerへ
していないかを確認する。

## 論点

1. semantic uncertaintyをterminal NGにせず、必ずQ&Aまたは明示的technical recoveryへrouteする境界は妥当か。
2. automatic recovery cascadeの順序と「同じrequestをblind retryしない」制約は妥当か。
3. owner answerをsame attemptのappend-only authorityにし、final acceptanceと分離する設計は妥当か。
4. automatic successをvalidation緩和やover-deferで水増ししない評価要件は十分か。
5. 「ほとんど」の数値thresholdを今回決めず、live evidence後の別owner decisionにすることは妥当か。

## 第一回オーナーレビューroute

- `REVISE`: independent review前にrev3を作成。
- `REVIEW_THEN_REVISE`: 質問を追加してreview後、必ず新revisionへ戻る。
- `REVIEW_THEN_DECIDE`: 質問を追加してreview後、Step 4で判断。
- `REVIEW`: 追加質問なしでindependent review後、Step 4で判断。

Step 2では要件acceptはできない。上記routeのいずれかを選ぶ。

