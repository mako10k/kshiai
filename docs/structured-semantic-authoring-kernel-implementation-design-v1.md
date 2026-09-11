# Focused structured semantic authoring kernel — implementation design candidate v1, revision 2

- Status: Revised design candidate; corrected review findings addressed; fresh review pending
- Date: 2026-09-11
- Authority: accepted ADR-0031 revision 1, accepted foundation requirement v3,
  and accepted character authoring requirement v5
- PERT task: `cb215`
- Scope: exact pre-implementation contracts required by ADR-0031 D11
- Excludes: implementation, provider calls, evaluation, deployment, production
  migration, candidate acceptance, pointer or policy activation, rollback, release

## 1. Outcome and compatibility boundary

Implement one thin orchestration kernel for `create`, `revise`, and `migrate`.
The kernel schedules focused work, applies adapter-owned proposals transactionally,
accounts for evidence and finite resources, detects stalls and cycles, and returns a
typed terminal outcome. It never owns character, battlefield, narration-style, or
battle-runtime meaning.

The first runtime consumer will be V3 character authoring. Battlefield and narration
style initially provide conformance adapters and fixtures only. Existing public APIs,
immutable generation IDs, authoring attempt IDs, pointer behavior, battle bindings,
and current authoring routes remain unchanged until a later implementation and
cutover gate.

Existing B3-B5 code is input to implementation, not proof of this design:

- qualified V3 character, compiler, capability, capsule, attempt, request, and receipt
  contracts may be adapted;
- the current whole-candidate LLM review loop is not the new kernel;
- `CHARACTER_MIGRATION_PROVIDER_REQUEST_LIMIT = 6` remains the current-route ceiling;
- existing family queues and fencing are reused through ports, not imported into the
  kernel as character-specific state.

## 2. Module and dependency boundary

New common code is placed under:

- `packages/shared/src/semantic-authoring.ts`: internal typed contracts and closed
  vocabularies that cross backend module boundaries;
- `backend/src/services/semantic-authoring/kernel.ts`: pure orchestration state
  transitions;
- `backend/src/services/semantic-authoring/capability-session.ts`: Skill descriptor
  resolution and request-scoped Tool exposure;
- `backend/src/services/semantic-authoring/progress-monitor.ts`: bounded mechanical
  progress and cycle detection;
- `backend/src/services/semantic-authoring/ports.ts`: provider, clock/accounting,
  and owner-fenced persistence interfaces;
- `backend/src/services/semantic-authoring/adapters/character-v3.ts`: first advanced
  domain adapter;
- test-only battlefield and narration adapters under the same adapter test directory.

The common kernel may import only common semantic-authoring contracts. It must not
import character, battlefield, narration-style, battle-service, or route modules.
Adapters may import their domain schemas and compilers. Routes and workers call an
application service, never the kernel directly.

## 3. Typed internal contracts

### 3.1 Run identity and policy

`SemanticAuthoringRunV1` is internal and is not an asset schema version:

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

All values are parsed once at an HTTP, database, or provider boundary. Internal calls
pass TypeScript values. JSON-string round trips, `as unknown as`, and unchecked
casts are forbidden. Database JSON columns are parsed from `string | object` only in
repository codecs because drivers may return either representation; already typed
values are not stringified and reparsed.

### 3.2 Kernel state

`SemanticAuthoringStateV1<C, O, F>` contains:

- immutable run and frozen policy;
- current in-memory candidate `C`;
- obligation ledger `ReadonlyMap<string, O>`;
- deduplicated findings `ReadonlyMap<string, F>`;
- provenance and source-disposition ledgers;
- cumulative resource accounting and outstanding reservations;
- current phase and bounded progress history;
- active work item, capability session, and at most one outstanding provider request;
- zero or one terminal result.

The state is private to one claimed process. It is not serialized as a checkpoint.
Only the persistence records in section 8 are durable.

### 3.3 Adapter contract

```ts
interface SemanticAuthoringAdapterV1<
  Source,
  Candidate,
  Obligation,
  WorkItem,
  Proposal,
  Finding,
  Question,
  Answer,
  FinalCandidate
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

`unknown` appears only on the two decoder inputs. The kernel never introspects an
adapter's candidate or proposal and never edits a field path. The adapter returns new
immutable values or a rejected result; it cannot persist or call a provider.

### 3.4 Common result types

Closed internal result kinds are:

- `ready_for_review`: exact final candidate and validation receipt;
- `needs_owner_answer`: exact durable question candidate and resumption recipe;
- `failed`: technical or bounded semantic failure receipt.

These are internal discriminants, not public attempt-status strings. Every result
includes run/attempt/source/policy/adapter identities and cumulative accounting.
`ready_for_review` additionally binds final candidate digest, obligation coverage,
reconciliation receipt, compiler/disclosure receipts, and expected pointer.
Owner cancellation and expiry are control terminal states, not resolver results and
are not relabeled as semantic or technical failure.

## 4. Focused work, Skill, and Tool contract

### 4.1 Skill descriptor

A versioned server-owned `SemanticAuthoringSkillV1` contains only:

- objective and phase;
- legal capability roles;
- how to request the current capability;
- resource and disclosure reminders;
- no domain schema, complete candidate, exhaustive paths, or accumulated transcript.

The descriptor resolves through an allow-listed registry. A model cannot name an
arbitrary handler or schema identity.

### 4.2 Request-scoped capability session

One work item exposes at most two model-visible tools at a time:

1. `authoring_query_context_v1`: read-only query over exact adapter-approved selectors;
2. one of `authoring_propose_change_v1` or
   `authoring_submit_review_v1`: returns a proposal only.

The server may run deterministic validators without exposing them as tools. There is
no query-all, list-all-paths, raw SQL, whole-candidate, or whole-schema capability.
A session binds run ID, work-item ID, allowed selectors, proposal schema identity,
write closure, expiry, and invocation counts. It is revoked after proposal, review,
work-item replacement, expiry, or terminal result.

The query input is the strict object `{ runId, workItemId, capabilitySessionId,
selector, claimIds }`. IDs use the common 160-character bound; `claimIds` contains
0 through 8 unique IDs. For the character adapter, `selector` is exactly
`source-claims`, `candidate-claims`, `obligations`, `findings`,
`mechanical-capabilities`, or `preservation-claims`; the last selector is registered
only for migrate work. The response is `{ selector, segments }`, where `segments`
contains 1 through 8 strict `{ segmentId, claimId, role, text, referenceIds }`
objects. `role` is `source`, `candidate`, `obligation`, `finding`, `mechanic`, or
`preservation`; text is 1 through 1,200 characters and reference IDs are 0 through
8 unique common IDs. The server constructs these bounded textual projections from
typed state; they are not model-authored authority or raw schema fragments.

The query tool permits at most 4 calls per work item and returns at most 12 KiB or
3,000 model tokens cumulatively for that work item. The proposal/review tool input is
the exact envelope in section 4.3 and permits at most 3 invocations, only one of
which may succeed, with an encoded bound of 6 KiB or 1,500 model tokens. A rejected
submission returns at most 8 strict `{ code, operationIndex, message,
affectedClaimIds }` issues; code is adapter-registered, index is a nullable integer
0 through 7, message is 1 through 400 characters, and affected claims are 0 through
8 unique common IDs. This compact error becomes evidence for a focused corrected
proposal; it does not expose the whole candidate. All invocations and provider
continuations consume the attempt limits in section 7.

### 4.3 Proposal envelope

The common envelope is typed, while `payload` is adapter-specific:

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

The design deliberately does not use generic JSON Patch. Each adapter defines a
closed proposal union and exact payload schema. Paths or claim IDs are registered
identifiers, not arbitrary JSON Pointers supplied by the model. The adapter computes
the legal write closure and consequential dependent changes before staging.

The common wire schema is strict and uses these exact bounds:

| Member | Contract |
| --- | --- |
| `proposalId`, `runId`, `workItemId`, `capabilitySessionId` | non-empty string, at most 160 characters |
| `baseCandidateRevision` | integer, 0 through 2,147,483,647 |
| `proposalSchemaIdentity` | allow-listed literal selected by the capability session |
| each claim, obligation, or dependant ID | non-empty string, at most 160 characters |
| `sourceClaimIds` | 1 through 24 unique IDs |
| `affectedObligationIds` | 1 through 24 unique IDs |
| `declaredSemanticDependantIds` | 0 through 24 unique IDs |
| `provenance` | 1 through 24 strict `ProposalProvenanceV1` entries |
| `ownerExplanation` | non-empty string, at most 800 characters |
| `uncertainty` | 0 through 8 strict `ProposalUncertaintyV1` entries |

`ProposalProvenanceV1` is `{ targetClaimId, sourceClaimIds, method }`, where
`targetClaimId` and every source ID obey the 160-character bound, source IDs are
unique with 1 through 12 entries, and `method` is exactly `preserved`, `derived`,
`generated`, `reconciled`, or `owner-clarified`. `ProposalUncertaintyV1` is
`{ claimId, kind, explanation }`, where `kind` is exactly `missing-source`,
`ambiguous-source`, `generated-detail`, `semantic-tension`, or
`deferred-resolution`, and explanation is 1 through 400 characters. Unknown object
members fail decoding. The encoded proposal must also fit the 6 KiB output limit;
the stricter limit wins.

### 4.4 Transactional staging

Proposal handling is:

1. decode the external response into the exact adapter proposal type;
2. verify run, work item, session, schema, base revision, and resource reservation;
3. ask the adapter to stage candidate and ledgers in isolated memory;
4. run hard schema, reference, authority, disclosure, compiler, accounting, and
   trusted-state checks over the staged values;
5. atomically replace the in-memory state only when all checks pass;
6. otherwise retain trusted state and add one deduplicated finding.

A valid dependent correction outside the originally failing field is legal only when
it is inside the adapter-computed registered closure and is listed in the proposal.

## 5. Character adapter

The character adapter uses five semantic clusters:

1. identity, background, disposition, goals, and conscious guidance;
2. abilities, combat parameters, actions, action norms, and mechanical fallback;
3. relationships, self-awareness, speech policy, and counterpart effects;
4. appearance, public support, disclosure, and consumer projections;
5. cross-reference, provenance, source disposition, preservation, and authority.

For create and migrate, the semantic-skeleton phase is not synonymous with cluster 1.
It contains cluster 1 plus only the server-designated claim slices from clusters 2 and
3 that are required to establish essential abilities or limits and key relationships.
The adapter schedules focused pre-checkpoint work for those registered claim IDs. The
checkpoint passes only after identity, core goals, those essential ability/limit
claims, and those key-relationship claims exist and have passed their applicable hard
checks. Only then may the remaining dependent work in clusters 2-4 fan out. This does
not expose or regenerate either complete cluster before the checkpoint. Revise opens
the requested cluster and its registered dependants; unrelated protected claims remain
obligations. Cluster 5 is continuous server reconciliation and the final gate, not one
whole-character model request.

The adapter proposal union is:

- `set_skeleton`;
- `complete_cluster`;
- `repair_cluster`;
- `classify_source_disposition`;
- `propose_deferral`;
- `submit_lens_review`.

Candidate writes use small discriminated operations rather than a cluster-sized
replacement. Every `value` schema is referenced directly from
`CharacterDefinitionV3ObjectSchema.shape` (and the relevant array `.element`) so the
operation cannot drift from V3. The exact operation catalog is:

| Cluster | Operation literal | Target key | Exact value schema |
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

Every upsert carries exactly `{ op, value }`; the stable ID is `value.id`. Every
remove carries exactly `{ op, id }`. Every replace/set carries exactly `{ op,
value }`; for the two semantic setters, the server merges that value into the
preallocated record identified by `value.id` and leaves omitted mechanical members
unchanged. Objects are strict. `CharacterCandidateOperationV1` is the discriminated
union of the rows above. A candidate-changing proposal contains 1 through 8
operations with unique target keys, in declared order. Conflicting writes, an upsert
whose value ID disagrees with its target key, and remove of an absent ID fail
decoding/staging. The entire encoded proposal remains bounded by 6 KiB; if one legal
value cannot fit, the adapter must use deterministic derivation or the accepted
deferral/Q&A route rather than exposing more schema or truncating it.

The model-facing payload is the following closed union. Every object is strict:

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

`SourceDispositionDecisionV1` is exactly `{ sourceClaimId, disposition,
targetClaimIds, rationale }`: IDs use the common 160-character bound,
`targetClaimIds` has 0 through 12 unique entries, `rationale` has 1 through 400
characters, and disposition is `preserve`, `transform`, `split`, `merge`,
`supersede`, `discard-as-nonmaterial`, or `preserve-in-capsule`. A decision array has
1 through 24 entries and unique `sourceClaimId`. Deferral obligation IDs and review
finding IDs have 1 through 24 unique entries; deferral reason has 1 through 400
characters. `submit_lens_review` cannot alter the candidate; the server reruns the
named deterministic lens and treats the submitted verdict only as a model claim.

`CharacterSkeletonPhaseOperationV1` is the closed subset of cluster-1 operations plus
`set_action_semantics`, `set_inventory_semantics`, `upsert_action_norm`,
`upsert_mechanical_fallback`, and `upsert_relationship_seed`. A cross-cluster operation
is legal in `set_skeleton` only when its target key is in the server-registered
`skeletonRequiredClaimIds` for the current work item. The focused context and writable
schema contain no other cluster-2 or cluster-3 claim.

`set_skeleton` is legal only for the protected skeleton phase and accepts only that
closed phase union. A cluster variant is legal only when the session names the same
cluster and every operation belongs to it. A repair may change a schema-valid field
that was not the original error only when it is in
the adapter-computed registered closure and is named by
`declaredSemanticDependantIds`. Cluster 5 has no general candidate-write variant:
source disposition, deferral, and lens review update only their typed ledgers or
findings. Combat parameters, action mechanics, inventory mechanical effects,
causal envelopes, and loadout are not model-writable operations. Stable IDs and all
such mechanics are allocated or resolved by the server before model exposure and
then revalidated after staging.

Portrait binding is never part of the model-writable closure. Create retains the
server scaffold's null or pre-authorized binding; revise and migrate preserve the
exact frozen baseline binding. A separately authorized server portrait operation may
change it outside this proposal union. A provider response containing `set_portrait`
fails closed as an unknown operation and cannot select `mediaId` or `revisionId`.

Preservation capsule
values are available only to the migrate adapter while resolving migration work and
are never included in ordinary create/revise tools.

Existing `CharacterSemanticMigrationChangeSetV1` is bridged only where one of its
six operations can be decoded losslessly into a new adapter proposal. It is not
passed through as a generic value and its whole-candidate review type is not reused.

## 6. Reconciliation and owner Q&A

Findings use a stable deduplication key over code, inspected claim IDs, affected
obligation IDs, and normalized discrepancy. Repeating the same finding with different
prose does not create progress.

An owner question is legal only when the adapter provides evidence for all five
accepted conditions: explicit problem, material protected impact, materially
different credible outcomes, exhausted applicable automatic recovery, and no safe
choice/reconciliation/deferral. The kernel verifies the evidence references and
remaining budget but does not decide character meaning.

This design always resumes an owner answer through a new explicit attempt. It does
not preserve an in-memory checkpoint across the wait. The durable answer is appended
as scoped source clarification; the new attempt freezes that clarification, rechecks
source and pointer drift, and reconstructs focused work. This is simpler than a
long-lived suspended lease and complies with source-based retry.

## 7. Exact execution and progress policy

### 7.1 Initial new-route policy

`semantic_authoring_policy_v1` has these immutable per-attempt maxima:

| Limit | Value |
| --- | ---: |
| Concurrent provider requests | 1 |
| LLM calls | 8 |
| Counted orchestration/tool steps | 48 |
| Attempt elapsed time | 240 seconds |
| One provider call elapsed time | 60 seconds |
| Input per provider call | 6,000 tokens and 24 KiB |
| Output per provider call | 1,500 tokens and 6 KiB |
| Cumulative input | 32,000 tokens |
| Cumulative output | 8,000 tokens |
| Cumulative estimated cost | 500,000 micro-USD (USD 0.50) |
| Progress history | 8 observations |
| Recovery-strategy changes | 2 |

All dimensions are hard maxima; the first exhausted dimension stops new work.
The typed policy stores token and byte values as nonnegative integers, elapsed values
as integer milliseconds, and cost as `maxCostMicroUsd: 500_000`; it does not use a
floating-point currency field. It binds an immutable provider pricing identity and
token-estimator identity. Provider execution additionally requires an approved route
whose pricing/accounting can enforce that identity and cap. When a provider tokenizer
is unavailable, admission uses UTF-8 byte count as a conservative one-token-per-byte
upper bound. Unknown token or cost usage retains the full reservation.
Cancellation does not refund a reservation without a final provider receipt.

This policy raises the possible new-route call count above the current-route six-call
ceiling. It becomes effective only if this exact design is separately accepted and a
later implementation/cutover gate selects `semantic_authoring_policy_v1`.
Current execution remains capped at six.

A counted step is one work selection, model-visible query, proposal/review submission,
proposal staging, semantic lens execution, or recovery-strategy transition. Pure
inner schema checks are not separate steps, but consume elapsed time. Discovery and
Tool promotion count as the work-selection step; repeated discovery counts again.

### 7.2 Reservation

Before scheduling a call, reserve its configured maximum input, output, cost, and
elapsed allowance. Admission requires the reservation to fit every remaining attempt
limit. Settle only from a trusted receipt. An absent, late, or ambiguous receipt
remains fully charged. Reservations and settled usage are monotonic.

### 7.3 Progress and cycle detection

The adapter observation contains:

- phase;
- resolved required-obligation count;
- covered material-claim count;
- unresolved material finding keys;
- normalized relevant-state digest;
- active semantic-cluster key.

Material progress is at least one newly resolved required obligation, newly covered
material claim, removal of a material finding without replacement by its equivalent,
or an accepted relevant-state change identified by the adapter. New prose, repeated
findings, queries, or a phase change alone are not progress.

After 4 consecutive counted steps without material progress, the kernel must choose
one information-gaining recovery strategy not yet used for that finding/cluster.
If 3 further counted steps produce no progress, the attempt fails
`stalled_without_progress`.

A repeated-state cycle is detected when the same relevant-state digest appears
3 times in the last 6 observations without intervening material progress. An
alternating cycle is detected by `A,B,A,B` over the last 4 observations with no
material progress. Either detection consumes one recovery-strategy change. Repeating
the cycle after that change, or exceeding two strategy changes, fails
`repeated_state_cycle`.

Phase changes may replace the adapter's normalization function but cannot reset
resource counters, finding history, or occurrences of an unresolved cluster.
Temporary regression is legal when the adapter marks its exact obligation dependency
and the next 3 observations restore net progress; otherwise it contributes to the
normal stall window.

## 8. Persistence and execution fencing

### 8.1 Durable records

Add common append-oriented records:

- `semantic_authoring_runs`: run identity, frozen source identity and source payload
  reference, adapter/policy identities, expected pointer, internal outcome, cumulative
  accounting, failure receipt, owner ID, fence token, run version, timestamps;
- `semantic_authoring_provider_requests`: request identity, run, ordinal, reservation,
  request digest, provider/model route, outcome and final accounting;
- `semantic_authoring_questions`: exact question, five-condition evidence,
  resumption recipe, state;
- `semantic_authoring_answers`: append-only scoped answer and owner identity;
- `semantic_authoring_final_candidates`: final candidate identity/digest,
  family-owned payload reference, validation/reconciliation receipts and expected
  pointer.

Frozen natural source and required provider/failure receipts are durable. Intermediate
candidate values, work items, capability sessions, progress history, and checkpoints
are not durable.

### 8.2 Internal state machine

The durable run state is closed to:

`pending | claimed | ready_for_review | needs_owner_answer | failed | cancelled | expired`.

`ready_for_review`, `needs_owner_answer`, `failed`, `cancelled`, and `expired`
are terminal for that run. Cancel and expiry map to the existing public
`discarded` and `expired` statuses and never fabricate a semantic question.
An owner answer or retry creates a new `pending` run with a new run and attempt ID
and a `predecessorRunId`; it never changes the old terminal row back to pending.

### 8.3 Fence rules

Claiming a queued run returns `ownerId`, monotonic `fencingToken`, and
`runVersion`. Every mutation requires all three in its compare predicate and
increments `runVersion`. Provider reservations are recorded before transport.
Provider completion is accepted only while the same fence owns a nonterminal run and
the request is outstanding.

On process or lease loss after claim:

1. the recovery owner fences the old token;
2. records outstanding reservations as unknown consumption;
3. appends `process_or_lease_lost` failure evidence;
4. moves the run to `failed`;
5. rejects every late response for application while retaining its transport receipt
   when safely recordable.

Delivery failure before claim may requeue. No read route claims, recovers, retries, or
calls a provider. Owner retry and owner answer commands atomically create the new run
and outbox entry; repeated command identity replays the same new run.

### 8.4 Family persistence

The common persistence port owns run, accounting, question, and fence records.
The adapter's family port owns frozen source lookup and final candidate storage.
Activation remains the existing family-specific append/CAS transaction and is not a
kernel operation. The kernel therefore cannot move a current pointer.

## 9. Public retry and Q&A mapping

Do not add values to `AssetAuthoringAttemptStatusSchema` in the compatibility phase.
Add an optional `ownerInteraction` object to review responses:

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

The public schemas are strict. `questionId` and `commandId` are 1 through 160
characters. `prompt` is 1 through 800, `unsafeReason` and `resumes` are 1 through
400. Each `ReviewSegmentV1` is exactly `{ claimId, label, text }` with a
1-through-160-character claim ID, 1-through-120-character label, and
1-through-1,200-character text. Each relevant segment array has 1 through 8 entries
and their combined UTF-8 encoding is at most 12 KiB. `choices` has 2 through 6
entries, each exactly `{ id, effect }` with a unique 1-through-80-character ID and
1-through-400-character effect.

The answer body is a strict discriminated union:

```ts
type OwnerAnswerCommandV1 =
  | { questionId: string; commandId: string; answerKind: "choice"; choiceId: string }
  | { questionId: string; commandId: string; answerKind: "free-form"; freeForm: string };
type OwnerRetryCommandV1 = { commandId: string };
```

`choiceId` is 1 through 80 characters and must name a presented choice. `freeForm`
is 1 through 1,200 characters. The discriminant prevents sending both forms. Path
`attemptId` preserves the existing `AssetAuthoringAcceptedSchema` bound of 1 through
80 characters. The successful response is that existing strict DTO, whose existing
`attemptId` identifies the new attempt, extended only with
`{ predecessorAttemptId }` using the same 80-character bound. Validation failure
returns the existing error envelope and performs no write.

Mapping is:

| Internal result | Existing public status | Added projection |
| --- | --- | --- |
| `ready_for_review` | `awaiting_owner_acceptance` | exact review candidate/receipts |
| `needs_owner_answer` | `failed` | error `AUTHORING_OWNER_ANSWER_REQUIRED` plus `ownerInteraction` |
| `failed` | `failed` | technical/semantic failure code, no fabricated question |

The Q&A mapping is intentionally lossy for old clients: they stop polling and show a
failure instead of hanging. Updated clients prioritize `ownerInteraction` and render
the question, not a retry button. It does not conflate internal failure and question
records.

Add owner-authenticated command endpoints; the corresponding review projection is
owner-only because it may contain protected source and candidate fragments:

- `POST /api/authoring/attempts/:attemptId/answers` with
  `OwnerAnswerCommandV1`;
- `POST /api/authoring/attempts/:attemptId/retries` with
  `OwnerRetryCommandV1`.

An answer must reference the exact open question and one nonempty choice or free-form
answer. A retry is rejected for `needs_owner_answer`; an answer is rejected for an
ordinary failure. Both return the existing authoring-accepted shape plus the new
attempt ID. Acceptance of a candidate remains a different existing command and
rejects a question-bearing attempt.

`commandId` is unique per owner command and binds the owner, predecessor attempt,
question when present, normalized answer or retry operation, and request digest.
An exact replay returns the same new attempt. Reuse with a different digest is
rejected before creating a run or outbox entry.

## 10. Adapter conformance

The kernel test suite runs the same black-box contract against three adapters:

- character: create, revise, migrate, all five semantic clusters, restricted capsule,
  compiler and disclosure finalization;
- battlefield preset: sparse create, topology-dependent revision, legacy migration,
  deterministic compiler finalization;
- narration style: sparse create, phase-dependent revision, legacy migration,
  prompt compiler and disclosure finalization.

Battlefield and narration conformance adapters may be scripted/test-only in the first
slice. They must use real domain schemas and compilers, and the kernel test must not
branch on family. This demonstrates process reuse but does not activate those family
routes.

Required common fixtures cover all 15 foundation conformance cases, including:
focused repair retaining valid work, protected Q&A, source-based retry, cumulative
limits, cosmetic no-progress, repeated and alternating states, useful temporary
regression, invalid proposal rollback, trusted-state corruption, timeout, late result,
capsule exclusion, and unchanged activation behavior.

## 11. Implementation slices and gates

1. **Contracts and pure kernel:** shared types, state machine, proposal transaction,
   accounting, progress monitor, scripted ports. No database or routes.
2. **Durable ports:** schema migration, repository codecs, fenced claim/reservation/
   terminal writes, process-loss and replay tests.
3. **Character adapter:** bridge reusable V3/capsule contracts, focused clusters and
   lenses, final reconciliation, no whole-character provider request.
4. **Public mapping and conformance:** additive Q&A/retry DTOs and commands; three
   adapter conformance fixtures; no route cutover.
5. **Integration review:** trace ADR-0031 and accepted requirements; full tests,
   typecheck, build, duplication, Lizard, targeted ADR check, Seal impact/stale/fsck.

Each slice requires focused review and evidence. Only after all five pass may a later
decision propose wiring a real authoring route. Provider-backed evaluation remains a
separate approval after controlled-port behavior is stable.

## 12. Alternatives and decision points

### Generic JSON Patch versus adapter-owned proposal unions

Generic Patch is smaller but moves domain write safety into path filters and admits
untyped payloads. Adapter-owned unions cost more schema code but preserve TypeScript
types and domain closure. Select adapter-owned unions.

### Resume the same run after Q&A versus create a new run

Same-run resume can reuse memory but requires durable checkpoints or a long-lived
lease. New-run reconstruction repeats work but leaves a simple immutable audit trail.
Select a new run.

### New public status versus additive interaction

A new status is clearer but breaks clients that exhaustively decode the existing enum.
An additive interaction preserves decoding; old clients see a terminal failure while
new clients recover through Q&A. Select additive interaction.

### Six versus eight new-route calls

Six preserves the current ceiling but is tight for skeleton, multiple clusters,
focused review, and information-gaining repair. Eight raises worst-case cost by two
bounded calls but avoids encouraging oversized calls. Select eight with smaller
per-call context, cumulative token/cost caps, and separate cutover authority.

### Generic candidate persistence versus family-owned final payload

One generic JSON blob is easy to store but weakens typed family validation. Select
common lifecycle metadata plus family-owned typed final storage.

## 13. Risks, unknowns, and review questions

- USD 0.50 and 8 calls are design candidates, not provider-quality evidence. Are these
  acceptable hard maxima for the first new route?
- Mapping owner Q&A to legacy public `failed` is compatible but imprecise for old
  clients. Is additive compatibility preferred over a versioned new public status?
- Always creating a new attempt after an answer may repeat cost. Is the simpler
  source-based audit trail preferred over durable intermediate checkpoints?
- A 4-step stall window and `A,B,A,B` detector may be too aggressive for some
  adapters. The temporary-regression allowance reduces this risk but needs fixtures.
- Test-only battlefield/narration adapters demonstrate kernel neutrality, not runtime
  readiness for those families.
- Exact database migration DDL and frontend presentation layout belong to the
  implementation slice and must conform to, not redefine, this design.

## 14. Acceptance boundary

Owner acceptance must identify this exact revision after independent review. Acceptance
authorizes local implementation slices 1-5 only when the owner separately instructs
implementation. It does not authorize provider calls, route cutover, deployment,
production reads or writes, asset acceptance, pointer/policy activation, rollback, or
release.

## 15. Self-review evidence

The review traced every ADR-0031 D11 predecessor to this candidate:

| D11 subject | Candidate section |
| --- | --- |
| exact typed DTO and focused patch schemas | 3, 4, 5, 9 |
| execution-policy numbers | 7.1 and 7.2 |
| detector and window rules | 7.3 |
| public retry and Q&A mapping | 9 |
| persistence and fence changes | 8 |
| three-adapter conformance | 10 |

Read-only comparison to current source confirmed the existing six-request constant,
the V3 character schema members used by the operation catalog, the existing public
attempt-status literals, and the 80-character public attempt-ID bound. Self-review
corrected four material ambiguities before marking this candidate ready for
independent review: absent envelope bounds, an overlarge whole-cluster replacement,
model exposure of server-owned mechanics, and the incompatible public ID/response
shape. Revision 2 additionally corrects the two substantive findings from the
corrected review: the skeleton checkpoint now spans its required focused cross-cluster
claims, and portrait binding is server-owned. Exact DTO elaboration, process-loss
takeover detail, the fifteen-case trace matrix, and complete public Q&A field
projection remain tracked downstream completion obligations rather than reasons for
this revision. `git diff --check` and command-line LLMThink audit are required again
after the final edit. The numerical maxima, additive legacy-failure projection,
new-attempt Q&A recovery, and detector thresholds remain explicit owner decision
points rather than self-approved product policy.
