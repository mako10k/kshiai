# 部分構造化意味作成基盤 — 実装設計候補v1 revision 2 全文日本語訳

- 状態: 改訂設計候補、訂正版レビュー指摘対応済み、再レビュー待ち
- 日付: 2026-09-11
- 根拠: 受理済みADR-0031 revision 1、基盤要件v3、キャラクタ作成要件v5
- PERT task: `cb215`
- 範囲: ADR-0031 D11が実装前に要求する正確な契約
- 対象外: 実装、provider呼出、評価、deployment、本番migration、candidate受理、
  pointer/policy activation、rollback、release

## 1. 成果と互換境界

`create`、`revise`、`migrate`に共通する薄い制御基盤を実装対象とする。基盤は
部分作業のschedule、Adapter所有の提案のtransaction適用、証拠・有限資源の計数、
停滞・循環検出、型付き終端結果を担当する。キャラクタ、戦場、ナレーションスタイル、
戦闘中認知の意味は所有しない。

最初の実動作consumerはV3キャラクタ作成とする。戦場・ナレーションスタイルは当初、
適合Adapterとfixtureだけを提供する。後続の実装・cutoverゲートまで既存公開API、
immutable generation ID、authoring attempt ID、pointer、battle binding、現行routeを変えない。

既存B3〜B5実装は実装材料であって本設計の適合証拠ではない。

- qualified V3キャラクタ、compiler、capability、capsule、attempt、request、receiptは
  適合する範囲でAdapterへ再利用できる。
- 現行の全candidate LLM review loopは新kernelではない。
- `CHARACTER_MIGRATION_PROVIDER_REQUEST_LIMIT = 6`は現行routeの上限として残る。
- family queueとfenceはPort経由で再利用し、character固有状態をkernelへ持ち込まない。

## 2. Moduleと依存境界

新規共通コードの配置候補は次のとおり。

- `packages/shared/src/semantic-authoring.ts`: backend module境界を越える内部型付き契約と
  closed vocabulary
- `backend/src/services/semantic-authoring/kernel.ts`: 純粋な制御状態遷移
- `capability-session.ts`: Skill解決とrequest単位のTool公開
- `progress-monitor.ts`: 有限の機械的進捗・循環検出
- `ports.ts`: provider、時計・計数、owner-fenced persistence interface
- `adapters/character-v3.ts`: 最初の高度domain Adapter
- 同Adapter test配下: test専用の戦場・ナレーションAdapter

共通kernelは共通semantic-authoring契約だけをimportし、character、battlefield、
narration-style、battle-service、route moduleをimportしない。Adapterは各domain schema・
compilerをimportできる。routeとworkerはapplication serviceを呼び、kernelを直接呼ばない。

## 3. 型付き内部契約

### 3.1 Run identityとpolicy

`SemanticAuthoringRunV1`は内部契約であり、asset schema versionではない。

```ts
type SemanticAuthoringModeV1 = "create" | "revise" | "migrate";

type SemanticAuthoringRunV1 = Readonly<{
  runId: string;
  attemptId: string;
  family: "character" | "battlefield-preset" | "narration-style";
  mode: SemanticAuthoringModeV1;
  ownerUserId: string;
  sourceIdentity: Readonly<{
    assetId: string;
    generationId: string | null;
    contentDigest: string;
  }>;
  targetContract: Readonly<{ family: string; version: number }>;
  adapterIdentity: string;
  policyIdentity: string;
  pricingIdentity: string;
  tokenEstimatorIdentity: string;
  expectedCurrentGenerationId: string | null;
  executionFence: Readonly<{
    ownerId: string;
    fencingToken: number;
    runVersion: number;
  }>;
}>;
```

すべてHTTP、database、provider境界で一度だけparseし、内部callはTypeScript値を渡す。
JSON文字列往復、`as unknown as`、未検査castは禁止する。DB driverがJSON列を
`string | object`で返す場合だけrepository codecで両者をparseし、既に型付きの値を
stringifyして再parseしない。

### 3.2 Kernel state

`SemanticAuthoringStateV1<C, O, F>`は、immutable run/policy、in-memory candidate、
obligation台帳、deduplicateしたfinding台帳、provenance/source-disposition台帳、
累積資源・未精算予約、phase・有限進捗履歴、active work item/capability session、
最大1件の実行中provider request、最大1件の終端結果を保持する。

これはclaimした1 process内だけのprivate stateで、checkpointとしてserializeしない。
section 8のrecordだけを永続化する。

### 3.3 Adapter契約

```ts
interface SemanticAuthoringAdapterV1<
  Source, Candidate, Obligation, WorkItem, Proposal,
  Finding, Question, Answer, FinalCandidate
> {
  readonly identity: string;
  decodeFrozenSource(value: unknown): DecodeResult<Source>;
  buildBaseline(source: Source, mode: SemanticAuthoringModeV1): Baseline<Candidate, Obligation>;
  selectWork(state: AdapterStateView<Candidate, Obligation, Finding>): WorkSelection<WorkItem>;
  describeCapabilities(work: WorkItem): CapabilityDescriptorV1;
  decodeProposal(work: WorkItem, value: unknown): DecodeResult<Proposal>;
  stageProposal(input: StageProposalInput<Candidate, Obligation, Finding, Proposal>):
    StageProposalResult<Candidate, Obligation, Finding>;
  reconcileAffected(input: AffectedReconciliationInput<Candidate, Obligation, Finding>):
    ReconciliationResult<Finding>;
  observeProgress(input: AdapterProgressInput<Candidate, Obligation, Finding>):
    AdapterProgressObservationV1;
  assessQuestion(input: QuestionAssessmentInput<Candidate, Obligation, Finding>):
    QuestionAssessment<Question>;
  applyAnswer(source: Source, question: Question, answer: Answer): SourceClarification;
  finalize(input: FinalizationInput<Candidate, Obligation, Finding>):
    FinalizationResult<FinalCandidate, Finding>;
}
```

`unknown`は2つのdecoder入力だけに現れる。kernelはAdapterのcandidate/proposal内部を
検査・編集しない。Adapterは新しいimmutable値またはreject結果を返し、永続化・provider
呼出はできない。

### 3.4 共通結果型

内部のclosed result kindは次の3つ。

- `ready_for_review`: 正確なfinal candidateとvalidation receipt
- `needs_owner_answer`: 正確な永続question候補と再開recipe
- `failed`: 技術的または有限の意味的failure receipt

これは内部discriminantであり公開attempt status文字列ではない。全結果はrun/attempt/
source/policy/adapter identityと累積計数を持つ。`ready_for_review`はさらにcandidate
digest、obligation網羅、意味照合・compiler・disclosure receipt、expected pointerを束縛する。
owner cancelとexpiryは制御上の終端状態で、resolver結果ではなく、意味的・技術的failureへ
読み替えない。

## 4. 部分作業、Skill、Tool

### 4.1 Skill記述

server所有の版付き`SemanticAuthoringSkillV1`には目的、phase、合法なcapability role、
現在capabilityの要求方法、資源・開示注意だけを含める。domain全schema、全candidate、
全path、累積会話は含めない。allow-list registryで解決し、modelは任意handler/schema
identityを指定できない。

### 4.2 Request単位capability session

1 work itemでmodelへ同時公開するToolは最大2つ。

1. `authoring_query_context_v1`: Adapter許可selectorだけのread-only query
2. `authoring_propose_change_v1`または`authoring_submit_review_v1`: proposalだけを返す

決定論的validatorはTool公開せずserver内で動かせる。query-all、全path列挙、raw SQL、
全candidate、全schema capabilityは設けない。sessionはrun/work-item、許可selector、
proposal schema identity、write closure、期限、call数を束縛し、proposal/review提出、
work item変更、期限、終端で失効する。

query inputはstrict object `{ runId, workItemId, capabilitySessionId, selector, claimIds }`。
IDは共通160文字上限、`claimIds`は0〜8個の一意ID。Character Adapterの`selector`は正確に
`source-claims`、`candidate-claims`、`obligations`、`findings`、
`mechanical-capabilities`、`preservation-claims`で、最後はmigrate workだけに登録する。
responseは`{ selector, segments }`で、`segments`は1〜8個のstrict
`{ segmentId, claimId, role, text, referenceIds }`。`role`は`source`、`candidate`、
`obligation`、`finding`、`mechanic`、`preservation`。textは1〜1,200文字、reference IDは
0〜8個の一意な共通ID。serverがtyped stateからbounded text projectionを構築し、model由来の
authorityやraw schema fragmentにはしない。

queryはwork itemごと最大4回、累積12 KiBまたは3,000 model token。proposal/review inputは
section 4.3のexact envelopeで、最大3回invoke、成功は1回だけ。encoded出力は6 KiBまたは
1,500 token。reject responseは最大8件のstrict
`{ code, operationIndex, message, affectedClaimIds }`。codeはAdapter登録済み、indexはnullまたは
0〜7のinteger、messageは1〜400文字、affected claimは0〜8個の一意な共通ID。このcompact
errorをfocused corrected proposalの証拠にし、全candidateは公開しない。全invokeとprovider
continuationはsection 7のattempt上限にも加算する。

### 4.3 Proposal envelope

共通envelopeは型付き、`payload`はAdapter固有とする。

```ts
type SemanticProposalV1<P> = Readonly<{
  proposalId: string;
  runId: string;
  workItemId: string;
  baseCandidateRevision: number;
  capabilitySessionId: string;
  proposalSchemaIdentity: string;
  sourceClaimIds: readonly string[];
  affectedObligationIds: readonly string[];
  declaredSemanticDependantIds: readonly string[];
  provenance: readonly ProposalProvenanceV1[];
  ownerExplanation: string;
  uncertainty: readonly ProposalUncertaintyV1[];
  payload: P;
}>;
```

汎用JSON Patchは採用しない。Adapterがclosed proposal unionと正確なpayload schemaを持つ。
path/claim IDはmodelが自由入力するJSON Pointerではなく登録済みidentifierとする。
Adapterがstage前に合法write closureと必要な依存変更を計算する。

共通wire schemaはstrictで、正確な上限は次のとおり。

| member | 契約 |
| --- | --- |
| `proposalId`、`runId`、`workItemId`、`capabilitySessionId` | 1〜160文字のstring |
| `baseCandidateRevision` | 0〜2,147,483,647のinteger |
| `proposalSchemaIdentity` | capability sessionが選んだallow-list literal |
| claim、obligation、dependantの各ID | 1〜160文字のstring |
| `sourceClaimIds` | 1〜24個の一意ID |
| `affectedObligationIds` | 1〜24個の一意ID |
| `declaredSemanticDependantIds` | 0〜24個の一意ID |
| `provenance` | 1〜24個のstrict `ProposalProvenanceV1` |
| `ownerExplanation` | 1〜800文字 |
| `uncertainty` | 0〜8個のstrict `ProposalUncertaintyV1` |

`ProposalProvenanceV1`は`{ targetClaimId, sourceClaimIds, method }`。target/source IDは
160文字上限、source IDは1〜12個の一意値、`method`は`preserved`、`derived`、
`generated`、`reconciled`、`owner-clarified`のいずれか。
`ProposalUncertaintyV1`は`{ claimId, kind, explanation }`。`kind`は
`missing-source`、`ambiguous-source`、`generated-detail`、`semantic-tension`、
`deferred-resolution`のいずれかで、説明は1〜400文字。未知memberはdecode失敗とする。
さらにencoded proposalは6 KiB上限を満たし、より厳しい上限を採用する。

### 4.4 Transactional staging

外部responseをAdapter proposalへdecodeし、run/work/session/schema/base revision/予約を
検証する。Adapterはcandidateと台帳を隔離memoryへstageする。stage値全体にhard schema、
reference、authority、disclosure、compiler、accounting、trusted-state検査を行い、
すべて成功時だけin-memory stateを一括置換する。失敗時は信頼済み状態を保持し、
deduplicateしたfindingを1件追加する。

元のerror field外でも、Adapter計算済みclosure内でproposalに列挙された意味依存修正なら
合法とする。

## 5. Character Adapter

5つの意味clusterを使用する。

1. identity、background、disposition、goal、conscious guidance
2. ability、combat parameter、action、action norm、mechanical fallback
3. relationship、self-awareness、speech policy、counterpart effect
4. appearance、public support、disclosure、consumer projection
5. cross-reference、provenance、source disposition、preservation、authority

create/migrateではsemantic-skeleton phaseをcluster 1と同一視しない。cluster 1に加え、
essential ability/limitとkey relationshipの確立に必要な、server指定済みcluster 2・3のclaim
sliceだけを含む。Adapterは登録済みclaim IDに対するfocusedなcheckpoint前workをscheduleする。
identity、core goal、essential ability/limit claim、key-relationship claimが存在し、該当hard
checkに合格した後だけcheckpointを通過する。その後に限りcluster 2〜4の残りdependent workを
fan-outできる。checkpoint前にcluster 2・3全体を公開または再生成するものではない。reviseは
要求clusterと登録済みdependantだけを開き、無関係なprotected claimもobligationとして保持する。
cluster 5は継続的server照合・最終gateであって、全character model requestではない。

proposal unionは`set_skeleton`、`complete_cluster`、`repair_cluster`、
`classify_source_disposition`、`propose_deferral`、`submit_lens_review`。
candidate書込みはcluster単位の置換ではなく、小さなdiscriminated operationを使う。
全`value` schemaは`CharacterDefinitionV3ObjectSchema.shape`（arrayは該当`.element`）を
直接参照し、V3からdriftさせない。正確なoperation catalogは次のとおり。

| cluster | operation literal | target key | 正確なvalue schema |
| --- | --- | --- | --- |
| skeleton | `replace_identity` | `identity` | `.shape.identity` |
| skeleton | `upsert_background` / `remove_background` | `profileBackground:<id>` | `.shape.profileBackground.element` / stable ID |
| skeleton | `replace_psyche_dynamics` | `psycheDisposition:dynamics` | `.shape.psycheDisposition.shape.dynamics` |
| skeleton | `upsert_core_need` / `remove_core_need` | `psycheDisposition:coreNeeds:<id>` | core-needs element / stable ID |
| skeleton | `upsert_tendency` / `remove_tendency` | `psycheDisposition:tendencies:<id>` | tendencies element / stable ID |
| skeleton | `set_psyche_description` | `psycheDisposition:description` | nullable character description |
| skeleton | `upsert_conscious_guidance` / `remove_conscious_guidance` | `consciousGuidance:<id>` | conscious-guidance element / stable ID |
| mechanics | `set_action_semantics` | `capabilities:actions:<id>` | basic-action/skills element `.omit({ mechanics: true })` |
| mechanics | `set_inventory_semantics` | `inventory:<id>` | inventory element `.pick({ id: true, name: true, kind: true, description: true })` |
| mechanics | `upsert_action_norm` / `remove_action_norm` | `actionNorms:<id>` | action-norm element / stable ID |
| mechanics | `upsert_mechanical_fallback` / `remove_mechanical_fallback` | `mechanicalConflictFallbacks:<id>` | fallback element / stable ID |
| relationship-expression | `upsert_relationship_seed` / `remove_relationship_seed` | `relationshipSeeds:<id>` | relationship-seed element / stable ID |
| relationship-expression | `replace_speech_policy` | `speechPolicy` | `.shape.speechPolicy` |
| appearance | `set_appearance_summary` | `appearance:publicSummary` | `.shape.appearance.shape.publicSummary` |
| appearance | `upsert_appearance_detail` / `remove_appearance_detail` | `appearance:details:<id>` | details element / stable ID |
| appearance | `set_visual_prompt` | `appearance:visualPrompt` | `.shape.appearance.shape.visualPrompt` |
| appearance | `set_expression_notes` | `expressionNotes` | `.shape.expressionNotes` |

upsertは正確に`{ op, value }`を持ち、stable IDは`value.id`。removeは正確に
`{ op, id }`、replace/setは正確に`{ op, value }`を持つ。2つのsemantic setterでは、
serverが`value.id`で事前割当recordへmergeし、省略されたmechanical memberを変更しない。
全objectはstrict。
`CharacterCandidateOperationV1`は上表全行のdiscriminated union。candidate変更proposalは
1〜8 operationを宣言順に持ち、target keyは一意。競合write、value IDとtarget keyの不一致、
存在しないIDのremoveはdecode/staging失敗とする。proposal全体は6 KiB上限。単一の合法valueが
収まらない場合、schema公開範囲を増やしたり切り詰めたりせず、Adapterが決定論的導出または
受理済みdeferral/Q&A routeを使う。

model向けpayloadは次のclosed unionで、全objectはstrict。

```ts
type CharacterProposalPayloadV1 =
  | { kind: "set_skeleton"; operations: readonly CharacterSkeletonPhaseOperationV1[] }
  | {
      kind: "complete_cluster" | "repair_cluster";
      cluster: "mechanics" | "relationship-expression" | "appearance";
      operations: readonly CharacterCandidateOperationV1[];
    }
  | {
      kind: "classify_source_disposition";
      decisions: readonly SourceDispositionDecisionV1[];
    }
  | {
      kind: "propose_deferral";
      obligationIds: readonly string[];
      resolution: "generate-later" | "derive-later" | "owner-answer";
      reason: string;
    }
  | {
      kind: "submit_lens_review";
      lens: "source-consistency" | "cross-reference" | "authority" |
        "disclosure" | "compiler";
      findingIds: readonly string[];
      verdict: "pass" | "repair-required";
    };
```

`SourceDispositionDecisionV1`は正確に`{ sourceClaimId, disposition,
targetClaimIds, rationale }`。IDは共通の160文字上限、`targetClaimIds`は0〜12個の一意値、
`rationale`は1〜400文字、dispositionは`preserve`、`transform`、`split`、`merge`、
`supersede`、`discard-as-nonmaterial`、`preserve-in-capsule`のいずれか。decision arrayは
1〜24件で`sourceClaimId`が一意。deferral obligation IDとreview finding IDは1〜24個の
一意値、deferral reasonは1〜400文字。`submit_lens_review`はcandidateを変更できず、
serverが指定deterministic lensを再実行し、提出verdictはmodel claimとしてのみ扱う。

`CharacterSkeletonPhaseOperationV1`はcluster 1 operationに、`set_action_semantics`、
`set_inventory_semantics`、`upsert_action_norm`、`upsert_mechanical_fallback`、
`upsert_relationship_seed`を加えたclosed subsetである。cross-cluster operationは、そのtarget keyが
current work itemのserver登録済み`skeletonRequiredClaimIds`に含まれる場合だけ`set_skeleton`で
合法となる。focused contextとwritable schemaには、それ以外のcluster 2・3 claimを含めない。

`set_skeleton`はprotected skeleton phaseでのみ合法で、このclosed phase unionだけを受ける。
cluster variantはsessionが同じclusterを指定し、全operationがそのclusterに属する場合だけ合法。
repairが元のerror以外のschema-valid fieldを変更できるのは、
Adapter算出済みregistered closure内で`declaredSemanticDependantIds`に列挙される場合だけ。
cluster 5には一般candidate-write variantを設けず、source disposition、deferral、lens reviewは
typed ledger/findingだけを更新する。combat parameter、action mechanics、inventoryのmechanical
effect、causal envelope、loadoutはmodel-writable operationにしない。stable IDとこれら全mechanicsは
serverがmodel公開前に割当・解決し、staging後に再検証する。

portrait bindingはmodel-writable closureに含めない。createはserver scaffoldのnullまたは
pre-authorized bindingを維持し、revise/migrateは凍結baselineのexact bindingを維持する。別途認可
されたserver portrait operationは、このproposal union外でbindingを変更できる。`set_portrait`を
含むprovider responseはunknown operationとしてfail closedし、`mediaId`または`revisionId`を選択
できない。

preservation capsuleはmigration work解決中のmigrate Adapterだけが参照し、create/revise Toolへ
含めない。

既存`CharacterSemanticMigrationChangeSetV1`は、6 operationの1つを新proposalへlossless
decodeできる場合だけbridgeする。generic valueとして通さず、全candidate review型は再利用しない。

## 6. 照合とowner Q&A

findingはcode、検査claim ID、影響obligation ID、正規化discrepancyでdedup keyを作る。
同じfindingの文章だけを変えても進捗にしない。

owner質問は、明示problem、material protected impact、結果が大きく違うcredible option、
自動回復済み、安全な選択・照合・defer不能という受理済み5条件すべての証拠をAdapterが
示す場合だけ合法。kernelは証拠参照と残予算を検査するがキャラクタ意味を決めない。

owner回答後は必ず新しい明示attemptで再開する。待機中のmemory checkpointは保持しない。
回答を範囲付きsource clarificationとしてappendし、新attemptで固定、source/pointer driftを
再検査し、部分作業を再構築する。長期suspend leaseより単純でsource-based retryに従う。

## 7. 正確な実行・進捗policy

### 7.1 初期新route policy

`semantic_authoring_policy_v1`のattemptごとのhard上限:

| 上限 | 値 |
| --- | ---: |
| 同時provider request | 1 |
| LLM call | 8 |
| 計数対象の制御・Tool step | 48 |
| attempt経過時間 | 240秒 |
| 1 provider call経過時間 | 60秒 |
| 1 call入力 | 6,000 tokenかつ24 KiB |
| 1 call出力 | 1,500 tokenかつ6 KiB |
| 累積入力 | 32,000 token |
| 累積出力 | 8,000 token |
| 累積推定費用 | 500,000 micro-USD（USD 0.50） |
| 進捗履歴 | 8観測 |
| 回復strategy変更 | 2 |

最初に枯渇したdimensionで新規作業を停止する。型付きpolicyはtoken/byteを非負整数、
時間を整数millisecond、費用を`maxCostMicroUsd: 500_000`で持ち、浮動小数currencyを
使わない。immutableなprovider pricing identityとtoken estimator identityを束縛する。
provider実行にはそのidentityと上限を強制できる認可済みrouteが別途必要。provider tokenizerが
ない場合、UTF-8 byte数を1 byteあたり1 tokenという保守的上界に使う。token/cost不明は
全予約を保持し、final receiptなしのcancelでは返却しない。

新routeのcall上限8は現行6より大きい。本設計が別途受理され、後続実装/cutoverが
`semantic_authoring_policy_v1`を選択した場合だけ有効。現行実行は6のまま。

work選択、model query、proposal/review提出、proposal staging、意味lens実行、
回復strategy遷移を各1 stepと数える。内部schema checkは個別stepにしないが時間を消費する。
discovery/Tool公開はwork選択stepに含み、反復discoveryは再加算する。

### 7.2 予約

call schedule前に最大入力・出力・費用・時間を予約し、全残上限に収まる場合だけ受付する。
trusted receiptだけで精算し、欠落・遅延・曖昧receiptは全額使用扱いを保つ。予約・確定使用量は
単調増加とする。

### 7.3 進捗・循環検出

Adapter観測はphase、resolved required obligation数、covered material claim数、未解決
material finding key、normalized relevant-state digest、active semantic-cluster keyを持つ。

新しいrequired obligation解決、material claim網羅、同等findingへの置換なしのfinding除去、
Adapterが認める関連state変更の少なくとも1つをmaterial progressとする。新文章、finding反復、
query、phase変更だけは進捗ではない。

4連続計数stepでmaterial progressなしなら、そのfinding/clusterで未使用の情報増加型回復へ
1回変更する。その後3 stepで進捗がなければ`stalled_without_progress`で失敗する。

最後の6観測で同じstate digestが進捗なしに3回出現すれば反復循環、最後の4観測が
`A,B,A,B`なら交互循環とする。検出時は回復strategy変更を1回消費し、その変更後に
再発、または2変更超過で`repeated_state_cycle`失敗とする。

phase変更でnormalization関数を変えられるが、資源counter、finding history、未解決cluster
出現をresetしない。Adapterが正確なobligation依存を示し、次の3観測でnet progressへ戻す
一時後退は合法。それ以外は通常stall windowへ数える。

## 8. 永続化とexecution fence

### 8.1 Durable record

共通append-oriented recordを追加する。

- `semantic_authoring_runs`: run/frozen source/adapter/policy/expected pointer、
  internal outcome、累積計数、failure receipt、owner/fence/run version/timestamp
- `semantic_authoring_provider_requests`: request/run/ordinal/予約/digest/provider/model/
  outcome/final accounting
- `semantic_authoring_questions`: question、5条件証拠、再開recipe、状態
- `semantic_authoring_answers`: append-only scoped answerとowner
- `semantic_authoring_final_candidates`: candidate identity/digest、family所有payload参照、
  validation/reconciliation receipt、expected pointer

frozen natural sourceと必須provider/failure receiptは永続化する。途中candidate、work item、
capability session、progress history、checkpointは永続化しない。

### 8.2 内部状態機械

durable run stateは
`pending | claimed | ready_for_review | needs_owner_answer | failed | cancelled | expired`。
後ろ5つはそのrunのterminal。cancel/expiryは既存公開`discarded`/`expired`へ対応し、
意味questionを創作しない。owner answer/retryは新run/attempt IDと`predecessorRunId`を
持つ新`pending`を作り、旧terminal rowをpendingへ戻さない。

### 8.3 Fence rule

claimは`ownerId`、単調増加`fencingToken`、`runVersion`を返す。全mutationは3つを
compare条件にしてrunVersionを増やす。provider予約はtransport前に保存する。provider完了は
同じfenceがnonterminal runを所有しrequestがoutstandingの場合だけ適用する。

claim後のprocess/lease喪失では、recovery ownerが旧tokenをfenceし、outstanding予約を
unknown消費として記録し、`process_or_lease_lost`証拠をappendし、runをfailedへ移す。
遅延responseは適用拒否し、安全に記録可能ならtransport receiptだけ保持する。

claim前のdelivery failureだけ再queueできる。read routeはclaim/recovery/retry/provider呼出を
しない。owner retry/answer commandは新runとoutboxを同transactionで作り、同じcommand
identityの反復は同じrunをreplayする。

### 8.4 Family persistence

共通persistence Portはrun、accounting、question、fenceを所有する。Adapterのfamily Portは
frozen source取得とfinal candidate保存を所有する。activationは既存family別append/CASで、
kernel operationではない。したがってkernelはcurrent pointerを動かせない。

## 9. 公開retry・Q&A mapping

互換phaseでは`AssetAuthoringAttemptStatusSchema`へ値を追加しない。review responseに
optional `ownerInteraction`を追加する。

```ts
type OwnerInteractionV1 = {
  kind: "semantic_question";
  questionId: string;
  prompt: string;
  relevantSource: readonly ReviewSegmentV1[];
  relevantCandidate: readonly ReviewSegmentV1[];
  unsafeReason: string;
  choices: readonly { id: string; effect: string }[];
  freeFormAllowed: true;
  resumes: string;
};
```

公開schemaはstrict。`questionId`と`commandId`は1〜160文字、`prompt`は1〜800文字、
`unsafeReason`と`resumes`は1〜400文字。`ReviewSegmentV1`は正確に
`{ claimId, label, text }`で、claim IDは1〜160文字、labelは1〜120文字、textは
1〜1,200文字。relevant segmentの各arrayは1〜8件で、合計UTF-8 encodingは12 KiB以下。
`choices`は2〜6件で、各要素は正確に`{ id, effect }`。IDは一意な1〜80文字、effectは
1〜400文字。

answer bodyは次のstrict discriminated union。

```ts
type OwnerAnswerCommandV1 =
  | { questionId: string; commandId: string; answerKind: "choice"; choiceId: string }
  | { questionId: string; commandId: string; answerKind: "free-form"; freeForm: string };
type OwnerRetryCommandV1 = { commandId: string };
```

`choiceId`は1〜80文字で提示済みchoiceを指す。`freeForm`は1〜1,200文字。discriminantにより
両形式の同時送信を禁止する。pathの`attemptId`は既存`AssetAuthoringAcceptedSchema`の
1〜80文字上限を維持する。成功responseは既存strict DTOを使い、その既存`attemptId`が
新attemptを示す。追加するのは同じ80文字上限の`{ predecessorAttemptId }`だけ。
validation失敗は既存error envelopeを返し、writeしない。

| 内部結果 | 既存公開status | 追加投影 |
| --- | --- | --- |
| `ready_for_review` | `awaiting_owner_acceptance` | 正確な候補・receipt |
| `needs_owner_answer` | `failed` | `AUTHORING_OWNER_ANSWER_REQUIRED`と`ownerInteraction` |
| `failed` | `failed` | 技術/意味failure code、創作questionなし |

Q&A mappingは旧clientに対して意図的にlossyで、無限pollせずfailureを表示する。新clientは
`ownerInteraction`を優先して質問を表示しretry buttonを出さない。内部failureとquestion
recordは混同しない。

owner認証command endpointを追加する。保護されたsource/candidate断片を含みうるため、
対応するreview projectionもowner-onlyとする。

- `POST /api/authoring/attempts/:attemptId/answers`: `OwnerAnswerCommandV1`
- `POST /api/authoring/attempts/:attemptId/retries`: `OwnerRetryCommandV1`

answerは正確なopen questionと非emptyなchoice/free-formの一方を必要とする。
`needs_owner_answer`へのretry、通常failureへのanswerをrejectする。両endpointは既存
authoring-accepted shapeに新attempt IDを加えて返す。candidate acceptanceは別commandの
ままで、question-bearing attemptをrejectする。

`commandId`はowner commandごとに一意で、owner、predecessor attempt、questionがあれば
そのidentity、正規化したanswerまたはretry operation、request digestを束縛する。同一replayは
同じ新attemptを返し、異なるdigestでの再利用はrun/outbox作成前にrejectする。

## 10. Adapter適合

同じblack-box kernel suiteを3 Adapterへ実行する。

- character: create/revise/migrate、5 cluster、restricted capsule、compiler/disclosure finalization
- battlefield preset: sparse create、topology依存revision、legacy migration、deterministic compiler
- narration style: sparse create、phase依存revision、legacy migration、prompt compiler/disclosure

初期sliceの戦場・ナレーションAdapterはscripted/test-onlyでよいが、実domain schema/compilerを
使い、kernel testはfamily分岐しない。これはprocess再利用を示すがrouteを有効化しない。

基盤15 conformance caseすべてを対象にし、valid work保持repair、protected Q&A、source retry、
累積上限、文章だけの無進捗、反復/A-B循環、一時後退、invalid proposal rollback、
trusted-state破損、timeout、late result、capsule除外、activation不変を含める。

## 11. 実装sliceとgate

1. **契約・pure kernel**: shared型、state machine、proposal transaction、accounting、
   progress monitor、scripted Port。DB/routeなし。
2. **durable Port**: schema migration、repository codec、fenced claim/reservation/terminal write、
   process-loss/replay test。
3. **Character Adapter**: V3/capsule再利用、部分cluster/lens、final reconciliation、
   全character provider requestなし。
4. **公開mapping・conformance**: additive Q&A/retry DTO/command、3 Adapter fixture、cutoverなし。
5. **integration review**: ADR/要件trace、全test/typecheck/build/duplication/Lizard、
   targeted ADR check、Seal impact/stale/fsck。

各sliceでfocused review・証拠を要求する。5つ合格後だけ実route接続を後続判断として提案できる。
provider評価はcontrolled Port安定後の別承認とする。

## 12. 代案と判断点

- 汎用JSON Patchは小さいがpath filterへdomain safetyを移しuntyped payloadを許す。
  schema実装量が増えてもAdapter-owned proposal unionを選ぶ。
- 同run Q&A再開はmemory再利用できるがcheckpoint/長期leaseが必要。再計算があっても
  immutable auditが単純な新runを選ぶ。
- 新public statusは明確だが既存enumのexhaustive clientを壊す。additive interactionを選び、
  旧clientはfailure、新clientはQ&A回復とする。
- 6 callは現行上限維持だがskeleton、cluster、review、repairに窮屈。callを大型化せず、
  小contextと累積token/cost上限を組み合わせた8 callを選ぶ。
- generic candidate JSON保存は容易だが型付きfamily validationを弱める。共通lifecycle
  metadataとfamily-owned typed final storageを選ぶ。

## 13. リスク、未知、レビュー論点

- USD 0.50・8 callは設計候補でprovider品質証拠ではない。初期新routeのhard上限として妥当か。
- owner Q&Aをlegacy公開`failed`へ写すのは互換的だが旧clientには不正確。versioned statusより
  additive互換を優先するか。
- 回答後に常に新attemptを作ると費用を再消費しうる。checkpointより単純なsource-based
  auditを優先するか。
- 4-step stallと`A,B,A,B`はAdapterによって強すぎる可能性があり、一時後退fixtureが必要。
- test-only戦場/ナレーションAdapterはkernel中立性だけを示し、runtime readinessを示さない。
- 正確なDB migration DDLとfrontend layoutは実装sliceで本設計に従って決め、本設計を再定義しない。

## 14. 受理境界

Owner acceptanceは独立review後のこのexact revisionを指定する必要がある。Acceptance後も、
local実装slice 1〜5の実行にはownerの別の実装指示が必要。本設計はprovider call、route cutover、
deployment、本番read/write、asset acceptance、pointer/policy activation、rollback、releaseを
認可しない。

## 15. 自己レビュー証拠

ADR-0031 D11の各前提を本候補へtraceした。

| D11対象 | 候補section |
| --- | --- |
| 正確なtyped DTO・focused patch schema | 3、4、5、9 |
| execution-policy数値 | 7.1、7.2 |
| detector・window rule | 7.3 |
| 公開retry・Q&A mapping | 9 |
| persistence・fence変更 | 8 |
| 3 Adapter適合 | 10 |

現行sourceとのread-only比較で、既存6-request定数、operation catalogが使うV3 character schema
member、既存公開attempt-status literal、公開attempt IDの80文字上限を確認した。自己reviewでは、
共通envelope上限の欠落、過大なwhole-cluster置換、server所有mechanicsのmodel公開、非互換な公開
ID/response形状という4つの重要な曖昧さを訂正してから独立review待ちとした。revision 2では、
訂正版reviewの実質的指摘2件も訂正した。skeleton checkpointは必要なfocused cross-cluster claimを
含み、portrait bindingはserver所有とした。Exact DTO詳細、process-loss takeover詳細、15 caseの
trace matrix、公開Q&A field projection全体は、このrevisionの理由ではなく、追跡対象の後続完了条件
として維持する。最終edit後に`git diff --check`とcommand-line LLMThink auditを再実行する。
数値上限、legacy failureへのadditive projection、Q&Aのnew-attempt回復、detector thresholdは
self-approvalせず、明示的なowner判断点として残す。
