# Character authoring / battle runtime fallback-point inventory

Status: investigation snapshot; countermeasure priority only

Baseline: GitHub `main` at `a4184d4188e050d8db63aea5aac004d1b6496d07` (verified 2026-09-07)

Reasoning record: [`fallback-point-priority-2026-09-07.llmthink.dsl`](fallback-point-priority-2026-09-07.llmthink.dsl)
Response plan: [`fallback-remediation.pert`](fallback-remediation.pert) with
[`fallback-remediation-plan-2026-09-07.llmthink.dsl`](fallback-remediation-plan-2026-09-07.llmthink.dsl)

## Scope and classification

This inventory starts at fallback branches. It includes a branch when an unavailable,
rejected, invalid, or missing primary result is replaced by another provider, value,
state, action, deterministic output, or no-op and processing continues.

It excludes same-provider retries, configuration defaults, validation that stops,
`forceOffense` itself, and image or UI fallbacks.

Classifications:

- **A — broken:** reaching the branch establishes a broken producer or contract. Fix
  the producing mechanism; a log or a different fallback is not the correction.
- **B — bounded continuation:** the substitute preserves an accepted contract. Keep
  it only with observation proportional to its effect.
- **U — mixed:** the branch conflates a legitimate absence or provider outage with
  invalid application output or modern-state corruption. Split the triggers before
  deciding which behavior remains.
- **DEV — development substitute:** production-inactive behavior whose production
  boundary must remain explicit.

Priorities:

- **P0:** stop creation or concealment of invalid authoritative state, or split a
  fallback that directly freezes action/cognition from a legitimate provider failure.
- **P1:** split other mixed triggers or restore action-relevant provenance.
- **P2:** retain valid continuation and close its durable diagnostic gap.
- **P3:** retain the bounded, durably observed behavior; add work only if regression
  or operational evidence exposes a concrete gap.
- **DEV:** preserve and test the non-production boundary.

## Fixed inventory and countermeasure priority

The source links below open the current worktree overlay. The classified behavior is
pinned to the baseline SHA above; the overlay is described separately at the end.

| ID | Fallback point and source file | Trigger -> substitute | Class | Current observation | Priority | Required countermeasure |
|---:|---|---|:---:|---|:---:|---|
| 1 | `generateCharacterDefinitionV2` / `fillCharacterDefinitionGapsV2` in [`backend/src/llm/openai-compatible.ts`](../backend/src/llm/openai-compatible.ts) | No gaps or empty owner source -> unchanged base definition | U | The branch does not distinguish a complete upgrade from create/revision instructions that were not applied. | P0 | Route create/revision through complete-definition generation. Reserve gap filling for upgrade, and reject empty owner source while required gaps remain. |
| 2 | `defaultActionNormResponse` / `llmFillToGapFillV2` in [`packages/shared/src/character-definition-check.ts`](../packages/shared/src/character-definition-check.ts) | Shorthand action norm -> `always`, priority 50, empty exceptions; constraint -> `allow_only wait` | A | The invented mechanics look like an ordinary structured norm. | P0 | Remove prose-to-mechanics synthesis. Require complete predicates and selectors from the authoring result and reject selector-free norms. |
| 3 | `legacyCharacterSheetToDefinitionV2` in [`packages/shared/src/structured-character.ts`](../packages/shared/src/structured-character.ts) | Legacy principle -> unconditional norm; constraint -> `allow_only wait` | A | Conversion provenance is not retained in the resulting norm. | P0 | Stop converting unstructured principles into executable norms. Carry them into an explicit regeneration/migration input; do not mutate existing immutable generations in place. |
| 4 | `reviewCharacterDefinitionV2` in [`backend/src/llm/openai-compatible.ts`](../backend/src/llm/openai-compatible.ts) | Invalid `revise` fill -> `null`; configured adapter error -> mock review | U | Fill validation details are discarded; later continuation depends on separate issue handling. Generic adapter fallback is disabled in production. | P0 | Make invalid revise fills terminal with bounded validation details. Keep provider failure separate from application-invalid output; do not substitute `null` or mock acceptance. |
| 5 | `createFallbackLlmProvider` in [`backend/src/llm/fallback.ts`](../backend/src/llm/fallback.ts) | DNS or billing unavailability -> next configured provider | B | Only a console warning is guaranteed at the router boundary. | P2 | Keep the ordered provider continuation, but persist a reason-coded route receipt containing failed provider, reason, cooldown, and selected provider. |
| 6 | `fallbackOrThrow` and provider construction in [`backend/src/llm/openai-compatible.ts`](../backend/src/llm/openai-compatible.ts), [`backend/src/llm/index.ts`](../backend/src/llm/index.ts) | Adapter error or missing client -> mock implementation | DEV | Production providers set `fallbackOnError: false`; mock requires explicit non-production configuration. | DEV | Preserve the fail-closed production boundary and cover it with configuration tests. Do not promote mock results into production authority. |
| 7 | encounter proposal handling in [`backend/src/services/battle-service.ts`](../backend/src/services/battle-service.ts) | Encounter proposal failure -> deterministic encounter context | B | Console warning only; persisted context does not identify fallback cause. | P2 | Keep deterministic presentation context and persist its source and bounded failure reason with the encounter snapshot. |
| 8 | deep-psyche stage in [`backend/src/services/battle-service.ts`](../backend/src/services/battle-service.ts) | Provider rejection, timeout, or invalid application result -> prior state plus default expression brief | U | Pipeline trace shows acceptance/provider status, but the shared path conflates transport failure with schema or consistency rejection. | P0 | Split transport unavailability from schema/consistency failure. Prior-state retention may remain for the former; the latter must remain an explicit application defect with its causal detail. |
| 9 | character-agent stage and `acceptCharacterAgentResult` in [`backend/src/services/battle-service.ts`](../backend/src/services/battle-service.ts) | Provider rejection or invalid proposal -> no new speech/action and prior state | U | Pipeline trace exists, but provider failure and application rejection converge on the same substitute. | P0 | Split failure classes before continuation. Retain a conservative no-action result only for an explicitly accepted class and persist why no proposal was accepted. |
| 10 | `chooseActionFromPolicies` / `resolveTurn` in [`packages/shared/src/battle-engine.ts`](../packages/shared/src/battle-engine.ts) | No accepted planned action -> policy A/B, then legacy stance | B | The action record does not directly identify the fallback source and cause. | P1 | Preserve the conservative policy fallback, but record planned-action disposition, selected fallback layer, and reason in the action receipt. Keep observer-safety constraints identical across layers. |
| 11 | `deterministicLaterBucketFallback` in [`backend/src/services/battle-service.ts`](../backend/src/services/battle-service.ts) | Later-bucket proposal rejected -> deterministic later action | B | `causalLaterDecision` records status, validation, provider, elapsed time, and fallback reason. | P3 | Retain behavior and receipt. Maintain regression coverage for rejection reasons and deterministic choice; add no new fallback layer. |
| 12 | runtime feasibility resolution in [`packages/shared/src/action-feasibility.ts`](../packages/shared/src/action-feasibility.ts) | Requested action infeasible -> partial finisher downgrade or reposition/rest/defend/wait | B | Outcome and reason are durably recorded. | P3 | Retain the bounded mapping and regression-test each reason-to-substitute transition. Change it only when a requirement changes or evidence shows a wrong mapping. |
| 13 | action-norm conflict resolution in [`packages/shared/src/character-definition-rules.ts`](../packages/shared/src/character-definition-rules.ts) | Applicable constraints conflict -> declared fallback action, otherwise `wait` | B | Receipt records conflict, norm IDs, exclusions, ranking, and fallback identity. | P3 | Retain the explicit ADR-0011 fallback and its receipt. Test declared fallback references and legal-action filtering; do not remove it to hide authoring defects. |
| 14 | observer perception projection in [`backend/src/services/battle-service.ts`](../backend/src/services/battle-service.ts) | Full projection throws -> minimal engine-cue projection | U | Console warning only; recoverable absence and invalid deterministic state are not distinguished. | P1 | Define the recoverable trigger narrowly. Persist it when minimal projection is used; treat invariant/schema defects as application failures rather than silently normalizing them. |
| 15 | committed-utterance perception update in [`backend/src/services/battle-service.ts`](../backend/src/services/battle-service.ts) | Projection throws -> retain the previous perception frame | A | Console warning only; the committed utterance can be absent from the required next frame. | P0 | Correct the projection/input defect or stop that state transition. Do not represent a stale frame as if it incorporated the committed utterance; persist the failure boundary. |
| 16 | semantic reconciliation in [`backend/src/services/battle-service.ts`](../backend/src/services/battle-service.ts) | Reconciliation failure or rejection -> retain canonical semantic/world state | B | Latest transition/environment receipts record skipped or rejected disposition; no partial patch is committed. | P3 | Retain atomic no-change behavior and receipts. Maintain malformed-patch and no-partial-commit regressions. |
| 17 | free-action adjudication in [`backend/src/services/free-action-service.ts`](../backend/src/services/free-action-service.ts) | Provider error or invalid adjudication -> no canonical change and `adjudication_unavailable` | B | External result is durable, but parse/schema details collapse into the same reason. | P2 | Keep no-change semantics and persist a bounded failure subtype so provider unavailability and invalid adjudication are distinguishable. |
| 18 | battlefield semantic-state initialization in [`packages/shared/src/semantic-state.ts`](../packages/shared/src/semantic-state.ts) | Semantic seed absent or invalid -> obstacle-derived entities | U | `safeParse` sends both cases through one unlabelled path. | P1 | Split absent legacy input from a present invalid seed. Tag the compatibility fallback; reject invalid modern seeds instead of treating them as absent. |
| 19 | missing `basicAttack` handling in [`packages/shared/src/character.ts`](../packages/shared/src/character.ts) and [`packages/shared/src/action-feasibility.ts`](../packages/shared/src/action-feasibility.ts) | `basicAttack` missing -> deterministic basic attack | U | The result does not identify whether it came from legacy compatibility or invalid current data. | P1 | Permit the default only at a declared legacy boundary. Require modern definitions to contain the field and retain source-generation provenance in battle snapshots/receipts. |
| 20 | narration failure handling in [`backend/src/services/narration-worker.ts`](../backend/src/services/narration-worker.ts) | Narration terminal failure -> deterministic public narrative | B | A failed public event contains the fallback narrative and `fallbackReason`. | P3 | Retain terminal public continuity and its durable event. Monitor fallback rate and wording repetition; change behavior only with evidence of a presentation defect. |
| 21 | referee failure and `buildBattleAdjudication` in [`backend/src/services/battle-service.ts`](../backend/src/services/battle-service.ts) | Referee unavailable -> engine winner plus deterministic reason/facts | B | Persisted adjudication records `source=deterministic_fallback` and `engineFallbackSide`. | P3 | Retain engine authority and source receipt. Regression-test that provider output never changes the committed winner. |

Count check: **21 total = A 3 + B 10 + U 7 + DEV 1**. Priority check:
**P0 7 + P1 4 + P2 3 + P3 6 + DEV 1 = 21**.

## Ordered response sequence

1. Stop new malformed action norms: points **2 and 3**.
2. Close the surrounding authoring concealment paths: points **1 and 4**.
3. Split direct runtime freeze from legitimate provider failure: points **8 and 9**.
4. Correct committed-information loss: point **15**.
5. Split or expose the action/cognition/state compatibility paths: points **10, 14,
   18, and 19**.
6. Add bounded durable diagnostics to valid continuation: points **5, 7, and 17**.
7. Retain and regression-protect points **11, 12, 13, 16, 20, and 21**, and preserve
   the production-disabled boundary at point **6**.

This ordering intentionally corrects producing mechanisms before adding detection.
Logging-only work does not close any P0 item.

## Existing worktree overlay

The worktree already contains uncommitted changes touching points 1–4 and the
separate `forceOffense` bypass. They are **unaccepted WIP**, not evidence that these
inventory items are resolved. This document does not authorize retaining, committing,
deploying, or migrating from that WIP. Existing immutable character generations also
remain unchanged; correcting them requires explicit new-revision/migration authority.
