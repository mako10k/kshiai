# Bounded fallback retention matrix

Status: local regression evidence for `FPR_RETENTION_MATRIX`

Reasoning record: [`fallback-retention-matrix-2026-09-07.llmthink.dsl`](fallback-retention-matrix-2026-09-07.llmthink.dsl)

This matrix protects only fallbacks already classified as bounded continuation or
development-only behavior. It does not authorize another fallback layer. A test
named below must fail if the retained substitute, its receipt, or its authority
boundary changes.

| Point | Retained contract | Direct regression evidence | Change in this task |
|---:|---|---|---|
| 6 | Production never accepts mock authority; real providers use mock only after explicit non-production opt-in. | `backend/src/llm/provider-config.test.ts`, `mock provider boundary` | Existing coverage retained. |
| 11 | A rejected later-bucket proposal selects one deterministic listed action and persists rejection, selection, provider, and reason in `causalLaterDecision`. | `backend/src/services/scene-beat-wiring.test.ts`, `persists a rejected later-bucket proposal and its deterministic choice` | Added service-boundary persistence regression. |
| 12 | Finisher-only failure may partially downgrade; localized spacing failures may reposition; depleted resources may rest; otherwise a feasible defend/wait substitute is used; no feasible action remains a failure. The original reason stays in the resolution. | `packages/shared/src/action-feasibility.test.ts`, `substitutes, partially downgrades, or fails with canonical reasons`, `retains every remaining feasibility reason-to-substitute mapping`, and the spacing/line-of-sight cases | Added missing skill, cooldown, speech, required-object, target-absence, and target-localization mappings. |
| 13 | Conflicting constraints use the highest-ranked legal declared fallback, never invent an unavailable action, and otherwise retain legal `wait`; the receipt identifies the choice. | `packages/shared/src/character-definition-rules.test.ts`, `records a conflicting constraint and selects the highest legal declared fallback` and `never invents an illegal fallback and uses the legal wait action` | Existing coverage retained. |
| 16 | A malformed semantic patch commits neither semantic nor world changes, records a rejected zero-revision semantic receipt, and records the dependent world transition as skipped at the same revision. | `backend/src/services/battle-public.test.ts`, `keeps the committed state when a provider patch is invalid` | Added world-state and both receipt assertions. |
| 20 | Terminal narration failure remains a failed public event with deterministic prose and a durable bounded reason, then releases its successor. Arbitrary exception text is not public or persisted as the reason. | `backend/src/services/narration-worker.test.ts`, `bounds retries and releases the successor with a terminal fallback` | Added narrative, reason, persistence, and non-disclosure assertions; narrowed the receipt from exception text to a closed class. |
| 21 | The engine result always owns `winnerSide`; provider output may explain but cannot select it. Provider absence uses deterministic reason/facts and records `engineFallbackSide`. | `backend/src/services/battle-speech-wiring.test.ts`, `persists one canonical adjudication independent of presentation inputs` | Added deterministic reason, facts, and engine-side assertions. |

Point 20 exposed one implementation defect during readback: `Error.message.slice(0,
80)` was written to both the database reason and the public event. The correction
maps that value to the existing bounded provider taxonomy plus
`budget_exhausted` and `schema_invalid`; retry, terminal narrative, and successor
behavior are unchanged.
