domain KshiaiFallbackP2Diagnostics:
  description "Retain accepted continuation for fallback points 5, 7, and 17 while making its bounded cause durable."

problem P2:
  "How should provider routing, encounter fallback, and free-action no-change continuation preserve diagnostic provenance without retaining private model output or adding recovery behavior?"

premise CONTRACT:
  "The accepted remediation plan keeps ordered DNS or billing provider continuation, deterministic encounter context, and no-change free-action adjudication, while requiring bounded reason-coded receipts at existing battle persistence boundaries."

premise PRIVACY:
  "Diagnostic receipts may identify operation, provider, bounded failure class, cooldown, and selected route, but must not retain raw prompts, raw provider output, stack traces, credentials, or unrestricted error text."

premise COMPATIBILITY:
  "New receipt fields must be additive so existing persisted battles without them remain readable."

premise AUTHORITY:
  "The correction must not add providers, retries, fallback layers, or canonical state changes."

evidence E1:
  "createFallbackLlmProvider currently logs DNS or billing failures and cooldown before trying the next provider, but its successful return exposes no route receipt to the caller."

evidence E2:
  "Battle provider calls already complete through battle save boundaries, and BattleTurnPipelineTrace is an internal bounded durable receipt attached to each retained turn record."

evidence E3:
  "startBattle catches prepareBattleEncounter failures and builds deterministic encounter context, while BattleEncounterContextSchema currently records neither provider versus deterministic source nor a failure class."

evidence E4:
  "prepareFreeActionsForTurn maps both a rejected provider call and a returned value failing FreeActionAdjudicationBatchSchema into adjudication null, after which commitFreeActionAdjudications emits only adjudication_unavailable."

evidence E5:
  "provider-errors already defines a bounded provider failure taxonomy, and the free-action schema already provides the durable per-action receipt consumed by BattleState and BattleTurnRecord."

evidence E6:
  "After implementation, shared tests passed 303 of 303, backend tests passed 293 of 293, frontend tests passed 20 of 20, deployment tests passed 3 of 3, and repository typecheck and production build completed successfully."

evidence E7:
  "The final diff scan found no added any type, arbitrary Record<string, any or unknown> boundary, double cast, or whitespace error."

decision I1 based_on CONTRACT, E1, E2, PRIVACY:
  "A request-scoped router capture can emit a closed route receipt only when provider continuation occurs, and battle orchestration can persist it without changing every LlmProvider method result or introducing a new database controller."

decision I2 based_on CONTRACT, E3, COMPATIBILITY:
  "Encounter provenance belongs inside the immutable encounter snapshot as an additive optional source receipt for legacy readability; every newly created encounter must provide it."

decision I3 based_on CONTRACT, E4, E5:
  "Free-action preparation must carry an explicit unavailable subtype from the provider exception or schema rejection into each existing no-change resolution receipt."

decision D1 based_on P2, I1, AUTHORITY:
  "Define a strict shared provider-route receipt with bounded operation, failed-provider steps, failure reason, cooldown, and selected provider; capture it with request-local context in the existing router and attach captured receipts to the matching internal battle turn trace."

decision D2 based_on I2, PRIVACY:
  "Add a strict encounter source receipt identifying provider or deterministic fallback and a bounded provider, timeout, or application failure reason, without persisting error messages or proposal payloads."

decision D3 based_on I3, PRIVACY:
  "Add an optional legacy-compatible free-action failure subtype field whose new values distinguish provider failure classes from schema_invalid, and populate it only when adjudication is unavailable."

decision D4 based_on D1, D2, D3, COMPATIBILITY:
  "Add router, encounter, free-action, schema compatibility, persistence, and no-canonical-change regressions; then run typecheck, all tests, build, diff checks, forbidden-boundary scans, and a final LLMThink audit."

decision RESULT based_on D1, D2, D3, E6, E7:
  "Fallback points 5, 7, and 17 are corrected locally: accepted continuation is unchanged, provider routing and encounter source are durably bounded, and free-action provider failure is distinguishable from schema rejection without exposing private provider content."
