# V3キャラクター・オーサリング要件 revision 1 — オーナーレビュー支援

- Lifecycle: requirement-authority-review Step 2（第一回オーナーレビュー待ち）
- 英語正本: `docs/character-v3-authoring-requirements-v1.md`
- 正本SHA-256短縮表記: `0fa4c455…`
- 状態: Step 1 candidate、自己レビュー完了、未承認
- 決定者: プロダクトオーナー
- 日付: 2026-09-11
- この日本語訳はレビュー支援であり、正本ではない

## 目的・概要

新規V3生成、既存V3修正、V2からV3への移行を、同じ検証・レビュー・不変generation
作成のcoreで扱う。ただし、3モードの入力と完全性の証明義務は混同しない。

完全なV3候補を組み立て、最終的に検証する責任はサーバーに置く。LLMを使う場合は、
1回の要求と応答を一つの意味Work Itemとその限定された依存closureに絞る。機械処理、
LLM、オーナー判断、正当なdeferは同じ型付き・receipted境界へ戻し、同じサーバー検証を
通す。

## 以前の承認状態からの重要差分

1. ADR-0030の移行専用processを、create／revise／migrate共通coreへ一般化する。
2. 完全sourceと完全candidateを一度にLLMへ渡すADR-0030 D8を維持しない。
3. 全体完全性は、LLMの全体理解ではなくobligation ledgerと完全なサーバー検証で証明する。
4. 全体の意味確認は、明示的で重なりを持つfocused semantic lensに分割する。
5. 現行の不変generation、queue、owner acceptance、CAS、runtime責務境界は維持する。

## 完全な日本語訳

### V3キャラクター・オーサリングの焦点化 — 要件候補 revision 1

- 状態: Step 1 candidate、自己レビュー完了、第一回オーナーレビュー待ち
- 日付: 2026-09-11
- 決定者: プロダクトオーナー
- 対象: V3キャラクター新規生成、V3キャラクター修正、V2→V3キャラクター移行
- 情報源: 承認済みstructured asset authoring workflow、ADR-0010、ADR-0011、
  ADR-0014、ADR-0027、ADR-0028、承認済みcharacter semantic migration要件rev6、
  承認済みADR-0030、2026-09-11のLLM入出力焦点化に関するオーナー方針

#### 目的

次の3入口に対し、一つのV3キャラクター・オーサリングprocessを使う。

1. オーナーが与えた自然言語sourceから、新しい完全で厳格なV3キャラクターを作る。
2. 既存V3 generationとオーナーの変更要求から、新しい不変V3 revisionを作る。
3. V2には適合するが、V3では情報不足または役割が異なるキャラクターを、完全で厳格な
   V3 generationへ移行する。

完全なcandidateはサーバー所有のorchestrationが組み立てて検証する。モデル呼出し一回に、
キャラクター全体の理解または再生成を任せない。LLMを使う場合、各要求と応答は一つの明示的な
semantic Work Itemと限定された依存closureだけを対象とする。機械規則、LLM、オーナー判断の
どれでWork Itemを解決しても、サーバー検証用の同じ型付き・receipted結果を生成する。

#### authorityの扱い

##### 維持するauthority

- ADR-0010は、不変generation、永続化された冪等attempt、compatibility、owner acceptance、
  append/CAS activation、read-only battle bindingを引き続き所有する。provider workを
  activation transaction内で実行しない。
- ADR-0014はqueued authoring executionを引き続き所有する。submit/read routeはprovider
  workを実行せず、authoring workerがattemptを進める。
- ADR-0011はstructured character truth、derived public presentation、disclosure gate、
  activation前確認、battle stateとの分離を引き続き所有する。ただしV2専用のauthoring詳細は、
  V3用successor ADRが必要である。
- ADR-0027とADR-0028は、authored character input、conscious judgment、reaction-only psyche、
  deterministic engine validation間のruntime責務境界を引き続き所有する。authoringはruntime
  責務を移動しない。
- 承認済みsemantic migration要件rev6は、V2 sourceの厳密な保全、型付きdefer、source/pointer
  drift、本番manifest scope、既存の本番移行authority gateを引き続き所有する。

##### 一般化または置換するauthority

- ADR-0030のmigration operation、preservation、receipt、限定repair、owner review原則を、
  共通authoring coreへ一般化する。
- ADR-0030 D8の完全source／完全candidate LLM reviewは維持しない。完全な決定論的検証は
  必須のまま、意味reviewを明示的なfocused dependency lensで行う。
- ADR-0030 D9のwhole-candidate LLM re-review sequenceは、successor ADRでWork Itemと
  semantic lensのretry ceilingへ置換する必要がある。
- この要件では、最終的なpublic API、persistence、prompt、response schema、contract
  version名を決めない。successor ADRは、実装前に既存qualified identityをすべて列挙し、
  維持またはsupersedeを明記しなければならない。

この要件のacceptanceが許可するのは要件baselineだけである。successor ADR、実装、provider利用、
deployment、authoring-policy activation、本番migration、candidate acceptance、pointer移動、
rollback、releaseは承認しない。

#### 共通authoring model

##### R1. モード別の凍結入力

各attemptはmodeを一つだけ宣言し、その入力identityを凍結する。

- `create`: owner-provided natural source、許可された参照material、選択したV3 target contract、
  現在のauthoring policy。
- `revise`: 厳密なcurrent V3 generation、オーナー変更要求、許可された参照material、選択した
  V3 target contract、expected current pointer。
- `migrate`: 厳密なV2 source generation、許可されたnatural-source material、選択したV3
  target contract、compatibility state、expected current pointer。

attempt、provider request、Work Item、candidate、generation、current pointerは別identityである。
replayとregenerationの規則はこれらを混同しない。

##### R2. 再利用可能なschema-transition blueprint

schema levelの事実は、承認済みsource/target contract pairごとに一度compileし、各character
requestで再発見しない。blueprintはexact-copy、rename/move、split、changed-role、added、retired、
reference、disclosure、consumer、semantic-dependency規則を識別する。character固有の推測事実を
含めない。

createとV3 reviseはV3 identity blueprintを使う。migrationは承認済みV2→V3 transition
blueprintも使う。blueprint変更はversionedとし、既存attemptを再解釈しない。

##### R3. サーバー所有baseline

サーバーは無制限なモデルrewriteを使わずinitial candidateを構築する。

- createは、server-owned constant、限定default、明示的な未解決target obligationだけを持つ
  typed empty V3 scaffoldから始める。
- reviseは、不変source V3 definitionの厳密cloneから始める。
- migrateは、V2→V3の意味が変わらないとtransition blueprintで承認されたdeterministic
  copy/moveから始める。

defaultはcharacter fact、relationship、ability、knowledge、disclosure right、mechanics、
author intentを創作してはならない。

##### R4. Obligation ledger

サーバーは完全性authorityとして、一つのtyped obligation ledgerを管理する。各obligationは
provenance、dependency scope、status、resolver、receiptを持つ。

- Create obligationは、全required V3 targetと、表現・意図的省略・review返却のいずれかが必要な
  material owner-source claimを対象にする。
- Revision obligationは、要求変更、そのsemantic dependant、影響外V3 meaningが変わっていない
  証明を対象にする。
- Migration obligationは、全relevant V2 source dispositionと全required V3 targetを対象にする。
  固定field mapがないことを理由にsource valueを消してはならない。

obligationの終了状態は、resolved、validly deferred、必要なpreservationを伴うintentionally
retired、owner-decision-required、failedだけである。選択consumer setで許可された状態だけが
owner acceptanceへ進める。

##### R5. Semantic Work Item

未解決obligationは、任意のbyte sizeやtop-level field数ではなく、宣言済みsemantic dependencyで
group化する。一つのWork Itemが含めるのは次だけである。

- 関連するowner requestまたはsource fragment
- targetとdependency closure内のcurrent value
- writable fragment用のsliced target schema
- 登録済みsource、target、reference、disclosure、consumer constraint
- そのitemで必要なallocated identifier
- consistencyに必要な以前のaccepted Work Item結果
- scope内の厳密な未解決obligation、validation error、review concern

便宜だけを理由に完全なCharacterDefinitionV3 schema、complete character candidate、global path
list全体を含めてはならない。dependency closureが承認済みprovider/model budgetを超えた場合、
orchestrationは分解、owner reviewへのroute、明示failureのいずれかを行い、requestを黙って拡大しない。

##### R6. Resolverに依存しない実行

orchestrationはobligationごとにresolverを選ぶ。

- 厳密で規則が完結した変換にはdeterministic resolver
- 限定された意味分類、変換、source-supportedまたは明示的creative completionにはfocused LLM
- product intentまたはunsupportedなcreative choiceが必要ならowner resolver
- non-required future capabilityに十分なevidenceがない場合はtyped deferral

resolver選択でvalidation、provenance、preservation、owner acceptance要件は変わらない。モデル出力は
proposalであり、schema、runtime、disclosure、activation、identifier authorityではない。

##### R7. Focused patch output

各resolverは限定されたtyped patchまたはdecisionを生成する。対象obligation、target fragment、
source fragment、provenance、preservation effect、declared semantic dependant、限定説明、unknownを
識別する。LLM outputはcomplete V3 characterを含まず、Work Itemのregistered target closure外を
書かない。

serverがstable control identifierを割り当て、registered referenceを解決する。モデルはruntime
fact、engine rule、information right、ownership、undisclosed mechanicsを創作できない。

##### R8. Apply、validate、expand

serverはaccepted Work Item結果をin-memory candidateとledgerへtransactionallyに適用し、local
schema、bound、reference、disclosure、consumer、preservation、source accounting、operation conflictを
検証する。invalid resultは以前のvalid fragmentを置換しない。

resultはsemantic dependantを宣言できる。server-known dependencyとfocused semantic review findingは
closureを拡張できる。新たにaffectedまたはunresolvedになったobligationだけを再queueする。local errorは
character全体のregenerationを承認しない。

##### R9. Focused semantic lens

semantic consistencyをversioned dependency lensでreviewする。初期lensは少なくとも次を含む。

- identity、background、disposition、goal、conscious guidance、action norm
- ability、combat parameter、action reference、loadout、mechanical fallback
- relationship、self-awareness、speech policy、counterpart effect
- appearance、public presentation support、disclosure、consumer access
- cross-referenceとprovenance consistency

各lensは定義済みprojectionだけを受け取り、限定findingとaffected obligationを返す。lensはdeterministic、
LLM-assisted、owner-reviewedのいずれでもよい。単一LLM requestをwhole-character correctnessのoracleに
しない。lens coverageとoverlapはversionedでmachine-checkableにする。

##### R10. 完全なserver validation

owner review前に、assembled candidateはcomplete strict V3 schemaと全server-owned invariantを通す。
reference existence、action legality、compiler compatibility、disclosure ceiling、consumer access、ledger
closure、preservation integrity、該当するsource accounting、semantic-lens completion、required valueの
unresolved不在を含む。

complete validationはwhole candidateを処理するが、whole candidateまたはwhole schemaをLLMへ渡す必要は
ない。構造的にvalidでもrequired semantic obligationがunresolvedなcandidateはactivateできない。

##### R11. Deferralと完全性

active CharacterDefinitionV3は常に構造的にcompleteである。選択consumer setに不要なoptional meaningは、
active definition field外の既存typed deferred collectionで表現できる。required active valueをsentinel、
空の創作値、deferで置換できない。

deferred capabilityをrequiredにする前に、新しいauthoring attemptで解決・検証し、新しいimmutable
generationをappendする。first readまたはfirst battle useでproviderを呼ばない。

##### R12. Preservation

migrationは、変更またはretireした全V2 valueを承認済みrestricted preservation-capsule contractで保存する。
revisionも、承認済みretention policyがreversibilityまたはfuture remigrationに必要とする場合、置換された
V3 valueを保存する。creationはprior canonical character valueを持たないが、reviewとreplayに必要な許可済み
frozen source provenanceおよび全generated/owner decisionを保持する。

preservation dataはauthoritative active character truthと、通常のpublic、battle、psyche、conscious、
narration、image、authoring consumerのすべてから除外する。

##### R13. Repairとretry

retryはfailed obligationと拡張されたsemantic closureに限定する。厳密なerror、cause evidence、relevant
source、prior valid target fragment、affected lens findingを含める。validな無関係workは再利用する。

provider/model budget、最大Work Item attempt、total attempt ceiling、escalation policyはversionedで別途承認する。
上限到達時はreviewable、正当ならdeferred、またはfailed attemptになり、validationを弱めたりpartial characterを
activateしたりしない。

##### R14. Owner review

owner reviewは、限定されたhuman projectionとmodeに合ったsemantic diffを通じ、complete assembled V3
candidateを受け取る。

- create: source intentから作られたcharacter fact。creative additionを含む。
- revise: old V3からnew V3。requested change、semantic dependant、unexpected changeを含む。
- migrate: V2 dispositionからunchanged、moved、split、transformed、synthesized、retired、preserved、
  deferredへの結果。

reviewはunknown、provenance、behavior/disclosure effect、unresolved owner decisionを示す。未許可surfaceへ
restricted dataを公開しない。acceptanceはexact candidateとsupporting receipt digestをbindする。

##### R15. Public presentationとimmutable activation

structured candidateがvalidationを通った後、既存のfield-safe public projectionとsupported-claim description
processを実行する。public proseはstructured truthを修復または上書きしない。

owner acceptanceの後、既存append/CAS activation boundaryを使う。failed attempt、declined candidate、stale
source、pointer drift、partial batch failureはcurrent generationを変更しない。既存battleは記録済みgenerationに
bindされたままである。

#### モード別completion contract

##### Create

出力は、許可されたowner sourceを表現し、source-supported derivationとcreative completionを区別し、
unresolved required target obligationを持たないcomplete strict V3 candidate一つである。prior character stateを
推測しない。

##### Revise

出力は、厳密なimmutable V3 sourceから派生したcomplete strict V3 candidate一つである。requested changeと
そのsemantic effectを明示する。影響外meaningは可能ならbyte-identical、canonical normalizationでbyteが変わる
場合は意味的にaccountする。source generationをin-place変更しない。

##### Migrate

出力は、complete strict V3 candidate一つと必要なpreservation/source-disposition recordである。全relevant
V2 source valueをaccountし、required V3 valueを創作、黙って削除、未解決のままにしない。

#### 対案とtradeoff

##### 別々のpipeline

3つの独立pipelineは局所的には進化させやすいが、validation、repair、receipt、owner review規則が重複し、
意味的driftが起こりやすい。

##### 完全に同一のoperation sequence

表面的には統一的だが、creation intent、revision preservation、migration source accountingという重要差を消す。

##### mode別adapter／obligationを持つ共通core

blueprint、ledger、Work Item、lensという概念が増える一方、complete validationとfocused resolver利用を集約し、
各mode固有のproof obligationを保持できる。本candidateはこの方向を選ぶ。

#### 前提とunknown

- Work Itemの正確なbyte/token ceilingはsuccessor ADRとprovider policyの判断であり、model別実測が必要。
- 初期semantic-lens setは調整の可能性がある。ただしoptional future lensを要件revisionなしにacceptance blockerへ
  してはならない。
- 現行migration patch schemaを安全に一般化できるか、新しいqualified authoring-patch identityが必要かは未解決。
- obligation、Work Item、lens receiptの正確なpersistenceはADR判断。ADR-0010/0014のattempt/queue authorityを
  保持しなければならない。
- このcandidateはLocal OllamaまたはxAIのquality、latency、cost、focused Work Item budget適合を証明しない。

#### acceptance criteria

1. 各mode一つのfixtureが、同じ共通orchestrationと異なるmode obligationからcomplete strict V3 candidateを作る。
2. LLM fixtureはcomplete CharacterDefinitionV3 schema、complete candidate、global path list全体を受け取らない。
3. Createはrequired-targetとowner-source-intent coverageを証明し、restricted fact/rightを創作しない。
4. Revisionはrequested semantic change、affected dependant処理、immutable V3 sourceのunrelated meaning保存を証明する。
5. Migrationは全relevant V2 source disposition、required V3 target completion、split-role、restricted preservationを証明する。
6. Deterministic、LLM、owner、deferred resolutionは同じvalidation/receipt境界を使い、server authorityを迂回できない。
7. Invalid focused patchはprior valid fragmentを保持し、failed semantic closureだけをretryする。
8. Lens fixtureはwhole-character LLM requestなしでcross-field contradictionを検出し、uncovered obligationを機械的に示す。
9. Complete server validationはstructure、reference、legality、capability、disclosure、preservation、accounting、required-semantic failureを拒否する。
10. Owner reviewはmode別complete diffとexact acceptance bindingを示し、activationはprovider callなしのappend-only CASを維持する。
11. 既存V2 generation、current V3 generation、old battle binding、queued authoring、public projection authorityとの互換性を維持する。
12. Focused live-model evaluation、provider selection、本番execution、deployment、policy activation、releaseを別gateに保つ。

#### 対象外

- この要件でCharacterDefinitionV3 field semanticsを変更すること。
- provider、model、prompt、token budget、price ceiling、fallbackを選択すること。
- UI、persistence、worker、adapter、compiler、database変更を実装すること。
- paidまたはproduction provider callを実行すること。
- deployment、本番character migration、candidate acceptance、pointer移動、schema-3 authoring policy activation、
  rollback、releaseを行うこと。
- このcharacter固有processをbattlefieldまたはnarration assetへ一般化すること。

#### 提案する独立レビュー入力

独立reviewerは、共通coreが承認済みlifecycle/runtime boundaryを保持するか、mode固有obligationでcomplete V3
outputを証明できるか、focused semantic lensがwhole-candidate semantic reviewを黙って弱めず置換するか、
既存qualified identityを誤って再利用していないか、optional optimizationをacceptance blockerへ昇格していないかを
確認する。

## 論点

1. complete V3の保証主体をLLMではなくserver-owned ledgerとvalidationへ置くことは妥当か。
2. create／revise／migrateの差を、別pipelineではなくmode別obligationとして表すことは十分か。
3. whole-candidate LLM reviewをfocused lens群へ置換しても、意味的整合性のcoverageを証明できるか。
4. typed deferredを「active V3は構造的にcomplete」と両立させる境界は妥当か。
5. Work Itemがbudgetを超えた場合、黙って拡張せず分解／owner route／failureにすることは妥当か。

## 対案

- 3 pipelineを完全分離する: mode固有の理解は容易だが、検証とretryがdriftしやすい。
- 全modeを同じoperation列に押し込む: 実装は一見単純だが、source obligationの差を失う。
- 共通core＋mode別input/obligation: 概念数は増えるが、完全性とfocused I/Oを一箇所で保証できる。候補の推奨案。

## リスクとunknown

- semantic lensの切り方が不適切なら、全体矛盾を見逃す可能性がある。
- Work Item分割が細かすぎるとcall数と統合costが増える。
- exact token ceiling、retry ceiling、contract identity、receipt persistenceは未決定。
- Local Ollama/xAIの品質・latency・cost適合は未検証。

## 第一回オーナーレビュー後のroute

- `REVISE`: 独立レビュー前にcandidateを改訂し、Step 1へ戻す。
- `REVIEW_THEN_REVISE`: オーナー質問を加えて独立レビューし、その後必ずStep 1へ戻す。
- `REVIEW_THEN_DECIDE`: オーナー質問を加えて独立レビューし、その後Step 4で判断する。
- `REVIEW`: 追加質問なしで独立レビューし、その後Step 4で判断する。

このレビューで要件をacceptすることはできない。Step 2では上記routeのいずれかを選ぶ。

