# 生成型・回復可能 V3 キャラクタ作成 — 要件候補 revision 5 日本語レビュー訳

> この文書は `docs/character-v3-authoring-requirements-v5.md` の全レビュー範囲の
> 日本語訳である。英語版が正本であり、本訳はユーザレビュー支援用である。
> 本訳はrevision 5正本全体に対応する。完全な同一性情報は別添セルフレビュー記録に保存する。

- 状態: Step 1 候補、セルフレビュー完了、オーナーレビュー待ち
- 日付: 2026-09-11
- 意思決定者: Product owner
- レビュー上の置換対象: `character-v3-authoring-requirements-v4.md`
- 範囲: V3キャラクタ新規作成、V3キャラクタ改訂、V2からV3への移行
- 根拠: 未受理のキャラクタrevision 4、受理済み共通基盤revision 3とその受入記録、
  移行元からの再試行・移行時のみの退避情報閲覧に関するオーナー訂正、
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

## 継承する共通基盤とレビュー範囲

このキャラクタ要件は、受理済み
[構造化意味オーサリング基盤revision 3](../structured-semantic-authoring-foundation-requirements-v3.md)
のF1〜F15を継承する。正確なSHA-256は
b5693f6d47e975ea1cb78adaa686185630db5ffc6d52c74f3481ac77511c99daである。
[受入記録](../structured-semantic-authoring-foundation-requirements-v3-acceptance.md)が受理を確立しており、
候補ヘッダの過去の状態とは別に扱う。

共通ライフサイクル、部分作業・Tool公開、提案適用、回復、照合、activationの契約は基盤が所有する。
本文はキャラクタAdapterの意味保護、意味チェック時期、検査観点、V3完成条件、評価要件を追加する。
参照した基盤条項を取り込むものであり、別実装を設けたり、基盤条件を弱めたりしない。

revision 4は過去の未受理候補として維持する。本版はレビュー対象として置き換え、
基盤v3の機械的安全策を継承し、キャラクタ進捗指標を定義する。
v4の元情報からの再試行と、移行時だけの退避閲覧を維持する。
実行中は有効な部分成果を再利用し、失敗後は新attemptで元情報から部分作業全体を再構築できる。
途中candidate・context・checkpointの永続化は必須ではない。
既存immutable generation、attempt identity、質問・回答のauthority、必須のprovider・失敗記録は区別する。

今回のレビュー範囲はrevision 5全文とrevision 4との差分である。
受理済み共通基盤は固定依存先として扱い、再承認対象にはしない。
今後これと衝突する変更には、明示的なAuthority判断が必要である。

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

- 受理済み基盤revision 3の個別契約対応表を、revision 6 R9/R11/R14とADR-0030 D5/D7/D8/D9/D10へ
  適用する。キャラクタの生成補完は認可済みであり、由来・元情報・開示・runtimeの制限を維持する。
- ADR-0030のoperation、保存、receipt、owner-review原則は共通基盤を通じて採用し、
  以下のキャラクタ固有制約を適用する。
- ADR-0030 D8のwhole-source/whole-candidate LLM reviewを、サーバ全体検証、focused semantic
  lens、progressive checkpoint、最終input/output照合へ置換する。
- ADR-0030 D9のwhole-candidate再reviewを、影響範囲だけの自動回復、focused retry、例外的で
  永続化される人間Q&Aへ置換する。
- 現行ADR-0030の最大2修復・6request上限は、Acceptedな後継ADRで明示的に置換するまで維持する。
  基盤採用だけで現行実装やpolicyを即時変更しない。
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

### R5. ClaimとObligationの記録

基盤F3を継承する。キャラクタAdapterは必須V3 target、関連V2 sourceの処置、重要なキャラ設定、
要求された変更をすべて記録・確認する。改訂では無関係な保護対象の意味も扱ったことを確認する。
不足は原則として生成義務となり、直接mappingがない理由で元情報の意味を黙って削除しない。

### R6. Focused Semantic Work Item

obligationはsemantic dependencyでgroup化する。各work itemは関連claim/fragment、書込可能なsliced schema、
登録reference/constraint、割当済みID、prior result、scope内findingだけを含む。完全なV3 schema、完全な
candidate、全path一覧は含めない。closureが大きすぎれば分解するかtechnical blockとし、黙って拡大しない。

### R7. Resolverに依存しないTyped Result

基盤F5を継承する。キャラクタの提案には記録対象の低重要度調整と、意味的な依存先を含める。
stable ID、engine rule、runtime fact、ownership、disclosure rightを捏造したり、
サーバ登録済みの書込範囲を逸脱したりしてはならない。

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

基盤F6を継承する。キャラクタの即時検証にはaction legality、登録reference、
consumer/disclosure policy、元情報の対応確認、V3断片の妥当性を含める。
意味整合に必要なら構造的に正常なキャラクタ項目も修正範囲にできる。
実行中の修復では、不正提案によって既存の有効な部分成果を失わない。

### R10. Progressive Semantic Review

semantic reviewは次の4段階を比例的に用いる。下表のblock規則は意味上の指摘に対するものであり、
基盤F15の強制停止やR16の完全検証を回避する許可ではない。信頼できない内部状態は、通常の不正patch拒否と区別する。

| 段階 | 時期と範囲 | Block規則 |
| --- | --- | --- |
| 即時hard check | patchごと。局所的な構造・authority invariant | invalid patchだけを拒否し自動回復を開始 |
| semantic-skeleton checkpoint | identity、core goal、essential ability/limit、key relationshipが揃い、dependent prose/behaviorへ波及する前 | material protected conflictだけfan-outを止め、soft findingは自動修復へ |
| affected-cluster checkpoint | dependency境界またはmaterial変更後。変更claimとdependantだけ | affected obligation/lensだけreopen/recheck |
| 最終reconciliation | owner review前に完全server candidateと全frozen authorityを比較 | material unresolved defectだけcandidate-readyをblock |

実行中は変更のないlensとvalid workを再利用する。新attemptの再構築はR12/R14に従い、
部分作業を再実行できる。review可能という理由だけでcheckpointを追加してはならず、named
failure pathを、回避できる手戻りより低い期待costで防ぐ場合だけ置く。

### R11. Focused Semantic Lens

versioned lensは、identity/background/disposition/goal/guidance、ability/combat parameter/action/fallback、
relationship/self-awareness/speech/counterpart effect、appearance/public support/disclosure/consumer、
cross-reference/provenance/authorityをcoverする。各lensはprojectionだけを受け、claim/obligationに結びつく
bounded findingを返す。deterministic、LLM-assisted、owner-reviewedのいずれでもよいが、whole-character LLM
callをcorrectness oracleにしない。

### R12. 自動回復と移行元からの再試行

基盤F9を、失敗attemptと新attemptの区別も含めて継承する。
キャラクタ修復は正確なエラー、原因情報、関連する元情報、実行中のattemptに残る有効な部分成果、
登録済みの意味的依存先を使う。失敗後に新しい再試行が明示要求された場合は、
保持した元情報・失敗情報・適用可能な確認回答から部分作業を再構築し、
元情報とcurrent pointerの変化を再確認する。失った途中状態の再利用は要求しない。

再構築では、部分呼出で処理済み作業を再計算できる。完全なキャラクタやスキーマをLLMへ渡すことは
許可しない。インフラ状況の改善後は再試行できるが、不正出力の反復には情報追加・作業の限定・
別の認可済み手段が必要である。既存予算を適用し、無制限の自動有償再試行としてリセットしない。

### R13. 例外的な人間Q&AのThreshold

次のすべてが成立するときだけ人間Q&Aへ入る。

1. 単なる不足ではなく、conflict/problemが明示的である。
2. protected anchor、required correctness、またはmaterialにcharacterを定義するtraitへ影響する。
3. 妥当な自動解決案が、materialに異なるcharacterを作るか、異なるprotected constraintへ違反する。
4. focused automatic recoveryを使い切っている。
5. owner intentなしには安全な選択・整合・deferができない。

1つでも偽なら、意味上の判断をownerへ質問しない。実行可能な間はgeneration、automatic reconciliation、
repair、valid deferralで続行する。技術的失敗はR19に従ってattemptを終了でき、R12の再試行対象になる。questionには最小のsource/
candidate projection、自動選択が危険な理由、選択肢のbounded effect、free-form経路、再開するworkを示す。raw schema
知識やhidden chain-of-thoughtを求めない。

### R14. Answer Authorityと自動処理への復帰

基盤F10を継承する。回答はappend-onlyで由来を持つ質問範囲内のauthorityであり、最終受入ではない。
実行中の状態が利用できれば、影響するobligationとlensを再開して無関係な有効成果を再利用する。
利用できなければ、新attemptで元情報と記録済み回答から部分作業を再構築できる。
途中candidate、context、checkpointの永続化は必須ではない。

適用可能な記録済み回答を使って同等質問を重複排除する。
新しく区別された重要な不確実性がある場合だけ再質問し、元情報からの再構築だけを理由に
既に適用可能な回答を無効にしない。

### R15. 最終Input/Output照合

各lensはfrozen input、authorized change、記録済みinterpretation/adjustment、final outputを比較する。material relationを
preserved、authorized change、source-supported synthesis、creative completion、coherent interpretation、low-importance
adjustment、valid deferral、preserved retirement、material contradiction、source loss、unsupported material addition、
unresolved material meaningに分類する。

最初の8分類はinvariantを満たせばreview可能な成功状態である。この意味分類の中では最後の4分類だけが
candidate-readyをblockし、focused repair、またはR13を満たす場合にhuman questionを作る。
基盤F15の強制停止とR16の完全検証は、独立して必須のままである。schema validityだけでreconciliationを上書きできない。

### R16. 完全Server Validation

owner review前にcandidate全体がstrict V3 schemaとserver invariantを通る。reference、action、compiler compatibility、
disclosure、consumer、ledger closure、preservation、source accounting、lens coverage、final reconciliation、material
unresolved meaningがないことを含む。基盤F11に従いserverはcandidate全体を検証し、
LLMには完全なcandidateやschemaを渡さない。

### R17. DeferralとPreservation

active V3は構造的に完全である。selected consumerに不要な意味はactive field外のaccepted typed deferralを使える。
required structure/valueにsentinelやfabricated emptyを使えない。変更・retireしたV2 valueとretentionが必要なV3 valueは
restricted contractで保存し、通常runtime/public/authoring consumerから除外する。
基盤F12に従い、退避領域は移行中の認可済みマイグレータだけが閲覧でき、その移行自身の検証も含む。
独立review readerの権限は追加しない。ADR-0030 D5のキャラクタカプセル256 KiB上限、
参照先generationとともに保持すること、既存owner data lifecycleを維持する。

### R18. 最終Owner ReviewとActivation

final reviewではcomplete safe candidateとmode別semantic diffを示す。created fact/creative addition、requested/consequential
revision change、または全migration dispositionである。routine completionでownerを埋め尽くさず、protected-anchor解釈、
自動low-importance adjustment、uncertainty、影響の大きいgenerated factを強調する。

Q&A answerはfinal acceptanceを代替しない。acceptanceはexact candidateとreceiptをbindする。append/CAS activationはprovider
workを行わず、failure、decline、drift、cancellationはcurrent generationを変更しない。

### R19. 失敗attemptと再試行可能性

基盤F9/F11/F15を継承する。不足情報や軽微な矛盾は原則として生成・自動整合へ進め、
キャラクタの意味的な不適格判定にしない。
Provider/インフラ障害、不正な結果、認可済み実行予算の枯渇は、attemptを失敗として終了できる。
さらに、基盤F15の強制停止条件、有限の回復で解消しない膠着、内部破損では失敗終了を必須とし、
同規則に従って後続実行と遅延結果の適用を止める。

元情報、そのidentity、失敗理由、必須のrequest記録を保持する。
失敗してもcurrent generationを変更せず、適用される技術的条件が整えば、
R12に従う明示要求の新attemptで元情報から再試行できる。
途中の移行コンテキストやcheckpointの永続化は要求しない。
失敗、取消、削除、意味上のowner質問、最終owner acceptanceは異なる結果であり、
attemptの失敗はキャラクタが本質的に不正である証明ではない。

### R20. 評価とTuningのEvidence

owner-reviewedなcreate/revise/migrate代表corpusで、automatic completion、生成情報品質、automatic reconciliation精度、
protected-anchor維持、不要question率、recovery当たりquestion数、late-review rework、checkpoint block時間、repeated question、
latency、call数、token/cost、final semantic correctnessを測る。hidden source loss、protected contradiction、unsafe invention、
improper deferral、final reviewまでmaterial issueを見逃したcaseはautomatic successに数えない。

numeric success threshold、corpus構成、importance calibration、checkpoint budgetは、localおよびaccepted live-model evidenceに
基づく別owner decisionとする。

### R21. キャラクタ進捗と継承する機械的安全策

すべてのキャラクタcreate/revise/migrate attemptに基盤F15を適用する。
キャラクタ専用の第2予算を実装したり、キャラクタresolverへ計数リセット、上限拡大、
失敗終了の上書き権限を与えたりしない。

versionedなキャラクタAdapterは、既存のドメイン契約に基づいて、フェーズ別の進捗と
関連状態の同値性を提供する。

- 骨格作業: 保護対象のidentity、goal、必須ability/limitation、relationship claimの対応確認と、
  それらに残る重大な衝突。
- 依存作業: 必須V3義務、元情報の処遇、合法な参照の解決状況。重大変更で再開した依存も含む。
- 最終照合: 意味検査観点の網羅と、固定入力・認可変更に対する重大な不整合の解消。

指標は検証された変更と台帳上の証拠を参照し、文章量、呼出数、LLM自身の完成宣言は使わない。
新たな単一品質スコアを定義したり、意味的正しさを証明したりするものではない。
各フェーズでの具体的な比較方法は基盤F2/F15に従う後継設計で定める。

修復により義務が再開したり指摘が増えたりしても、それだけで膠着とはしない。
関連義務を解消せずgoal、ability、relationshipの解釈を交互に戻す状態は、
無関係な文章が変わっても、同値・再出現状態として観測可能にする。
継承した有限区間・予算で検出と回復を行い、無期限探索や毎ステップ改善を要求しない。

キャラクタ適合検査では、計画・検査観点・分割・修復を通した累積予算、未解決状態の反復と交互遷移、
有用な一時後退、不正提案と信頼する台帳の破損の区別、失敗終了後の遅延結果、
明示的な元情報からの再試行を扱う。制御可能なAdapterで有償provider呼出なしに安全動作を検証できる。
実際の自動完了と意味品質は引き続きR20の評価対象である。

有限の監視履歴はメモリ上の保持でよい。基盤F15が要求するコンパクトな失敗診断と既存receiptだけを
保持すればよく、全会話や途中移行コンテキストの永続化は必須にしない。
この作成時の進捗契約は、反応専用の潜在意識へ知識や熟考を移さず、顕在意識の判断やエンジンの責務を変更しない。

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
- 新基盤の数値目標・model route・予算・正確なAPI/status/receipt identityは後継判断とし、
  既存Accepted上限は継続適用する。
- 失敗後の再構築は永続化要件を軽くするが、provider作業の再実行で時間・費用が増える可能性がある。
  適用可能な回答の保持により同じ質問を避ける。
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
11. 実行中のmaterial changeは影響するobligation/lensを再開し、有効成果を再利用する。
    失敗後は元情報からの再構築により作業を再計算できる。
12. final reconciliationは記録済みcreative completion/minor adjustmentを受け入れ、material contradiction、source loss、unsupported material addition、unresolved material meaningを検出する。
13. complete server validationがstructure、reference、action、compiler、disclosure、consumer、preservation、accounting、coverage、reconciliationをcoverする。
14. Answerはappend-only scoped authorityであり、final acceptanceを意味しない。
15. evaluationが不要なearly questionとlate-review reworkの両方を報告し、一方の隠蔽で他方を改善したように見せない。
16. final owner acceptanceがappend/CAS activationより先であり、provider、deployment、production、rollback、releaseは別gateのままである。

17. Provider障害や予算枯渇時は元情報identityと失敗情報を保持して失敗終了でき、
    途中context/checkpointの永続化なしで新しい移行元からの再試行が可能である。
18. 記録したQ&A回答から、実行継続または元情報からの再構築で自動処理へ戻り、
    再開始したことだけを理由に回答を無効にしない。
19. 退避領域は移行中のマイグレータだけが閲覧でき、キャラクタカプセルの
    アクセス・容量・保持・ライフサイクル制限を維持する。

20. キャラクタattemptは基盤F15を継承し、重複予算やリセット可能な予算を設けない。
21. Adapterの進捗・状態同値性指標は骨格、依存義務、最終照合を対象とし、正当な一時後退を許容する。
22. 適合検査は有限の膠着・循環回復、内部破損と不正提案の区別、遅延結果、
    checkpoint永続化必須ではない明示的な元情報からの再試行を扱う。

## 対象外

- V3 field semanticsの変更。
- numeric threshold、provider route、budget、production policyの選択。
- UI、persistence、worker、adapter、compiler、databaseの実装。
- paid/production call、deployment、production data migration、candidate acceptance、pointer移動、policy activation、rollback、release。
- 受理済み共通基盤の変更や、他asset-family Adapterの定義。

## revision 4からの対応とセルフレビュー

revision 4は変更せず保存する。本候補は固定依存先を受理済み基盤v2からv3へ変更し、F15を継承する。

- R1〜R9、R11〜R14、R16〜R18、R20、3modeの完成条件は、キャラクタ成果と文言を維持する。
- R10/R15は意味上のblock分類が機械的強制停止や完全検証を上書きしないことを明記する。
  新しい意味的拒否分類は導入しない。
- R19はF15の失敗終了条件を取り込む。
- R21はドメイン進捗の意味と安全適合検査を定め、受入基準20〜22で扱う。
- 既存の受理済み修復上限、元情報からの再試行、退避アクセス、意味保護、runtime責務境界を維持する。

セルフレビュー: 要件revision 5は製品・schemaのversion変更ではない。
新しい数値上限、API、module、検出アルゴリズム、provider経路は選ばない。
独立レビューとオーナー受理は未実施であり、既存実装を適合の証明にはしない。

代案は基盤参照だけを更新することだが、キャラクタ進捗契約が暗黙のままで、
意味上のblock限定記述も曖昧に残る。採用案は小さなドメイン契約の明示であり、
別の制御機構の新設ではない。誤検出・循環の見逃しは評価リスクとして残り、
基盤の強制上限は検出精度と独立して維持する。

## 独立Reviewへ提示する論点

revision 5全文を、固定された受理済み基盤revision 3と未受理キャラクタrevision 4に照合する。
R21の進捗指標がキャラクタ意味を維持し、runtimeの潜在意識・顕在意識・エンジン責務と
分離されているか確認する。毎ステップの単調な進捗や途中context永続化を要求しないか、
R10/R15の意味上のblockとR19の失敗処理がF15に従い、不足生成や軽微な整合化を早期拒否に
変えていないかを確認する。3modeの成果、保護対象の意味、移行時だけのカプセルアクセス、
既存上限、元情報からの再試行、最終strict検証、例外的なR13人間Q&Aの維持も確認する。
数値・検出方式・providerの未決定事項は後継設計・評価として分類し、受入基準を創作しない。

## レビュー経路

REVIEWでは独立レビュー後、Step 4のオーナー判断へ進む。
候補本文の変更には新revisionとStep 1の再実施が必要である。
