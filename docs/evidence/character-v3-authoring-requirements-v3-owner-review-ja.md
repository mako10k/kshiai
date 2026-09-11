# 生成型・回復可能 V3 キャラクタ作成 — 要件候補 revision 3 日本語レビュー訳

> この文書は `docs/character-v3-authoring-requirements-v3.md` の全レビュー範囲の
> 日本語訳である。英語版が正本であり、本訳はユーザレビュー支援用である。

- 状態: Step 1 候補、セルフレビュー完了、オーナーレビュー待ち
- 日付: 2026-09-11
- 意思決定者: Product owner
- レビュー上の置換対象: `character-v3-authoring-requirements-v2.md`
- 範囲: V3キャラクタ新規作成、V3キャラクタ改訂、V2からV3への移行
- 根拠: revision 2、生成的補完・矛盾処理・レビュー時期に関するオーナー訂正、
  受理済みV2互換性要件revision 6、ADR-0010、0011、0014、0027、0028、0030

## 目的

省略の多い自然文入力から完全なstrict V3キャラクタを新規作成する場合、immutable
なV3 generationを改訂する場合、不完全なV2情報をV3へ移行する場合に、共通の回復
可能な作成プロセスを使う。入力の省略は通常状態であり、不足は原則として停止理由
ではなく生成義務になる。軽微な不整合は好意的・整合的に解釈でき、重要度の低い特徴
はキャラクタ全体が整合する方向へ調整できる。

通常の結果は、自動的に組み立て・検証されたオーナーレビュー候補である。人間Q&Aは
例外であり、保護対象の意味を大きく変え得る、明示的・重要・解消不能な衝突だけに使う。
レビューは後続手戻りを防ぐだけ早く、生成を停滞させないだけ軽くする。安価なhard check
は常時行い、意味が波及する前にsemantic checkpointを置き、影響範囲だけを再確認する。

サーバが組立、検証、照合、回復経路、stable ID、runtime mechanics、disclosure、activation
を所有する。LLMへキャラクタ全体を渡したり、全体を再生成させたりしない。

## Authorityの扱い

### 維持するAuthority

- ADR-0010のimmutable generation、永続idempotent attempt、owner acceptance、append/CAS
  activation、battleのread-only bindingを維持する。
- ADR-0014のqueued executionを維持し、submit/read routeではprovider処理を行わない。
- ADR-0011のstructured truth、derived presentation、disclosure gate、owner confirmation、
  battle stateとの分離を維持する。V2固有作成詳細にはV3後継ADRが必要である。
- ADR-0027/0028のauthored input、顕在意識の判断、反応専用の潜在意識、決定論的engine
  ruleの境界を維持する。
- 受理済みV2互換性要件revision 6のexact source保存、typed deferral、drift処理、production
  manifest範囲、production gateを維持する。

### 一般化または置換するAuthority

- ADR-0030のoperation、保存、receipt、owner-review原則をcreate/revise/migrate共通coreへ
  一般化する。
- ADR-0030 D8のwhole-source/whole-candidate LLM reviewを、サーバ全体検証、focused semantic
  lens、progressive checkpoint、最終input/output照合へ置換する。
- ADR-0030 D9のwhole-candidate再reviewを、影響範囲だけの自動回復、focused retry、例外的で
  永続化される人間Q&Aへ置換する。
- API、永続化、status、prompt、response schema、receiptの正確なidentityは後継ADRで決め、
  既存名を維持するかsupersedeするかを明記する。

この要件の受理が確立するのは要件baselineだけである。ADR、実装、provider call、評価、
deployment、production migration、candidate acceptance、pointer移動、rollback、releaseは
認可しない。

## 必須の結果意味論

### R1. 生成による成功を既定とする

新規作成は通常、省略されたowner inputから始まる。不足詳細は原則としてtyped generation
obligationとなり、protected constraint、adaptable preference、許可済みreference、整合した
創作判断から補完する。移行でも、選択consumerが必要とするV3意味がV2にない場合は生成する。
不足だけを理由に人間Q&Aやterminal invalidへ移行しない。

自動成功にもstrict構造、合法なreference、disclosure/consumer安全性、provenance、意味整合、
最終owner reviewが必要である。protected meaningの削除、server-owned factの捏造、不確実性の
隠蔽によって成功率を上げてはならない。

### R2. Mode別に固定するAuthority

各attemptはmodeを1つだけ宣言し、次を固定する。

- `create`: owner source、許可済みreference、clarification、V3 contract、policy
- `revise`: immutable V3 source、変更要求、clarification、許可済みreference、V3 contract、
  expected pointer
- `migrate`: exact V2 source、transition rule、許可済みsource/clarification、V3 contract、
  compatibility state、expected pointer

revision requestが旧V3より優先するのは解決済みscope内だけである。accepted transitionは移行時
の変更を認可できる。attempt、request、work item、question、answer、candidate、generation、
current pointerは別identityのままとする。

### R3. 入力の重要度とAuthority分類

サーバは各material input constraintをprovenance、confidence、次のreview可能なclassと共に記録する。

- **protected anchor**: 明示的なmust/must-not、identityを定義するfact、essential relationship、
  essential ability/limitation、要求されたrevision scope、accepted mechanics、ownership、
  disclosure/consumer limit
- **adaptable preference**: 可能なら維持するが、整合性のために解釈・調整可能な重要characterization
- **open creative space**: 指定がなく、作成プロセスが創造できる意味

明示されたowner priorityは推定importanceより優先する。class選択がprotected anchorを大きく
変え得る場合を除き、分類が不確実なだけではownerへ質問しない。

### R4. 再利用可能なTransition BlueprintとServer Baseline

versioned blueprintはaccepted source/target pairについてcopy、move、split、role変更、追加、retire、
reference、disclosure、consumer、dependencyというschema factをcompileする。character固有推論は
含めない。

createはtyped V3 scaffold、reviseはexact immutable V3 clone、migrateはblueprintに従う決定論的
copy/moveから始める。server defaultはconstantと安全なmechanicsを供給できるが、character identity、
relationship、ability、knowledge、owner intent、disclosure grantを捏造できない。

### R5. Claim LedgerとObligation Ledger

サーバはmaterial claim、変更要求、constraint、accepted transformation、生成追加、調整、conflict、
clarificationをsource provenance付きで記録する。必須V3 targetと関連source dispositionを、dependency、
resolver、attempt、status、receipt付きobligationとして追跡する。

入力不足は原則として`needs_owner`ではなく`generate`を付ける。revisionは無関係なprotected meaningも
account済みであることを示す。migrationは関連する全V2 valueをaccountし、固定mappingがないという
理由で黙って削除しない。

### R6. Focused Semantic Work Item

obligationはsemantic dependencyでgroup化する。各work itemは関連claim/fragment、書込可能なsliced schema、
登録reference/constraint、割当済みID、prior result、scope内findingだけを含む。完全なV3 schema、完全な
candidate、全path一覧は含めない。closureが大きすぎれば分解するかtechnical blockとし、黙って拡大しない。

### R7. Resolverに依存しないTyped Result

決定論的logic、focused LLM、owner answer、valid deferralはいずれも同じbounded patch/decision contractを返す。
内容はaffected obligation、source/target fragment、provenance、preservation effect、semantic dependant、owner向け
説明、uncertainty、記録対象のlow-importance adjustmentである。LLMは登録closure外を書かず、stable ID、engine
rule、runtime fact、ownership、disclosure rightを捏造しない。

### R8. 自動生成と自動整合

openまたはadaptableな意味が不足する場合、最小の整合的補完を生成し、`source_derived`または
`model_created`を付ける。軽微な不整合には次のいずれかを行える。

1. 全protected anchorを満たす整合的解釈を採る。
2. source priorityと周辺factに最も支持される解釈を選ぶ。
3. 重要ではないtraitを調整または置換して全体を整合させる。

各調整は競合claim、選択解釈、before/after意味、affected dependant、最終review用の限定説明を記録する。
protected anchorを黙って上書きしたり、runtime fact、right、mechanic、ownership claim、disclosure grantを
自動生成したりしてはならない。

### R9. Transactional Local Applyと即時Hard Validation

1つのresultをin-memory candidateとledgerへtransactionalに適用する。valid fragmentを置換する前に、
sliced schema、bound、reference、action legality、disclosure、consumer、write scope、preservation、source
accounting、authorityを確認する。invalid outputはprior valid fragmentを維持し、正確なfocused repair finding
を作る。この安価なcheckはpatchごとに行い、人間を待たない。

### R10. Progressive Semantic Review

semantic reviewは次の4段階を比例的に用いる。

| 段階 | 時期と範囲 | Block規則 |
| --- | --- | --- |
| 即時hard check | patchごと。局所的な構造・authority invariant | invalid patchだけを拒否し自動回復を開始 |
| semantic-skeleton checkpoint | identity、core goal、essential ability/limit、key relationshipが揃い、dependent prose/behaviorへ波及する前 | material protected conflictだけfan-outを止め、soft findingは自動修復へ |
| affected-cluster checkpoint | dependency境界またはmaterial変更後。変更claimとdependantだけ | affected obligation/lensだけreopen/recheck |
| 最終reconciliation | owner review前に完全server candidateと全frozen authorityを比較 | material unresolved defectだけcandidate-readyをblock |

変更のないlensとvalid workは再利用する。review可能という理由だけでcheckpointを追加してはならず、named
failure pathを、回避できる手戻りより低い期待costで防ぐ場合だけ置く。

### R11. Focused Semantic Lens

versioned lensは、identity/background/disposition/goal/guidance、ability/combat parameter/action/fallback、
relationship/self-awareness/speech/counterpart effect、appearance/public support/disclosure/consumer、
cross-reference/provenance/authorityをcoverする。各lensはprojectionだけを受け、claim/obligationに結びつく
bounded findingを返す。deterministic、LLM-assisted、owner-reviewedのいずれでもよいが、whole-character LLM
callをcorrectness oracleにしない。

### R12. 自動回復Cascade

人間入力の前に、変更のないrequestを反復せず、適用可能で認可済みの手段を使い切る。決定論的resolution、
focused generation/classification、cause-classified local validation、exact errorとprior valid fragmentを使う
focused repair、decomposition、事前認可された別resolver、consumer-scoped typed deferralの順である。各retryは
情報を追加するか別alternativeを検査する。whole regeneration、blind retry、未承認provider escalationは禁止する。

### R13. 例外的な人間Q&AのThreshold

次のすべてが成立するときだけ人間Q&Aへ入る。

1. 単なる不足ではなく、conflict/problemが明示的である。
2. protected anchor、required correctness、またはmaterialにcharacterを定義するtraitへ影響する。
3. 妥当な自動解決案が、materialに異なるcharacterを作るか、異なるprotected constraintへ違反する。
4. focused automatic recoveryを使い切っている。
5. owner intentなしには安全な選択・整合・deferができない。

1つでも偽なら、generation、automatic reconciliation、repair、valid deferralで続行する。questionには最小のsource/
candidate projection、自動選択が危険な理由、選択肢のbounded effect、free-form経路、再開するworkを示す。raw schema
知識やhidden chain-of-thoughtを求めない。

### R14. Answer Authorityと再開

answerはappend-onlyでprovenance-linked、question scope内のauthorityである。final acceptanceではない。同じattemptで
affected obligationだけをreopenし、focused workを再構築し、affected lensを再実行し、無関係なvalid workを再利用する。
同等questionはdeduplicateし、後続roundは新しく区別されたmaterial uncertaintyに限る。

### R15. 最終Input/Output照合

各lensはfrozen input、authorized change、記録済みinterpretation/adjustment、final outputを比較する。material relationを
preserved、authorized change、source-supported synthesis、creative completion、coherent interpretation、low-importance
adjustment、valid deferral、preserved retirement、material contradiction、source loss、unsupported material addition、
unresolved material meaningに分類する。

最初の8分類はinvariantを満たせばreview可能な成功状態である。最後の4分類だけがcandidate-readyをblockし、focused
repair、またはR13を満たす場合にhuman questionを作る。schema validityだけでreconciliationを上書きできない。

### R16. 完全Server Validation

owner review前にcandidate全体がstrict V3 schemaとserver invariantを通る。reference、action、compiler compatibility、
disclosure、consumer、ledger closure、preservation、source accounting、lens coverage、final reconciliation、material
unresolved meaningがないことを含む。serverはcandidate全体を検証するが、LLMへ渡す必要はない。

### R17. DeferralとPreservation

active V3は構造的に完全である。selected consumerに不要な意味はactive field外のaccepted typed deferralを使える。
required structure/valueにsentinelやfabricated emptyを使えない。変更・retireしたV2 valueとretentionが必要なV3 valueは
restricted contractで保存し、通常runtime/public/authoring consumerから除外する。

### R18. 最終Owner ReviewとActivation

final reviewではcomplete safe candidateとmode別semantic diffを示す。created fact/creative addition、requested/consequential
revision change、または全migration dispositionである。routine completionでownerを埋め尽くさず、protected-anchor解釈、
自動low-importance adjustment、uncertainty、影響の大きいgenerated factを強調する。

Q&A answerはfinal acceptanceを代替しない。acceptanceはexact candidateとreceiptをbindする。append/CAS activationはprovider
workを行わず、failure、decline、drift、cancellationはcurrent generationを変更しない。

### R19. Recoverable条件とTerminal条件

sparse input、通常の不足、軽微な矛盾、focused model failure、repair exhaustionはgeneration/recovery stateであり、terminal
invalid character labelではない。provider/infrastructure failureはretryableである。integrity conflict、schema/compiler defect、
implementation faultはtechnical recoveryへ入る。explicit cancellation、authorized deletion、別途統制された回復不能な
integrity/security条件だけがcandidateなしでcloseできる。

### R20. 評価とTuningのEvidence

owner-reviewedなcreate/revise/migrate代表corpusで、automatic completion、生成情報品質、automatic reconciliation精度、
protected-anchor維持、不要question率、recovery当たりquestion数、late-review rework、checkpoint block時間、repeated question、
latency、call数、token/cost、final semantic correctnessを測る。hidden source loss、protected contradiction、unsafe invention、
improper deferral、final reviewまでmaterial issueを見逃したcaseはautomatic successに数えない。

numeric success threshold、corpus構成、importance calibration、checkpoint budgetは、localおよびaccepted live-model evidenceに
基づく別owner decisionとする。

## Mode別Completion Contract

- **Create:** protected inputを表現し、derivation、creative completion、adjustmentを透明に区別する完全で整合的なstrict V3候補。
- **Revise:** exact immutable sourceから作り、requested/consequential changeを明示し、無関係なprotected meaningをaccountした候補。
- **Migrate:** preservation/source-disposition recordを伴い、全関連V2 valueとrequired V3 targetをaccountした完全なstrict V3候補。

## 代案とTradeoff

### 早期のStrict Semantic Gate

下流への波及可能性は最小になるが、通常のsparse inputやminor ambiguityを繰り返しblock/questionへ変えるため採用しない。

### 完全組立後だけReview

生成は止まりにくいが、identity、goal、ability、relationshipのconflictをdependent content増加後に発見するため採用しない。

### Progressive Affected-scope Review

checkpoint stateとimportance classificationは増えるが、安価なdefectは即時修正し、fan-out前にsemantic skeletonを確認し、
validなunaffected workを再reviewしないため採用する。

## 前提、Risk、Unknown

- importance classificationがpreferenceを過剰保護、またはdefining traitを過小保護する可能性がある。両誤りを評価し、reviewで分類を示す。
- creative completionがgeneric characterへ寄る可能性がある。大きなpromptではなくcorpus evidenceでquality/diversityを確認する。
- dependency boundaryが多すぎるとgate accretionを再現する。後継ADRでbounded checkpoint policyと除去/tuning evidenceを定める。
- numeric automation target、model route、token/cost ceiling、retry budget、exact API/status/receipt identityは未決定である。
- Local OllamaとxAIのquality、latency、cost、recovery evidenceは別扱いである。

## 受入基準

1. Create、revise、migrateが、異なるfrozen authorityを持つ共通orchestrationを使う。
2. protected conflictのないsparse create fixtureが、事前human questionなしに完全で整合的なcandidateへ到達する。
3. migration fixtureが不足するrequired V3 meaningを生成し、`source_derived`または`model_created`を付ける。
4. minor contradiction fixtureを整合的に解釈、またはlow-importance traitを変更し、claim、choice、before/after meaning、dependantを記録する。
5. protected-anchor contradictionを黙って上書きしない。
6. Human Q&AはR13の5条件すべてがevidence化された場合だけ起きる。
7. 通常の不足、adaptable preference conflict、open creative choiceはhuman Q&Aを起こさない。
8. LLMへcomplete schema、candidate、全path setを渡さない。
9. Invalid patchはprior valid fragmentを維持し、blind retryなしにcause-informed focused repairを受ける。
10. dependent contentのfan-out前にsemantic-skeleton reviewを行い、soft findingはautomatic recoveryで続行する。
11. material changeはaffected obligation/lensだけをreopenし、unchanged valid workを再利用する。
12. final reconciliationは記録済みcreative completion/minor adjustmentを受け入れ、material contradiction、source loss、unsupported material addition、unresolved material meaningを検出する。
13. complete server validationがstructure、reference、action、compiler、disclosure、consumer、preservation、accounting、coverage、reconciliationをcoverする。
14. Answerはappend-only scoped authorityであり、final acceptanceを意味しない。
15. evaluationが不要なearly questionとlate-review reworkの両方を報告し、一方の隠蔽で他方を改善したように見せない。
16. final owner acceptanceがappend/CAS activationより先であり、provider、deployment、production、rollback、releaseは別gateのままである。

## 対象外

- V3 field semanticsの変更。
- numeric threshold、provider route、budget、production policyの選択。
- UI、persistence、worker、adapter、compiler、databaseの実装。
- paid/production call、deployment、production data migration、candidate acceptance、pointer移動、policy activation、rollback、release。
- character asset以外への一般化。

## 独立Reviewへ提示する論点

sparse inputがowner questionではなくgenerationへ確実に入るか、importance classがadaptable traitを凍結せずdefining meaningを
保護するか、minor contradictionが透明に整合されるか、R13によりhuman Q&Aが本当に例外になるか、semantic-skeleton checkpoint
がstrict early gateにならずfan-outを防ぐか、affected-scope recheckとfinal reconciliationがcorrectnessを維持するか、未選択の
numeric/implementation decisionがacceptanceへ紛れ込んでいないかを確認する。
