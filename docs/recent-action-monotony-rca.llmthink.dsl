domain KshiaiRecentActionMonotonyRca:
  description "RCA of recent retained production battle action logs after the reposition area-ID repair reached main."

problem RCA:
  "Why do recent battles still settle into monotonous passive actions, and which bounded code defects can be corrected without changing accepted architecture?"

premise SCOPE:
  "The exact battle intended by the user was not named. The evidence scope is the three newest completed retained battles as of 2026-09-06T21:26:39Z. No new battle, deployment, asset mutation, or production write is authorized."

premise CONTRACT:
  "ADR-0011 requires structured predicates and action references for deterministic character norms. The existing battle-engine regression names the supervisor contract as forcing both fighters into basic attacks after two passive turns."

premise H1:
  "Provider failures or rejected action JSON force deterministic passive fallbacks."

premise H2:
  "Most requested attacks are rejected by feasibility and become passive actions."

premise H3:
  "The supervisor detects passivity but its force-offense branch only changes policy fallback, while valid reserved actions bypass that fallback."

premise H4:
  "A character-specific deterministic norm reduces the legal action set to wait only."

premise H5:
  "The wait-only norm was faithfully authored as a structured condition-to-response constraint."

evidence E1:
  "Read-only PostgreSQL inspection of btl_42085ad499be0cb5480a2d0fc4207a15 found 34 action records. Side B executed defend 15 and reflect 11, while all character decision provider statuses were fulfilled and its norm receipts excluded no actions. Seven identical stalemate-break status events were recorded, yet side B executed zero basic attacks."

evidence E2:
  "Read-only inspection of btl_b26a0d35a99fd5bd2188855722a804c8 found side B requested and executed wait 24 times in 36 action records. Nine stalemate-break events interleaved a fixed passive cadence. Every stored side-B decision had availableActions length 1 containing only wait, although the raw legal set included attacks, skills, defend, rest, reposition, reflect, and free action."

evidence E3:
  "The side-B action norm receipt for btl_b26a0d35a99fd5bd2188855722a804c8 identified constraint need_instruction and excluded every action except wait. Its compiled norm is unconditional always=true, allow_only wait, with no exception."

evidence E4:
  "packages/shared/src/battle-engine.ts sets forceOffense when supervisor.passiveTurns is at least 2 and emits the forced-engagement status, but requestedActionA/B still select a non-repeated plannedAction before calling policyA/B. policyA/B is the only location where forceOffense returns basic_attack."

evidence E5:
  "packages/shared/src/character-definition-check.ts defaultActionNormResponse and legacyCharacterSheetToDefinitionV2 map every free-text principle whose force is constraint to unconditional allow_only wait, regardless of the statement. The simplified input has no structured predicates or action selectors from which wait could be inferred."

evidence E6:
  "Across the same three recent battles provider calls were fulfilled. Substitutions were bounded and explained by out_of_range or required_object_unavailable; they do not account for 24 waits or the 26 defend/reflect choices."

evidence E7:
  "Normal create, revision, and upgrade sources were all routed through a gap-fill contract that omitted action-norm predicates, response selectors, priority, exceptions, and fallback. A complete revision with no gaps returned its base unchanged."

evidence E8:
  "Character definition generation and review could replace operation errors or invalid review fills with mock output, the unchanged base, or a null fill in configured fallback environments. Production provider construction disables generic fallbackOnError, so this was an escape path rather than the cause of the observed production battle."

decision D1 based_on RCA, H1, E1, E6:
  "Reject H1 for this scope. Provider failure is not the producing mechanism."

decision D2 based_on RCA, H2, E2, E6:
  "Reject H2 as the principal cause. Feasibility substitutions exist but are too few and have different recorded reasons."

decision D3 based_on RCA, H3, E1, E4, CONTRACT:
  "Support H3. The supervisor state and public log say force offense, but reserved passive actions bypass the branch. This creates a theatrical status and permits the detected passive loop to continue. Correct requested-action selection so forceOffense overrides reserved agent actions while retaining an explicit player action and later feasibility validation."

decision D4 based_on RCA, H4, E2, E3:
  "Support H4 for the wait-dominant battle. The model cannot vary because deterministic preprocessing supplies exactly one candidate."

decision D5 based_on RCA, H5, E3, E5, E7, CONTRACT:
  "Reject H5. The wait selector was not derived from a structured owner rule; the authoring boundary discarded structured semantics and deterministic adapters invented replacements. This contract mismatch, not only the chosen wait default, is the source cause of the singleton candidate set."

decision FIX based_on RCA, D3, D4, D5, E7, E8, SCOPE, CONTRACT:
  "Keep the forceOffense bypass correction separate. For action norms, reject shorthand and selector-free rules, remove free-text mechanical conversion, route create and revision through complete-definition generation, reject missing owner source while gaps remain, and keep structure generation or review failures terminal instead of substituting mock or null results. Preserve the explicit runtime character_norm_conflict fallback because ADR-0011 requires it and its receipt exposes the conflict."

decision LIMIT based_on RCA, E1, E2, E7, SCOPE:
  "This first step exposes unresolved legacy principles as UNSTRUCTURED_LEGACY_ACTION_NORMS rather than activating invented mechanics. A subsequent accepted compatibility implementation must carry those principles into complete structured generation. Existing immutable wait-only generations require explicit new revisions; mutating them, deployment, and short-cycle pacing changes remain outside this task."
