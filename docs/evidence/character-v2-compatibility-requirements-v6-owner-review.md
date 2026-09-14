# キャラクター意味マイグレーション — 要件候補・改訂6 オーナーレビュー（日本語）

- レビュー対象: `docs/character-v2-compatibility-requirements-v6.md`
- 英語正本のSeal: `da2f3a272a11…`
- 同一性: 英語正本の作業ファイルはSeal済み内容と一致
- 文書の位置づけ: 本書は判断用の完全な日本語訳であり、規範上の正本は英語版
- 状態: Step 1 自己レビュー完了、最初のオーナーレビュー待ち
- 日付: 2026-09-10
- 決定者: プロダクトオーナー
- レビュー上の置換対象: `character-v2-compatibility-requirements-v5.md`
- 出典: 改訂5の独立レビュー後のオーナーによる`REVISE`選択、改訂5候補・独立レビュー、ADR-0010、
  ADR-0011、ADR-0027、ADR-0028、構造化asset/character設計、現行の作成・選択RCA、
  2026-09-10のproduction read-only evidence
- 競合するProposed設計: ADR-0029改訂1

## 目的

恒久的なV2 reader例外を残さず、影響を受けるready済みキャラクター8件を復旧する。
凍結した各V2定義を、versionedかつレビュー可能なLLM支援型意味マイグレーションにより、
一貫した不変V3 generationへ移す。意味が変わらない値は決定論的にそのまま複写し、
削除・追加・役割変更されたfieldについては、LLMが限定されたmove、transform、synthesis、
retirement、deferralを提案する。移動・変更・削除されるsource値を将来の再マイグレーション用に
保全し、旧generationと旧battle bindingを保持し、cutover後のauthoring経路をstrictにする。

目的は復旧であり、別のeligibility行き止まりを追加することではない。固定field mappingが
事前定義されていないだけでschema-validな履歴値を拒否しない。意味上の不足はmigration
workflowで解決、保全、または正当な遅延を行う。integrity conflictはactivationを止めるが、
sourceを黙って消去・再解釈しない。

新規character作成を妨げるprovider response-schema identity欠陥は別問題である。その修正は
引き続き必要だが、cutover後のauthoring response contractは選択されたcharacter-definition
versionを対象にしなければならない。

## 権限関係

### ADR-0010 — 共通の不変asset envelope

不変generation、明示的compatibility、server-side eligibility、compare-and-swapによるcurrent
pointer activation、read-only battle binding、永続化したauthoring attempt、activation前validation、
activation transaction内でproviderを呼ばないことを維持する。凍結操作はrowの存在から推測せず、
selectionまたはbattle作成中に実行しない。

改訂6は、ADR-0010の「legacy mappingは決定論的に限定する」という方向を意図的に変更する。
後継ADRは、凍結input identity、provider-request receipt、決定論的validation、owner review、
asset単位activation、failure isolationを維持した、限定的なLLM支援型意味マイグレーションを
明示的に許可しなければならない。また、不変な保全カプセルをauthoritative runtime inputにせず、
target generationへどう結び付けるかを定める。

### ADR-0011 — 構造化キャラクター定義

構造化されたcharacter truth、利用者別の派生projection、activation前の確認、runtimeでの
決定論的action semantics、disclosure gate、unsupported assetのowner管理、正確なgenerationへの
battle binding、in-place変更禁止を維持する。LLMはmigration candidateを作成するが、engine rule
evaluator、disclosure authority、activation authorityにはならない。

後継ADRは次のV2固有部分を明示的にsupersedeまたは限定変更する。

- `CharacterDefinitionV2`だけを最新authoring character definitionとすること
- ready-current-V2だけを選択可能なcurrent character generationとすること
- create、revision、upgrade、restore、import、derived経路がV2を出力すること
- legacy fieldを決定論的mappingだけに限定すること
- 今回の限定bulk migrationをADR-0011のAccepted範囲から除外していること

既存の履歴V2 generationとbattle bindingはADR-0011に従い読み取り可能なまま保持する。改訂6は
保存済みbytesを再解釈しない。production実行は別ゲートとする。

### ADR-0027 — 顕在意識主体と深層心理の境界

目標・行動・発話の判断主体は顕在意識であり、思考を伴わない深層心理およびengine validationとは
分離する。conscious guidanceは顕在意識が判断材料として消費する作者定義character inputであり、
psyche state、engine action command、独立したaction-selection authorityではない。

migration時のLLM分類はruntime責務を変えない。LLMは作者定義値をV3のどこに置くか提案できるが、
consumerを決めるのは検証済みtarget schemaと登録済みcompilerだけである。

### ADR-0028 — versioned conscious-agency contract

次の既存qualified V3 identityと責務を維持する。

- `BattleAssetManifest` schemaVersion 3: 不変のbattle binding
- `CharacterBattleCompilerInputsV3`: battleに固定されたcompile済みinput
- dialogue schemaVersion 3およびCompact mode: dialogue input contract
- conscious input/output contract version 3: runtime judgment I/O
- `CharacterAgentState.consciousAgencyV1`: `CharacterAgentState`内のclosedかつ可変な
  battle-runtime conscious-agency state

`CharacterDefinitionV3`と`schemaVersion: 3`は、これらより上流にある作者定義の不変assetを表し、
既存contractを置き換えない。compiler outputが変わる場合は、新しいqualified identityを付け、
`CharacterBattleCompilerInputsV3`等の既存名を意味変更したまま再利用しない。

generation-backed basic-action provenance discriminatorの`character_generation_v2`はV2の意味を
維持する。V3 sourceにはqualified successor表現または意味保存を証明したmappingを使用する。

### Proposedおよび履歴候補

Proposed ADR-0029改訂1は恒久V2 compatibility readerを選択して本要件と競合するため、現状のまま
Acceptedにしてはならない。本要件Accepted後、ADR-0029を改訂するか、意味マイグレーション用の
後継ADRを発行する。要件改訂1〜5は未承認の履歴であり、レビュー状態を改訂6へ継承しない。

## V3 schemaとruntime境界

R1. `CharacterDefinitionV3`は`actionNorms`とは別に、上限を持つ専用の
`consciousGuidance` collectionを持つ。

R2. conscious-guidance entryはstable ID、applicability clausesとmatch mode、statement、priority、
`preference`または`commitment`のforce、self-awareness、exceptions、descriptive metadataを含む。
action reference、action kind、tactic tag、fallback action、restrictive dispositionは持たない。

R3. 適用時、conscious guidanceはawareness gateを通ったstatementを顕在意識の判断材料として
供給できる。ただしengine candidate/resultへ直接projectionせず、決定論的なlegal・ranked・
excluded action集合を変更せず、同じtransitionでpsyche stateへ直接writeしない。顕在意識の
判断が変わり、選択actionと後続experienceを介して間接的影響が生じることは正当である。

R4. V3の各`actionNorm`は実行可能で、最低1つの`actionRef`、`actionKind`、`tacticTag`を選択する。
selectorなしaction normはV3 activation時に不正とする。移行したmechanical fallbackはqualifiedな
mechanical contractで表し、conscious guidanceへ隠さない。正確なschemaは後継ADRで決められるが、
applicability、legality、ordering、conflict receiptを維持するか、変更を明示しなければならない。

R5. 変更・retireされたV2 source値は、source/target generationへ論理的に結び付いた、不変かつ
content-digestedな`MigrationPreservationCapsuleV1`へ保存する。capsuleはauthoritative character
truthの外に置く。restrictedかつsize-boundedで、public、battle、psyche、conscious、narration、
通常authoring compilerから構造的に除外し、登録済みの将来migration consumerだけが利用できる。
物理保存方式は後継ADRで決める。

R6. 現在宣言されているcompiler capabilityのどれにも必要でないfieldは、架空値ではなくtypedな
deferred markerを使用できる。markerはtarget path、理由、候補source path、解決を必要とする
capabilityを識別する。mechanics、legality、reference、disclosure、active consumerに必須の値は、
そのconsumerがcompatibleになる前に解決・検証する。selection、search、battle create、retry、
resume、battle replayのread pathではLLMを呼ばない。

R7. schema 3への明示cutover後、新規createと通常revisionは完全かつstrictなV3 candidateを作る。
履歴inputを使うupgrade、restore、import、derived authoringは同じ意味マイグレーションcontractを
使用し、selectorなしV3 action normも新しいcurrent V2 generationも作らない。

## 凍結inputとLLM支援型意味マイグレーション

R8. production migration inputは、2026-09-10に`ready`として観測された正確なcurrent generation
ID 8件を含む、凍結済み・owner-reviewed manifestとする。provider request前とactivation前に、
logical asset ID、current generation ID、source schema、source content identity、該当compatibility
stateを再確認する。正確なready V2状態を持たないowner character 16件は対象外で、既存の明示的
authoringまたはupgrade経路に残す。

R9. 各`migrationAttemptId`は、完全なV2 source、retention/disclosure contractで許されるnatural-source
material、target schema、migration contract、prompt identity、response-schema identity、provider
route、model identity、初回request digestを凍結する。同一attempt内の各provider呼出には別々の
`providerRequestId`、request digest、該当時のparent request、accounting record、responseまたはfailure
receiptを持たせる。provider chain-of-thoughtは要求も保存もしない。provider failureまたはinvalid
outputではcurrent generationを変えず、attemptをretryableにする。

R10. LLMは上限を持つ構造化semantic change setを返す。各operationは`copy`、`move`、`transform`、
`synthesize`、`retire_to_capsule`、`defer`のいずれかで、target、該当時のsource path、output value
またはdeferred marker、owner向けの限定説明、provenance category、提案する意味的依存先を識別する。
stable IDとreferenceは登録済みinputから複写するかserver-owned ruleで割り当て、LLMにcontrol IDを
創作させない。

R11. V2値がV3でも同じ役割を持つ場合はexact copyを優先する。LLMが判断するのは意味上の非連続箇所、
すなわち削除fieldをどこへ置くか／active truthから外せるか、追加fieldをどう導出・創造補完するか、
役割変更fieldをどう変換するかである。`retire_to_capsule`はexact sourceを保全してからactive V3
truthから除く。`synthesize`はsource-supported derivationとmodel-created character materialを区別する。

R12. V2が複数責務をまとめていた場合、1値を複数targetへ移せる。selectorless soft normでは、
awareness-gated statementをconscious guidanceへ移し、非nullの`fallbackActionRef`は別途保全し、
明示的mechanical conflict-fallback contractへ変換するか、意味変更を明示してretireできる。
fallbackを黙ってdropせず、通常のconscious guidanceや捏造selectorにせず、そのfieldだけを理由に
character全体を拒否しない。

R13. selectorを備えたaction normとその他の値は、そのまま複写するか、明示的semantic-change
operationを通してのみ変更する。accepted operationが許可済みdisplay projectionから再生成しない限り、
public proseは再利用する。移動・変換したdisclosure pathごとにserver-owned policy validationを行い、
effective grantを維持または明示的に狭め、拡大を禁止する。consumer tag自体はaccess権限にならない。

R14. complete-candidate validationは構造的enforcementと意味的一貫性reviewを含む。構造面ではschema
bounds、登録済みreference、action legality、compiler compatibility、disclosure ceiling、consumer
access、target/source completeness、operation coverage、未計上source removalがないことを検証する。
repair closureは、serverが把握する構造的依存、LLMが提案する意味的依存、独立したcandidate全体の
意味的一貫性reviewが追加指定したfieldの和集合とする。

不正または不整合な結果は、error、cause、関連source context、以前のvalid fragment、現在のrepair
closureを含めて再試行する。次のprovider requestは、不正・不整合部分と、それにより意味が変わり得る
fieldだけを要求する。merge後、candidate全体へ構造・意味validationを再実行し、closureを再拡張できる。
未解決candidateはreviewableまたはfailedに留まりactivationしない。限定repairがclosureへ到達できるなら
全体出力を要求しない。

R15. validation後、unchanged、moved、transformed、synthesized、retired、deferredに分類したowner向け
semantic diffを作る。behavior/disclosureへの影響、不確実性、provenanceを示すが、providerの
chain-of-thoughtや権限のないrestricted値を公開しない。activationにはexact candidate digestへのowner
acceptanceが必要である。batch acceptanceはexactなasset別candidate集合を束縛できるが、partial acceptanceを
明示し、未指定itemを推測して承認しない。

## Compatibility、readiness、deferral

R16. compatibilityは登録済みconsumer/compiler requirementに対して評価する。現在必要なconsumerが
読まないdeferred fieldによってcharacter全体を非選択にしない。current match/battle consumer setには
readyでありながら、将来capabilityには未解決であってよい。compatibility outputは、説明のない
all-or-nothing mapping failureではなく、qualifiedなsupported/deferred capabilityを示す。

R17. deferred値を必要とするcapabilityを有効化または必須化する前に、別のauthoring/migration attemptで
値を解決・検証し、新しいgenerationを追記する。「最初に必要になった」こと自体はinline provider callの
権限にならない。解決までは該当capabilityだけを利用不能とし、既存compatible consumerは束縛済み
generationを使い続ける。

R18. 意味の曖昧さ、削除field、新規必須field、役割変更は`transform`、`synthesize`、
`retire_to_capsule`、`defer`の対象であり、恒久eligibility rejectionにしない。一方、選択consumerに
必須な未解決値、invalid reference、disclosure widening、保全欠落、invalid receipt、source/pointer drift、
provider failure、owner未承認ではactivationを止める。これらはretryableまたはreviewableなattempt結果であり、
current generationを変更しない。

## 追記型実行、receipt、retry

R19. 既存generation bytesは編集しない。承認済みcharacterごとに検証済みV3 generationを1件追記し、
preservation capsuleとreceiptを束縛し、凍結source generationへのcompare-and-swapで、そのlogical assetの
current pointerだけを移動する。旧battleは記録済みgenerationに固定する。

R20. 「bulk」は凍結manifestに対する限定操作で、全characterをまたぐ単一transactionではない。
characterごとに生成、review、commitする。1件の失敗で完了済みitemをrollbackせず、pendingを完了扱いしない。

R21. asset単位のmigration commit境界で、replacement generation、current pointer、compatibility state、
preservation binding、owner acceptance、durable success receiptを原子的に可視化する。receiptはmigration
contract、attempt、logical asset、source generation、target generation、candidate digest、capsule、
provider-request receipt集合を一意に束縛する。後続の別途承認されたrevisionはcurrent pointerを
移動できるが、migration receiptは履歴として残り、
targetが現在もcurrentであるとは主張しない。

R22. 冪等性ではattempt、provider request、candidate、generationのidentityを区別する。完了済み
`migrationAttemptId`の再生は記録済みtargetを返し、新provider requestも重複generationも作らない。
限定repairは同じattemptを継続してvalid fragmentを再利用し、個別receiptを持つ新しい
`providerRequestId`を1件以上追加できる。異なる意味結果をproviderへ意図的に要求する場合は、以前の
outputを黙って置換せず、新attemptとowner-review candidateを作る。pointer drift時は新しいowner作業を
上書きせずactivationを止める。

## Cutoverと作用の境界

R23. cutoverは時刻、deployment version、dialogue schemaVersion、限定されない`V3`ではなく、明示的な
qualified `characterDefinitionSchemaVersion` authoring policy値で選択する。永続化・activation方式は
後継ADRで決め、defaultを暗黙に変えない。

R24. 必要な履歴V2と新V3 generationを読み、意味マイグレーションattemptを実行・resumeし、V3 projectionを
検証し、consumer単位compatibilityを評価し、qualified V3 provenanceを表現し、mixed contract tupleを拒否できる
codeをdeployment・検証してから、schema 3を選択またはproduction migrationを実行する。

R25. requirement acceptance、successor ADR acceptance、implementation、deployment、authoring-policy
activation、providerを使うproduction candidate生成、production pointer migration、rollbackは別々の作用である。
この候補だけでは後続作用を許可しない。

## 受入条件

- 変更されたlegacy-mapping方針をADR-0010/0011へ追跡しつつ、不変性、validation、confirmation、CAS、
  read-only battle binding、battle-time provider禁止を維持する。
- `CharacterDefinitionV3`をADR-0028の全V3 contractおよび
  `CharacterAgentState.consciousAgencyV1`と区別し、mixed tupleを拒否する。
- V3 parserはconscious guidanceを受理しselectorless action normを拒否し、migration preservationを
  全runtime/public compiler inputから除外する。
- 構造化migration fixtureは6 operationすべてを扱い、変更・削除source pathを黙って落とさない。
- 1つのV2値をconscious guidanceとqualified mechanical fallback targetへ分割するfixtureを設ける。
  selectorless soft normの非null fallbackだけを理由にcharacterを拒否しない。
- synthesized fieldはsource-supportedとmodel-createdを区別し、stable control ID、runtime fact、
  information right、非公開mechanicsを捏造しない。
- capsule fixtureはexactなpath/valueを保持し、source/target generationを束縛し、boundsとrestricted accessを
  守り、通常compilerが無視することを証明する。将来migration consumerが保全inputを回収できる。
- disclosure path変更でgrantを広げず、consumer tagをaccess authorityにしない。
- invalid-output fixtureでは構造的依存、LLM提案の意味的依存、独立したcandidate全体reviewが限定repair
  closureを拡張できる。merge後はcandidate全体を再検証し、未解決の意味的不整合をactivateしない。
- 限定repairは1つの`migrationAttemptId`を維持してvalid fragmentを再利用し、追加provider呼出ごとに
  新`providerRequestId`を記録し、acceptance前にはgenerationを作らない。完了attempt再生はproviderを
  呼ばず重複generationを作らない。意味の再生成要求は別attemptとreview candidateを作る。
- deferredなfuture/optional fieldはcurrent battle compatibilityを妨げない。requiredなdeferred fieldは
  該当qualified capabilityだけを止め、read pathでproviderを呼ばず、有効化前に解決する。
- guidance-only変更はlegal/ranked/excluded action keyを直接変えない。mechanical transformationはsemantic
  diffとcompiler receiptへ別途示す。
- production-shaped fixtureはready V2 character 9件、対象8件のselectorless soft entry 21件、fully selected
  Takumiを表す。8件すべてを意味マイグレーションworkflowへ入れ、schema-validな意味gapはfixed-map
  eligibilityで除外せず、解決・保全・正当なdeferを行う。
- exact candidate digest集合をbatch review/acceptでき、未review・failed itemを承認扱いしない。
- accepted fixtureごとにV3を原子的に追記しcapsule/receiptを束縛してpointerを動かす。旧V2と旧battleを
  bytes単位で読取可能に保つ。
- 後続の通常revisionでcurrent pointerを動かしても履歴migration receiptとcapsule bindingを保持する。
- crash、partial failure、owner decline、provider failure、source/pointer driftでは従来currentを保持し、
  assetごとのretryable/reviewable結果を示す。
- no-state 16件は本migrationの対象外とする。
- cutover後のcreate/revisionはstrict V3とする。履歴restore/import/derivedは意味マイグレーションを通し、
  新しいcurrent V2を作らない。
- dry-runはproviderもwriteも実行せず、対象、identity check、必要provider work、完了attempt、driftを示す。
  production provider利用、activation、readbackはそれぞれ後段ゲートを維持する。

## 対案とトレードオフ

### A. 完全な決定論的field mapping

再現性が高く安価だが、追加・削除・役割変更された意味を安全に判断できず、意味gapを新しいeligibility
行き止まりへ変えやすい。改訂6では完全戦略として採用しない。

### B. 無制限なLLM rewriteと即時activation

柔軟だが、source lossを隠し、retryを不安定にし、validation、disclosure、owner review、append-only
activation controlを迂回するため採用しない。

### C. 保全と遅延を備えたhybrid LLM支援型意味マイグレーション

provider cost、構造化change-set設計、review UI、capsule retention、多数のtestが必要になる。一方、8件を復旧し、
schema evolutionを正直に表し、失われる値を保全し、恒久reader例外とfixed-map行き止まりを避けられる。
改訂6は本案を採用する。

### D. 恒久V2 compatibility reader

短期schema変更は最小だが、runtimeの二重意味と用語衝突を残すため、目的と競合する。

## 未決事項とリスク

- migrated mechanical fallback ruleのqualified identityとschema
- `MigrationPreservationCapsuleV1`の物理保存、上限、retention、export、削除policy
- compiler capabilityとdeferred markerのqualified表現
- migration prompt、response、semantic review、repair、provider-request contract identityとretry上限
- batch owner-review UI、および意味変更なしcandidateを自動承認できるpolicyを別途設けるか
- V3 basic-action source表現
- authoring-policyの永続化・activation方式
- provider cost、latency、availability、model-version drift
- 保全source fragmentに短期retentionまたは明示owner削除が必要なdataが含まれるか

これらは後継ADRで決める。R1〜R25を弱めたり、既存identityを意味変更したまま再利用してはならない。

## 対象外

production deployment、traffic変更、policy activation、providerを使うproduction migration、pointer rollback、
no-state 16件のmigration、別件response-schema修正のlive xAI検証は対象外で、別途権限が必要である。

## セルフレビュー

- 目的は復旧であり、fixed-map eligibility gateの追加ではない。
- LLMは限定candidateとsemantic diffを作る。schema、disclosure、runtime mechanics、compatibility、
  owner acceptance、activationは決定論的制御として残す。
- 変更・retire値はauthoritative truthと通常compilerの外で保全し、将来migration consumerだけが使う。
- deferはconsumer単位であり、無関係な現行consumerを止めず、selection/battle pathでproviderを呼ばない。
- selectorless soft normはconscious/mechanical targetへ分割可能で、non-null fallbackを黙って失わず、
  selector捏造やcharacter全体の拒否条件にしない。
- ADR-0010/0011の変更には明示的な後継ADRが必要であり、requirement candidateだけからproductionまたは
  implementation authorityを導出しない。
- model出力自体を決定論的とは呼ばず、凍結attemptとaccepted candidate identityへ再現性・冪等性を持たせる。
- migration attempt、provider request、accepted candidate、完了済みreplay、generationのidentityを分離した。
  限定repairはvalid fragmentを再利用できるが、追加provider呼出がなかったとは扱わない。
- repair closureはserver既知の構造的依存、LLM提案の意味的依存、candidate全体の独立した意味reviewを
  組み合わせる。各merge後にcandidate全体を再検証し、closureを再拡張できる。

## Proposed independent-review input

固定された改訂6について、次を確認する。

- ADR-0010/0011の変更権限と維持するcontrolが正しいか
- ADR-0027/0028の責務とqualified identityを保持しているか
- LLMによるcandidate authoringと決定論的runtime/activation authorityが分離されているか
- change-setの6 operationが完全か
- preservation capsuleの非消費、privacy、将来migration accessが十分か
- consumer単位deferがbattle-time provider workを作らないか
- selectorless soft normとfallbackの分割が意味を失わないか
- disclosureを拡大しないか
- structured-outputの限定repairが独立に拡張可能な意味的依存closureを含むか
- migration attempt、provider request、完了済みreplay、candidate、generationを区別し、非決定的生成でも
  idempotencyを保てるか
- owner acceptance、append-only、後続revision後のreceiptが整合するか
- explicit cutover、8件復旧、strict post-cutover authoringを満たすか

deployment、production実行、no-state 16件migration、live xAIを受入条件へ追加しない。

## 改訂5からの重要差分

1. 1つの`migrationAttemptId`と、同一attempt内の複数`providerRequestId`を明確に分離した。
2. 完了済みattemptの再生はproviderを呼ばない一方、未完了attemptの限定repairは追加provider requestを
   個別receipt付きで発行できると明記した。
3. repair closureを、構造的依存だけでなく、LLM提案の意味的依存と独立したcandidate全体意味reviewの
   和集合とした。
4. providerを呼ばないruntime read pathの表現をbattle create/retry/resume/replayまで明確化した。
5. LLM支援型意味マイグレーション、保全カプセル、consumer単位defer、fallback分離、owner acceptance、
   append-only activationという方式自体は変更していない。

## Step 2で選択できる経路

- `REVISE`: オーナー指摘を反映した改訂7を作成し、Step 1から再開する。
- `REVIEW_THEN_REVISE`: 独立レビュー後、必ず改訂する。
- `REVIEW_THEN_DECIDE`: 独立レビュー後、改訂か次段階移行かを改めて決める。
- `REVIEW`: オーナー質問を追加せず独立レビューを実施する。

改訂6は方式全体ではなく、retry identityとsemantic repair closureの矛盾を限定修正した。そのため推奨経路は
`REVIEW`である。これは承認ではなく、訂正が矛盾を除去し、既存境界を変えていないかを独立コンテキストで
確認する段階である。
