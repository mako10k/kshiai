# Actual-Turn Source-Authoring and Non-Interference Protocol

Status: protocol fixed; PoC implementation not yet accepted

Fixed on: 2026-08-06

Protocol ID: `actual-turn-source-authoring-v1`

Plan task: `T_SOURCE_AUTHORING_PROTOCOL`

Plan:
[battle-pipeline-actual-turn-shadow-observation.pert](battle-pipeline-actual-turn-shadow-observation.pert)

Replan basis:
[battle-pipeline-actual-turn-source-authoring-replan.md](battle-pipeline-actual-turn-source-authoring-replan.md)

## 1. Decision question and claim boundary

Determine whether runtime-shaped ordinary-turn inputs can author all five
explicit source artifacts required by `actual-turn-input-derivability-v1`
without semantic proxy inference and without changing authoritative battle
behavior:

- `turn_fallback_policy` for `allowedFallbacks`;
- `coarse_proposal_registry` for `proposals`;
- `adaptive_stage_receipt` for `adaptive`;
- `purpose_read_set` for `reads`;
- `consistency_issue_snapshot` for `issues`.

The PoC evaluates three claims separately:

1. **core authorability**: pure owner-stage constructors can produce or reject
   each artifact from explicit local inputs;
2. **shared shadow assembly**: an ordinary-turn-shaped shared flow can assemble
   and derive a complete applicability input while preserving control behavior;
3. **adopted backend readiness**: the deployed ordinary-turn service emits the
   five artifacts under separately accepted capture authority.

This protocol and its two implementation PoCs may establish only the first two
claims. The third claim remains `0/5` and unmeasured until
`T_CAPTURE_AUTHORITY_REVIEW_V2` explicitly accepts a capture operation. A
synthetic or shared-code `supported` result is not evidence that actual user
turns are observable, privacy-ready, or correctly classified.

## 2. Frozen lineage

| Artifact | SHA-256 |
|---|---|
| `docs/battle-pipeline-actual-turn-source-authoring-replan.md` | `c633613e8f52dd118a080095af0db3316683c54e8148efa61345358889800759` |
| `docs/battle-pipeline-actual-turn-capture-authority-review.md` | `c24ed6347ca299c6b835d354c0db0c8162cd966988b5d1f2af661b0709155603` |
| `docs/battle-pipeline-actual-turn-input-derivability-protocol.md` | `9ce6e1f62e7051ba8420e7ebb5aa2ee9591cece002700c4c990eeb2471f2f69b` |
| `docs/battle-pipeline-actual-turn-input-derivability-evaluation.md` | `a7a6fcb3d464fe52dcfd5482b1a7b8859256e5a2930cba839dd6afd6bfca8775` |
| `docs/evidence/battle-pipeline-actual-turn-input-derivability-evaluation-2026-08-06.json` | `950312d2ca7493ec0cfb73727bbb324462a2553140d87e3b51252a9279c6ca73` |
| `packages/shared/src/battle-actual-turn-input-derivation.ts` | `44485e3f69df8246a8cd0cd7a1b848ba05a8b86cffb1f23ed6064a00e07aac63` |
| `packages/shared/src/battle-adaptive-adjudication.ts` | `62727eeb6188fe240aad3936aa8c13eaab687ad5dea0c1f483a580205c4198b0` |
| `packages/shared/src/battle-read-coherence.ts` | `d9caa19f47f6d702cec180ad6dee9d50493f8a8fdd3f82c0b18efa8e9741203d` |
| `packages/shared/src/battle-projection.ts` | `c8e3224987f091d0be6a3ba64fe1ee112264b2cb6682cdca60bddab2f97ac150` |
| `packages/shared/src/battle-consistency-issue.ts` | `b29d715e45a744cc7cd679768542ea8227e238f7884f314adc9fec36f89e23d5` |
| `packages/shared/src/battle-integrated-shadow-turn.ts` | `e70d95ab45f42c00eb6b28387985121bf72c5e40fe13780dd5301b48ba9cc2b3` |
| `packages/shared/src/battle-engine.ts` | `9a740b9b65f913b6db05f244f96b556b79ac51841c363a4a76b66df496054992` |
| `backend/src/services/battle-service.ts` | `65604abce2bdb4ae828a321611be41337451a7259c8cfa27aac21152678d0a10` |

Reviewed repository commit:
`66d16b49fd5ad8e457b058f065d3cf98dd00e586`

Any listed artifact mismatch stops the PoC until the protocol is versioned and
reaccepted. The PERT document is intentionally outside this hash lineage
because recording work changes it.

## 3. Artifact ownership and exact authoring stages

Each semantic value has exactly one owner. An author may copy an owner-stage
value into its artifact and calculate structural metadata, but it may not
reconstruct the value from later effects, text, absence, or defaults.

| Artifact | Semantic owner | Exact authoring point | Permitted source | Forbidden substitute |
|---|---|---|---|---|
| `turn_fallback_policy` | turn policy selection | once after the turn-scoped policy is selected and before proposal adjudication begins | explicit ordered set of applicability fallback categories | engine fallback actions, outcome, budget exhaustion, failure reason |
| `coarse_proposal_registry` | proposal formation | immediately after both requested actions and stable proposal references exist, before temporal resolution, revalidation, interruption, or action replacement | requested character/world proposals and their pre-resolution action kinds | `resolved.actions`, events, parameter deltas, narration |
| `adaptive_stage_receipt` | adaptive stage router | once when the router finishes; either an executed batch result or an explicit skipped decision | exact `AdaptiveAdjudicationBatchResult`, or structured skip reason from the router | stage absence interpreted as skipped, later fallback outcome |
| `purpose_read_set` | purpose-scoped consistency reader | append only when `checkPurposeScopedConsistencySlice` returns; close after all purpose reads for the shadow turn | `sliceRef` plus the exact returned `PurposeScopedReadCheck` | consistency slice alone, issue registry alone, synthesized empty on missing collector |
| `consistency_issue_snapshot` | turn-local consistency issue registry | once after purpose reads and audits finish and before the source bundle is sealed | `projectConsistencyIssueViews` over the explicit turn-local issue envelope | blocking references expanded into invented issues, global mutable registry after the boundary |

### 3.1 Fixed proposal-kind mapping

Proposal formation maps the current `ActionKind` exactly as follows:

| Requested action kind | `AdaptiveActionKind` |
|---|---|
| `basic_attack` | `basic_attack` |
| `skill` | `skill` |
| `defend` | `defense` |
| `free_action` | `free_action` |
| `rest` | `custom` |
| `wait` | `custom` |

This is a structural enum mapping, not a new adjudication. In particular, the
engine actions `rest`, `defend`, and `wait` must not be used to infer the
fallback policy. `intermediate`, `weak`, and `unknown` are fallback categories,
not proposal kinds.

### 3.2 Reference rules

All cross-artifact references use the opaque typed form required by
`ActualTurnShadowApplicabilityInputSchema`:

```text
proposal:<64 lowercase hexadecimal characters>
claim:<64 lowercase hexadecimal characters>
slice:<64 lowercase hexadecimal characters>
issue:<64 lowercase hexadecimal characters>
fact:<64 lowercase hexadecimal characters>
```

The PoC may derive deterministic references from synthetic case-local aliases
to make results reproducible. That construction is not an accepted production
pseudonymization scheme. Actual-turn reference protection and secret handling
remain part of the later capture-authority decision.

## 4. Lifecycle and bundle sealing

The source-authoring context is isolated and turn-local:

```text
S0  open isolated context and reference registry
S1  freeze one explicit turn fallback-policy artifact
S2  freeze one pre-resolution coarse proposal registry
S3  freeze one executed or explicitly skipped adaptive receipt
S4  append actual purpose-read checks and close the read set
S5  project and freeze the same-boundary issue snapshot
S6  seal the five-artifact bundle and run existing strict derivation
S7  discard the isolated context after evidence capture
```

Lifecycle invariants:

- every artifact carries `artifactRef`, `turn`, `complete: true`, the exact
  literal `sourceStage`, and a canonical `payloadSha256`;
- one context accepts exactly one artifact of each kind and one turn number;
- an explicit empty read set or issue snapshot is valid only when its collector
  was opened, reached its close boundary, and emitted a complete artifact;
- skipped adaptive execution is valid only as an explicit router receipt;
- duplicate freeze, mutation after freeze, wrong-turn input, digest mismatch,
  dangling reference, and resolved blocking issue fail closed;
- sealing is atomic: failure returns no partial applicability input;
- source objects and their canonical byte digests remain unchanged;
- the context is never attached to `BattleState`, database entities, provider
  requests, narration, or persistence candidates.

## 5. PoC implementation boundary

### 5.1 Core constructor PoC

`T_SOURCE_AUTHORING_CORE_POC` may add a shared, pure source-authoring module and
colocated tests. It may use only runtime-shaped local objects and the frozen
shared schemas. It may not edit or import the backend battle service, query a
repository, call a provider, or hook `resolveTurn`.

The core PoC must expose explicit author/freeze/close/seal operations rather
than one function that guesses missing stages. Invalid input is a typed
fail-closed result or schema error and never a best-effort partial bundle.

### 5.2 Shared ordinary-turn-shaped shadow PoC

`T_SOURCE_AUTHORING_SHADOW_POC` may exercise a disabled-by-default observer at
the exact proposal boundary in shared `resolveTurn`: after requested action
objects and stable IDs are constructed, but before temporal resolution and
revalidation. The observer receives an immutable clone and cannot return an
authoritative action or state.

Observer return values are ignored. Observer exceptions are captured only in
shadow evidence and must not escape into authoritative resolution. No backend
service wiring is permitted. If this seam cannot be introduced while meeting
the parity and call-trace gates below, the claim is `unsupported`; the PoC must
not move the hook to `resolved.actions`.

## 6. Non-interference contract

Each shadow case runs a control path and a source-authoring path from identical
deep-frozen inputs. Compare stable canonical digests of:

- the complete `resolveTurn` result;
- resulting battle state;
- action receipts and events;
- mechanical evidence;
- fixture-mode narration input, when the fixture reaches that boundary;
- persistence-candidate DTOs, when locally constructed;
- ordered effectful call traces.

An effectful trace counts database and repository operations, network calls,
external provider/LLM/XAI calls, canonical or battle writes, and persistence
writes. Local pure source-authoring and evidence helpers are labelled shadow
operations and excluded from that trace. The gate requires byte-equivalent
authoritative outputs and identical effectful call traces, with zero added
calls or writes.

The PoC is fail-open only with respect to the optional shadow observer: an
observer failure leaves authoritative behavior unchanged and produces no
complete artifact bundle. It remains fail-closed for evidence: missing,
ambiguous, invalid, or failed authoring cannot be counted as available.

## 7. Preregistered fixture matrix

All fixtures are deterministic, local, synthetic, and contain no user data.
Every case runs 20 repetitions.

### 7.1 Core constructor cases

| Case | Scenario | Required disposition |
|---|---|---|
| `C01_complete_nonempty` | five valid artifacts with non-empty values | complete |
| `C02_complete_empty` | explicitly closed empty collections | complete |
| `C03_policy_missing` | fallback-policy stage not frozen | insufficient source |
| `C04_proposals_missing` | proposal registry not frozen | insufficient source |
| `C05_adaptive_missing` | router receipt absent | insufficient source |
| `C06_reads_missing` | read collector never closed | insufficient source |
| `C07_issues_missing` | issue snapshot never frozen | insufficient source |
| `C08_duplicate_freeze` | same owner freezes twice | invalid source |
| `C09_wrong_turn` | artifact belongs to another turn | invalid source |
| `C10_digest_mismatch` | payload changes after digest | invalid source |
| `C11_dangling_refs` | adaptive/read reference lacks its source target | invalid source |

### 7.2 Shared shadow cases

| Case | Scenario | Required disposition |
|---|---|---|
| `S01_planned_basic_skill` | ordinary requested attack and skill | complete and parity |
| `S02_policy_selected_defense` | defense fallback category selected explicitly | complete and parity |
| `S03_simultaneous_equal_speed` | equal-speed simultaneous actions | complete and parity |
| `S04_interrupted_partial` | interruption leaves a partial execution receipt | complete from pre-resolution proposal and parity |
| `S05_active_world_process` | active world-process proposal participates | complete and parity |
| `S06_adaptive_skipped_no_eligible` | router explicitly skips because nothing is eligible | complete and parity |
| `S07_adaptive_contested_conflicted_read_issue` | executed adaptive batch, conflicted purpose read, and open/deferred/resolved issues | complete, only unresolved blocking refs, and parity |
| `S08_authoring_failure_fail_open` | injected observer failure | no complete bundle, unchanged authoritative result, and parity |
| `S09_budget_exhausted_fallback` | explicit policy precedes budget-driven fallback | complete without policy inference and parity |

The legacy-like empty/skipped stratum is covered by `C02` and `S06`. Evidence
for owner-stage support must also pass the exercised non-empty stratum,
especially `C01`, `S01` through `S05`, `S07`, and `S09`; empty artifacts alone
cannot establish usefulness.

## 8. Measurements and acceptance gates

The raw report records per case and repetition: source input digest, artifact
digests, result disposition, all provenance paths, output digest where present,
control and shadow authoritative digests, call traces, mutation checks, and
failure reasons.

`supported` requires all of the following with no denominator changes:

- exactly 20 preregistered cases and 20 repetitions each: `400/400` recorded
  dispositions;
- all ten complete-eligible cases (`C01`, `C02`, `S01`-`S07`, and `S09`)
  produce all five artifacts: `50/50` field availability;
- all nine negative core cases (`C03`-`C11`) reject exactly as registered:
  `9/9`;
- `S08` records fail-open authoritative parity and no complete bundle;
- every emitted field has exactly one artifact and exact source path:
  `100%` provenance coverage and `0` inferred fields;
- all lifecycle, digest, mapping, turn, and cross-reference invariants pass;
- every case has one stable evidence digest across its 20 repetitions;
- all nine shadow cases have control/shadow parity for every authoritative
  output listed in section 6;
- source input mutation count is `0`;
- added database, network, external provider, LLM, and XAI calls are `0`;
- canonical, battle-state, and persistence write counts are `0`;
- backend imports and backend service wiring are `0`.

XAI is permitted by project authority when genuinely needed, but this protocol
does not need semantic free-text judgment and therefore preregisters zero XAI
calls. If implementation discovers that such judgment is necessary, work stops
and a separately versioned protocol must define its input, disclosure boundary,
model, repetitions, and decision rule.

## 9. Decision rubric

| Decision | Rule | Consequence |
|---|---|---|
| `supported` | every fixed gate in section 8 passes | accept only core authorability and shared shadow assembly; proceed to the separately gated capture-authority review |
| `revise` | owner or lifecycle is identifiable, but a bounded constructor, schema, reference, or observer-seam correction is needed without relaxing a threshold | change the protocol or implementation, reaccept affected PERT assurance, and rerun all 400 dispositions |
| `unsupported` | required values need a forbidden proxy, authoritative behavior/calls/writes change, or the exact proposal seam cannot support observation | reject this source-authoring approach and replan; do not capture actual turns |
| `indeterminate` | lineage, fixture coverage, instrumentation, or evidence stability prevents applying the fixed gates | preserve the unknown; repair evidence design before making a support claim |

No majority score, qualitative narrative, or later successful case can override
a failed hard gate.

## 10. Stop conditions

Stop the current PoC without completing its support claim when any of these is
observed:

- a frozen lineage digest differs;
- proposal authoring requires `resolved.actions` or another post-resolution
  proxy;
- fallback policy must be reconstructed from `rest`, `defend`, `wait`, an
  outcome, or budget exhaustion;
- adaptive skip must be inferred from stage absence;
- a read or issue must be synthesized rather than emitted by its owner;
- source input or authoritative control output changes;
- control/shadow effectful call traces differ;
- backend/user data, persistence, database, network, provider, external LLM, or
  XAI access becomes necessary;
- production pseudonymization or secret material becomes necessary;
- a fixture, repetition, denominator, threshold, or required comparison would
  need to be removed or weakened after observing results.

Record the earliest stop reason. Do not reinterpret missing evidence as an
empty artifact or a successful fail-open observation.

## 11. Authority boundary

Completing this protocol authorizes no implementation by itself. Acceptance of
the next PERT task may authorize only the pure shared core PoC in section 5.1.
It does not authorize actual-turn capture, user-data reads, database or network
access, external providers, LLM/XAI calls, backend integration, canonical or
battle persistence, release, deployment, or activation.

`T_SOURCE_AUTHORING_SHADOW_POC`, `T_SOURCE_AUTHORING_EVAL`, and
`T_CAPTURE_AUTHORITY_REVIEW_V2` remain separate approval and evidence gates.
Even a conformant PoC does not turn the current backend availability finding
from `0/5` into a runtime fact.
