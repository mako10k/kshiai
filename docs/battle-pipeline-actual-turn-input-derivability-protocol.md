# Actual-Turn Applicability Input-Derivability Protocol

Status: protocol fixed; PoC implementation not yet accepted

Fixed on: 2026-08-06

Protocol ID: `actual-turn-input-derivability-v1`

Plan task: `T_INPUT_DERIVATION_PROTOCOL`

Plan:
[battle-pipeline-actual-turn-shadow-observation.pert](battle-pipeline-actual-turn-shadow-observation.pert)

Replan basis:
[battle-pipeline-actual-turn-input-derivability-replan.md](battle-pipeline-actual-turn-input-derivability-replan.md)

## 1. Decision question

Determine whether one ordinary resolved turn can provide all five areas of a
`ConflictHandlingApplicabilityInput` from explicit, turn-local, authoritative
structured artifacts without inference:

- `allowedFallbacks`
- `proposals`
- `adaptive`
- `reads`
- `issues`

The PoC evaluates two claims separately:

1. **transformation feasibility**: permitted source artifacts can be mapped to
   the classifier input without guessing, mutation, or hidden defaults;
2. **runtime readiness**: the adopted ordinary-turn pipeline actually produces
   all required authoritative artifacts at the reviewed source revision.

A successful transformation over synthetic artifacts does not establish
runtime readiness. `supported` requires both claims. This protocol does not
assume that the eventual result will be `supported`.

## 2. Frozen lineage

| Artifact | SHA-256 |
|---|---|
| `docs/battle-pipeline-actual-turn-input-derivability-replan.md` | `29cf23e226db48b8bed009f34fa9f37ac68fb55339a0cb07419aeb0f055a1ecf` |
| `docs/battle-pipeline-actual-turn-capture-authority-request.md` | `a4a88f2acd1362f764af1cc11e5b4d1ce74b198b64aedc4b96f0639f04c61833` |
| `packages/shared/src/battle-conflict-handling-applicability.ts` | `f8561c8cda612d75ee5d6af592a1547d7cfbf5ad8d565c72baab75cd729b7905` |
| `packages/shared/src/battle-actual-turn-shadow-observation.ts` | `859e419e7a2fbb0b52488b6fcf49743a9d5af1b4c409459b06ac3e6e91c767a6` |
| `packages/shared/src/battle-integrated-shadow-turn.ts` | `e70d95ab45f42c00eb6b28387985121bf72c5e40fe13780dd5301b48ba9cc2b3` |
| `packages/shared/src/battle-adaptive-adjudication.ts` | `62727eeb6188fe240aad3936aa8c13eaab687ad5dea0c1f483a580205c4198b0` |
| `packages/shared/src/battle-read-coherence.ts` | `d9caa19f47f6d702cec180ad6dee9d50493f8a8fdd3f82c0b18efa8e9741203d` |
| `packages/shared/src/battle-projection.ts` | `c8e3224987f091d0be6a3ba64fe1ee112264b2cb6682cdca60bddab2f97ac150` |
| `packages/shared/src/battle-consistency-issue.ts` | `b29d715e45a744cc7cd679768542ea8227e238f7884f314adc9fec36f89e23d5` |
| `backend/src/services/battle-service.ts` | `65604abce2bdb4ae828a321611be41337451a7259c8cfa27aac21152678d0a10` |

Reviewed repository commit:
`941f48ddea6a9b45ccab7d6bd077826e5e59a5df`

Any listed artifact mismatch stops the PoC until this protocol is versioned
and reaccepted. The PERT document is intentionally excluded from this hash
lineage because recording this task's completion changes it. A source change
is not silently treated as equivalent evidence.

## 3. Source authority vocabulary

### 3.1 Source-produced

A value is source-produced only when the stage that owns its semantics emits a
schema-valid, turn-local, explicitly complete artifact. An artifact must carry
its own reference, turn, source stage, completeness marker, and payload digest.

An empty collection is source-produced only when an explicit complete artifact
contains that empty collection. Absence is not an empty collection.

### 3.2 Permitted derivation

A permitted derivation is limited to:

- strict source-schema validation;
- exact field selection;
- the field renames frozen in the source map below;
- lossless projection of an existing enum or reference;
- construction of the fixed output object after all five sources pass;
- stable serialization and digest calculation for evidence.

It may not create a new semantic claim. Every emitted field must point to one
source artifact and one exact source path.

### 3.3 Forbidden inference

Inference includes deriving a required field from a proxy that does not own its
semantics. The following are forbidden:

- actions after resolution, `resolved.actions`, events, or parameter deltas;
- narration, speech, cognition, scene text, prompts, or provider output;
- budget values, fallback facts, failure reasons, or outcomes as a substitute
  for the turn's fallback policy;
- absence of an adaptive result as `adaptive.status = "skipped"`;
- a consistency slice without its purpose-scoped read check;
- blocking issue references without an issue-lifecycle snapshot;
- defaulting any missing collection to `[]`;
- selecting one of multiple same-kind artifacts by order, recency, or
  convenience;
- LLM or XAI reconstruction of any missing field.

Forbidden inference is reported as `insufficient_source` with
`inferredFieldCount = 0`; the probe never emits the guessed value.

## 4. Field-by-field source map

The existing integrated-shadow conversion in
`battle-conflict-handling-applicability.ts` is a transformation precedent, not
ordinary-turn authority. Its proposal and fallback-policy inputs are
pre-authored, and its remaining values are shadow receipts.

| Output area | Required semantic owner | Permitted source artifact and exact projection | Current ordinary runtime | Existing shadow precedent |
|---|---|---|---|---|
| `allowedFallbacks` | turn fallback-policy owner before adjudication | one complete `turn_fallback_policy` artifact; copy `payload.allowedFallbacks` exactly | absent | `turnInput.expectedBoundaries.allowedFallbacks` |
| `proposals` | character/world proposal formation before resolution | one complete `coarse_proposal_registry`; project each `payload.proposals[]` to `proposalRef` and `actionKind` | absent; resolved actions are too late and semantically different | `turnInput.characterInputs.cases[].proposal` |
| `adaptive` | adaptive adjudication stage | one complete `adaptive_stage_receipt`; executed maps batch `contestedClaimRefs` and receipt fields exactly, while skipped requires an explicit skipped receipt | absent from ordinary `resolveTurn` path | `receipt.adaptive.result` or explicit shadow skipped receipt |
| `reads` | purpose-scoped consistency reader | one complete `purpose_read_set`; map `sliceRef`, `check.consistency.level`, and `check.blockingIssueRefs` | absent | `receipt.reads[]` containing `PurposeScopedReadCheck` |
| `issues` | consistency-issue registry at the same turn boundary | one complete `consistency_issue_snapshot`; map `id` to `issueRef` and copy `status` | absent | `receipt.issues[]` containing `ConsistencyIssueView` |

The protocol-freeze source audit therefore records ordinary-runtime
authoritative availability as `0/5`. This is a confirmed current limitation,
not a prediction about a future implementation.

## 5. Offline probe contract

The PoC accepts only an explicit in-memory or local fixture bundle. It does not
read a battle repository or actual user data.

```ts
type ApplicabilityDerivationArtifact =
  | TurnFallbackPolicyArtifact
  | CoarseProposalRegistryArtifact
  | AdaptiveStageReceiptArtifact
  | PurposeReadSetArtifact
  | ConsistencyIssueSnapshotArtifact;

type ApplicabilityDerivationSourceBundle = {
  schemaVersion: 1;
  caseRef: string;
  turn: number;
  artifacts: ApplicabilityDerivationArtifact[];
  observedProxyKinds: Array<
    | "resolved_actions"
    | "events_or_parameter_deltas"
    | "speech_narration_or_cognition"
    | "prompt_or_provider_output"
    | "fallback_outcome_proxy"
    | "slice_without_read_check"
    | "blocking_refs_without_issue_snapshot"
  >;
};
```

Every artifact has this common authority header:

```ts
type DerivationAuthorityHeader = {
  artifactRef: string;
  turn: number;
  sourceStage: string;
  complete: true;
  payloadSha256: string;
};
```

The stage payloads use existing strict shared contracts wherever available:

- proposal registry entries use `proposalRef` and `AdaptiveActionKind` emitted
  by proposal formation;
- executed adaptive receipts use `AdaptiveAdjudicationBatchResult`;
- skipped adaptive receipts are explicit structured receipts, not missing
  values;
- read entries use `sliceRef` plus `PurposeScopedReadCheck`;
- issue entries use `ConsistencyIssueView`.

The probe result is a strict union:

```ts
type ApplicabilityDerivationResult =
  | {
      status: "complete";
      applicabilityInput: ConflictHandlingApplicabilityInput;
      provenance: Record<
        "allowedFallbacks" | "proposals" | "adaptive" | "reads" | "issues",
        { artifactRef: string; payloadSha256: string; sourcePaths: string[] }
      >;
      inferredFieldCount: 0;
    }
  | {
      status: "insufficient_source";
      availableFields: string[];
      missingFields: string[];
      ambiguousFields: string[];
      forbiddenProxyKinds: string[];
      inferredFieldCount: 0;
    }
  | {
      status: "invalid_source";
      reasons: string[];
      inferredFieldCount: 0;
    };
```

No partial `applicabilityInput` is returned. A result becomes `complete` only
after all five artifact kinds and all cross-reference checks pass.

## 6. Cross-source validation

The probe must reject the source as invalid when any of these holds:

- an artifact turn differs from the bundle turn;
- an artifact payload digest does not match its canonical payload;
- source bytes or their canonical digest change during derivation;
- an adaptive receipt references a proposal absent from the proposal registry;
- a read's blocking issue reference is absent from the issue snapshot;
- a resolved issue appears as a blocking issue;
- the resulting input fails `ConflictHandlingApplicabilityInputSchema`;
- the resulting observation-local input fails structural-reference validation;
- any source collection violates the existing hard maximum or uniqueness rule.

More than one artifact of a required kind is `ambiguous`, even if the payloads
are byte-identical. The probe does not choose a winner.

## 7. Preregistered fixture matrix

Exactly 20 fixture cases are fixed for the first PoC. Field-focused cases vary
one source area from a valid complete baseline.

| Case | Focus | Source condition | Expected result |
|---|---|---|---|
| `X01_complete_nonempty` | cross-field | all five explicit artifacts with nonempty representative values | `complete` |
| `X02_complete_empty` | cross-field | explicit empty policy, proposal, read, and issue artifacts plus explicit adaptive skipped receipt | `complete` |
| `X03_all_duplicate_kinds` | cross-field | two artifacts for every required kind | `insufficient_source`; all five ambiguous |
| `X04_wrong_turn` | cross-field | one otherwise-valid artifact belongs to another turn | `invalid_source` |
| `X05_digest_mismatch` | cross-field | one payload differs from its declared digest | `invalid_source` |
| `F01_policy_direct` | fallbacks | explicit nonempty turn policy | `complete` |
| `F02_policy_missing` | fallbacks | no policy artifact | `insufficient_source`; `allowedFallbacks` missing |
| `F03_policy_proxy_only` | fallbacks | fallback fact/outcome proxy without a policy artifact | `insufficient_source`; proxy reported, no inference |
| `P01_proposals_direct` | proposals | explicit character and world coarse proposal entries | `complete` |
| `P02_proposals_missing` | proposals | no proposal registry | `insufficient_source`; `proposals` missing |
| `P03_resolved_actions_proxy` | proposals | only post-resolution actions are available | `insufficient_source`; proxy reported, no inference |
| `A01_adaptive_executed` | adaptive | explicit executed batch with receipts and contested refs | `complete` |
| `A02_adaptive_skipped` | adaptive | explicit skipped-stage receipt | `complete` |
| `A03_adaptive_absent` | adaptive | no stage receipt | `insufficient_source`; not converted to skipped |
| `R01_reads_direct` | reads | explicit locally-coherent and conflicted read checks | `complete` |
| `R02_reads_missing` | reads | no purpose read set | `insufficient_source`; `reads` missing |
| `R03_slice_or_event_proxy` | reads | slices/events without purpose read checks | `insufficient_source`; proxy reported, no inference |
| `I01_issues_direct` | issues | explicit open, deferred, and resolved issue views | `complete` |
| `I02_issues_missing` | issues | no issue snapshot | `insufficient_source`; `issues` missing |
| `I03_dangling_blocking_issue` | issues | a read blocks on an issue absent from the snapshot | `invalid_source` |

No fixture uses actual battle, user, or character data. Fixture references are
case-local and synthetic. The expected result is frozen before implementation.

## 8. Effectiveness metrics

All hard invariants must pass:

| Metric | Threshold |
|---|---:|
| fixture schema and expected disposition | `20 / 20` |
| provenance coverage for every emitted field | `1.00` |
| inferred field count | `0` |
| missing required source rejection | `1.00` |
| ambiguous same-kind source rejection | `1.00` |
| forbidden proxy used as source | `0` |
| dangling cross-source reference accepted | `0` |
| input digest changes | `0` |
| output digests per case over 20 replays | `1` |
| DB queries / network / provider / external LLM / XAI calls | `0 / 0 / 0 / 0 / 0` |
| battle, canonical, or persistence writes | `0 / 0 / 0` |
| runtime-service imports in the pure derivation module | `0` |

The evidence must separately report:

```text
transformation feasibility: pass / fail / indeterminate
ordinary runtime authoritative availability: 0..5
missing runtime source areas: sorted field names
```

Synthetic completeness is never counted as ordinary-runtime availability.

## 9. Decision rubric

| Label | Required interpretation |
|---|---|
| `supported` | all hard invariants pass and the reviewed ordinary runtime produces authoritative sources for `5/5` areas |
| `revise` | transformation invariants pass, but ordinary-runtime availability is below `5/5`; missing source authoring can be stated as a bounded future change without inference or capture authority |
| `unsupported` | a complete input requires forbidden inference, mutation, unbounded semantic invention, or an authority/privacy violation |
| `indeterminate` | lineage, fixture, measurement, or source-ownership evidence is incomplete |

`revise` does not authorize runtime integration. `supported` does not authorize
capture. Either outcome still proceeds to the separately gated
`T_CAPTURE_AUTHORITY_REVIEW` only after the PoC and evaluation tasks complete.

## 10. Fail-closed and stop conditions

The probe returns no classifier input and stops the affected case when:

- any required artifact is missing, partial, duplicated, cross-turn, or
  ambiguous;
- a source or output schema is invalid;
- a payload or source digest changes;
- a proxy would be needed to fill a field;
- a cross-source reference is dangling or lifecycle-incoherent;
- the frozen lineage differs;
- an implementation would require a runtime hook, repository/DB access,
  network, provider, external LLM, XAI, actual user data, canonical write,
  persistence write, release, or deployment;
- a threshold or expected fixture result would need to be relaxed after seeing
  the implementation output.

Unknown and insufficiency remain explicit. The PoC must not force a complete
input in order to produce a favorable result.

## 11. Non-claims and authority boundary

This protocol does not claim or authorize:

- actual-turn source availability beyond the frozen `0/5` audit;
- classifier accuracy, precision, recall, specificity, or oracle truth;
- correctness of battle outcomes or complete world consistency;
- runtime hook implementation or activation;
- DB, network, provider, external LLM, or XAI access;
- collection or commit of actual user or battle data;
- canonical or battle persistence changes;
- classifier modification, runtime adoption, release, or deployment.

The next task may implement only the pure shared/offline source schemas,
derivation result, fixture corpus, and tests required by this protocol. Any
ordinary-turn integration remains outside that task and requires a later plan
and authority decision.
