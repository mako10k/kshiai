# 部分構造化意味作成基盤 — 受理済み実装設計v1 revision 6 全文日本語訳

- 状態: 受理済み
- 日付: 2026-09-15
- 根拠: ADR-0031の影響を受けない判断を取り込んだ受理済みADR-0032 revision 1、
  基盤要件v3、キャラクタ作成要件v5、受理済みADR-0033 revision 1
- PERT系譜: 完了済み設計task `cb215`。revision 6は現在の受理済み設計snapshot
- 範囲: ADR-0032で修正されたADR-0031 D11の実装前の正確な契約
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

### 7.1 初期新route累積資源policy

`semantic_authoring_policy_v1`のattemptごとの時間以外のhard上限:

| 上限 | 値 |
| --- | ---: |
| 同時provider request | 1 |
| LLM call | 8 |
| 計数対象の制御・Tool step | 48 |
| 1 call入力 | 6,000 tokenかつ24 KiB |
| 1 call出力 | 1,500 tokenかつ6 KiB |
| 累積入力 | 32,000 token |
| 累積出力 | 8,000 token |
| 累積推定費用 | 500,000 micro-USD（USD 0.50） |
| 進捗履歴 | 8観測 |
| 回復strategy変更 | 2 |

これらの累積資源dimensionはhard上限であり、枯渇時は新規作業を停止して対応する
bounded-resource outcomeを返す。型付きpolicyはtoken/byteを非負整数、費用を
`maxCostMicroUsd: 500_000`で持ち、浮動小数currencyを使わない。immutableなprovider
pricing identityとtoken estimator identityを束縛する。provider実行にはそのidentityと上限を
強制できる認可済みrouteが別途必要。provider tokenizerがない場合、UTF-8 byte数を
1 byteあたり1 tokenという保守的上界に使う。token/cost不明は全予約を保持し、final receipt
なしのcancelでは返却しない。

時間はattempt累積budgetのdimensionにしない。次の独立した設定契約が、制御対象となる
failure modeとplatformへ時間を束縛する。

```ts
type ProviderTransportConfigV1 = Readonly<{
  routeIdentity: string;
  timeoutMs: number;
  maxRecoveriesPerWorkItem: 0 | 1;
}>;

type WorkerExecutionConfigV1 = Readonly<{
  platformIdentity: string;
  leaseDurationMs: number;
}>;
```

millisecond fieldは正のsafe integerとする。設計defaultを持たない。選択したobjectは一つのlive実行中は
immutableだが、そのConfig世代またはsnapshotはdurable run identityに含めない。
正確な値とtransport Configが0回または1回の回復を許すかは、route、platform、代表latency測定、
ownerが許容する待ち時間budget、exact policy revisionが受理されるまで未決とする。provider
transport Configをworker leaseへ流用してはならず、どちらもattempt全体の意味的deadlineを
作ってはならない。

durableな正しさは、これらのConfig値のreplayに依存しない。repositoryはrequest identityとlifecycle、
reservationとreceipt、単調なaccounting、execution fence、technical outcome、source-based resumption
recipeを永続化する。liveな同一run transport recoveryは選択済みimmutable Configを使う。processまたは
worker lease喪失は現在runをfailedにし、ownerの明示retryがその時点のConfigで新runを作る。
route、platform、timeout、leaseはboundedな運用telemetryへ記録できるが、共通Config registry、
snapshot、revision IDを必須にしない。

新routeのcall上限8は現行6より大きい。本設計が別途受理され、後続実装/cutoverが
`semantic_authoring_policy_v1`を選択した場合だけ有効。現行実行は6のまま。

work選択、model query、proposal/review提出、proposal staging、意味lens実行、
回復strategy遷移を各1 stepと数える。内部schema checkは個別stepにしない。
discovery/Tool公開はwork選択stepに含み、反復discoveryは再加算する。

### 7.2 予約と時間境界outcome

call schedule前に最大入力・出力・費用を予約し、残るすべての累積資源上限に収まる場合だけ
受付する。trusted receiptだけで精算し、欠落・遅延・曖昧receiptは全額使用扱いを保つ。
call count、予約、確定使用量はtransport timeout、worker expiry、cancel、recoveryをまたいで
単調増加とする。

provider timeoutは型付き`provider_transport_timeout` transport receiptを作る。現在の
`ownerId`、`fencingToken`、`runVersion`の下で、1回のcompare-and-setによりrequestを
`outstanding`からterminalの`timed_out`へ移し、call countを消費し、token/costが不明なら
予約最大値を保持する。そのrequestの後着completionは、安全に記録可能なtransport receiptを
追加できるが、proposal適用その他のcandidate mutationはできない。timeoutそれ自体は意味的
無効性を作らず、attempt全体のdeadlineにもならない。

同じwork itemへの別provider callは、この終端化後かつworker fenceが現行の間に限りschedule
できる。追加の有償作業を予約する前にtransport recovery適格性を判定する。適格であるには、固定
transport policyがまだ消費されていない1回のrecoveryを許し、serverが正確に1つの真実な
`recoveryBasis`として`{ kind: "transport_condition_changed"; evidenceRef: string }`または
`{ kind: "materially_different_request"; priorRequestDigest: string; requestDigest: string }`を持つ。
前者は保持されたtrusted transport証拠から、後者は認可済みrequest digestからserverが導出する。
modelの主張ではどちらの根拠も成立しない。これにより、曖昧完了requestのblind replayではなく
情報増加型recoveryであることを記録する。

現行fence下の遷移順序は規範的に次の通りとする。

1. recovery 0のpolicy、recovery消費済み、または真実な`recoveryBasis`なしの場合、runを型付きの
   回復可能な`provider_transport_unavailable`技術outcomeを持つ`failed`へ移す。理由はそれぞれ
   `policy_disallows_recovery`、`transport_recovery_consumed`、
   `no_admissible_recovery_basis`とする。
2. それ以外では新callとrecovery strategy遷移の累積資源admissionを試みる。admission失敗は、
   対応する`resource_exhausted`有限資源outcomeを持つ`failed`へ移す。そのreceiptは枯渇した
   累積dimensionをすべて特定し、消費済み・保持予約accountingを示す。provider unavailableへ
   読み替えない。
3. admission成功時だけstrategy changeを1回消費し、timeout済みrequestを指す
   `recoveryOfRequestId`と確立済み`recoveryBasis`を持つ別request identityを作る。

両failure分岐ともsource timeout receiptと単調accountingを保持し、owner起動の新run再開recipeを
提供する。どちらも意味failureを主張せず、自動でresetまたは別attemptを開始しない。timeout
handlerが現行fenceの所有権を既に失っている場合、request、run、candidateのいずれにも書き込まず、
現在のrecovery ownerがsection 8.3のprocess/lease loss遷移を適用する。

worker lease expiryは新規dispatchを止める。recovery ownerは期限切れworkerをfenceし、遅延結果の
適用を拒否し、安全に記録可能なtransport receiptを保持し、型付きの回復可能な技術outcomeを
記録する。candidateやreasoningを意味的に不正としない。claim済みrunのexpiry後の回復は、
section 8に従って新runを作るowner retryである。claim前のdelivery failureだけは代わりに
requeueできる。expiryでaccountingをresetしない。

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
compare条件にしてrunVersionを増やす。provider request状態は
`reserved | outstanding | completed | timed_out | cancelled`に閉じる。`reserved`だけが
`outstanding`または`cancelled`へ遷移でき、`outstanding`は`completed`、`timed_out`、`cancelled`
のいずれかへ遷移できる。後ろ3つはterminalである。
provider予約はtransport前に保存する。provider完了は同じfenceがnonterminal runを所有し、
requestが`outstanding`の場合だけ適用する。同一run内transport recoveryは常に新しいrequest
identityを持ち、terminal request identityを再openまたは再利用しない。

claim後のprocess/worker lease喪失では、recovery ownerが旧tokenをfenceし、outstanding予約を
unknown消費として記録し、`process_or_lease_lost`証拠をappendする。runは意味failureを主張しない
回復可能な技術outcomeと再開recipeを持つfailedへ移す。遅延responseは適用拒否し、安全に
記録可能ならtransport receiptだけ保持する。

claim前のdelivery failureだけ再queueできる。read routeはclaim/recovery/retry/provider呼出を
しない。owner retry/answer commandは新runとoutboxを同transactionで作り、同じcommand
identityの反復は同じrunをreplayする。

### 8.4 Family persistence

共通persistence Portはrun、accounting、question、fenceを所有する。provider transportまたは
worker execution Configのrevision・snapshotは所有しない。Adapterのfamily Portは
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

基盤15 conformance categoryを維持し、valid work保持repair、protected Q&A、source retry、
累積上限、文章だけの無進捗、反復/A-B循環、一時後退、invalid proposal rollback、
trusted-state破損、時間境界・late result、capsule除外、activation不変を対象にする。従来の
generic timeout coverageは、provider transport timeoutで回復許可0回と1回、消費済みrecovery、
真実なrecovery basisなし、累積資源admission失敗、fence所有権喪失、worker lease expiry、
元requestからのlate resultを扱う1つのparameterized時間境界fixtureへ置き換える。別identityの
代替requestをadmitする前にtimeout済みrequestがterminalになること、元requestのlate resultが
candidateを変更できないこと、0回/消費済み/根拠なし経路が`provider_transport_unavailable`へ、
それ以外は適格だが資源admission失敗の経路が正確な枯渇dimension・accountingを伴う
`resource_exhausted`へ到達すること、両者がsource timeout receiptを保持すること、意味的無効へ
読み替えないこと、blind replayをscheduleしないこと、attempt全体のelapsed deadlineが存在しない
ことを証明する。

## 11. 実装sliceとgate

1. **契約・pure kernel**: shared型、state machine、proposal transaction、accounting、
   progress monitor、scripted Port。DB/routeなし。
2. **durable Port**: schema migration、repository codec、fenced claim/reservation/terminal write、
   process-loss/replay test。
3. **Character Adapter**: V3/capsule再利用、部分cluster/lens、final reconciliation、
   全character provider requestなし。
4. **公開mapping・conformance**: additive Q&A/retry DTO/command、3 Adapter fixture、cutoverなし。
5. **integration review**: ADR-0032、維持されたADR-0031判断、受理済み要件をtraceし、
   全test/typecheck/build/duplication/Lizard、targeted ADR check、Seal impact/stale/fsck。

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

- 受理済みADR-0033と本revisionはtransport/worker Config世代IDをdurable run identityから外す。
- 正確なprovider timeout、worker lease、有限transport recovery値は、ADR-0032の証拠・受理条件を
  満たすまで未決である。
- owner Q&Aをlegacy公開`failed`へ写すのは互換的だが旧clientには不正確。versioned statusより
  additive互換を優先するか。
- 回答後に常に新attemptを作ると費用を再消費しうる。checkpointより単純なsource-based
  auditを優先するか。
- 4-step stallと`A,B,A,B`はAdapterによって強すぎる可能性があり、一時後退fixtureが必要。
- test-only戦場/ナレーションAdapterはkernel中立性だけを示し、runtime readinessを示さない。
- 正確なDB migration DDLとfrontend layoutは実装sliceで本設計に従って決め、本設計を再定義しない。

## 14. 受理境界

正確な受理前revisionの正式reviewはP0〜P3指摘なしでPASSした。2026-09-15、その結果と完全な
日本語review範囲の提示後、製品オーナーは`ACCEPT`と回答した。review済み受理前SHA-256は
`a0f2ba909d3c71fb7de2235bd84125b420663f6f8b5400c4236eaf92e832ebff`である。

Acceptanceだけではlocal実装を認可しない。本設計はprovider call、route cutover、deployment、
本番read/write、asset acceptance、pointer/policy activation、rollback、release、commit、pushを
認可しない。

## 15. 自己レビュー証拠

維持されたADR-0031 D11の各前提とADR-0032訂正を本候補へtraceした。

| D11対象 | 候補section |
| --- | --- |
| 正確なtyped DTO・focused patch schema | 3、4、5、9 |
| 累積execution-policy数値 | 7.1、7.2 |
| 分離したprovider・worker時間境界 | 7.1、7.2、8.2 |
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
trace matrix、公開Q&A field projection全体はrevision 2の理由ではなく、追跡対象の後続完了条件
として維持する。revision 3では未裏付けのattempt全体240秒deadlineとprovider 60秒literalを削除し、
provider transportとworker leaseのpolicy identityを分離し、単調な資源accountingを維持し、
ADR-0032に従って技術expiryと意味failureを区別した。revision 4ではrevision 3 review指摘を訂正し、
provider request lifecycleを閉じ、同一run内でadmitしたrecoveryに新identityを割り当て、元requestの
late result適用を拒否し、recoveryをadmitできない場合の回復可能な技術failureを定義し、fence喪失時の
回復を現在のrecovery ownerへ委ねた。revision 5ではrevision 4 review指摘2件を訂正し、
eligibility-before-admissionの優先順序を定義し、真実なrecovery basisがない場合をtransport recovery
exhaustionとし、それ以外は適格なcallの累積資源admissionが失敗した場合は`resource_exhausted`を
維持した。最終edit後に`git diff --check`とcommand-line LLMThink auditを
再実行する。正確なtime-policy値とrecovery 0/1のどちらを選ぶかは後続のexact owner acceptanceを
必要とする。legacy failureへのadditive projection、Q&Aのnew-attempt
回復、detector thresholdはself-approvalせず、明示的なowner判断点として残す。
revision 6は、provider transportとworker executionの値をdurable run identityではなくruntime Config
として扱うというオーナーの緩和指示を反映する。fence、provider request state、receipt、accounting、
technical outcome、source-based新run retryは維持する。正確なrevision 6 reviewはP0〜P3指摘なしで
PASSし、オーナーは2026-09-15にADR-0033とともに受理した。revision 5を置き換えるのは現在の
受理済み設計snapshotとしてだけである。
