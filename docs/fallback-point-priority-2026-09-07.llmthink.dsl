domain KshiaiFallbackPriority:
  description "Prioritize the 21 fallback points fixed at main a4184d4188e050d8db63aea5aac004d1b6496d07 without treating every fallback as a defect."

problem PRIORITY:
  "Which fallback point should be addressed first, and what bounded countermeasure class applies to each?"

premise SCOPE:
  "The inventory covers character authoring and battle runtime. Same-provider retries, configuration defaults, validation that stops, forceOffense itself, and image or UI fallbacks are excluded."

premise CLASS:
  "A means reaching the branch establishes a broken producer or contract. B means contract-preserving continuation. U means one branch conflates normal absence or provider outage with invalid application output. DEV means a production-inactive development substitute."

premise ORDER:
  "P0 removes a source of invalid authoritative state or separates a direct action or cognition freeze from legitimate provider failure. P1 separates other mixed triggers or restores action-relevant provenance. P2 closes diagnostic gaps in valid continuation. P3 retains already bounded and durably observed continuation. DEV preserves the production boundary."

evidence E1:
  "The audited inventory contains exactly 21 points: A=3, B=10, U=7, DEV=1."

evidence E2:
  "Recent battle evidence ties a singleton wait candidate set to unconditional allow_only wait norms created by authoring conversion, and ties retained planned passive actions to continued monotony even when the supervisor requested offense."

evidence E3:
  "Points 2 and 3 invent unconditional action semantics from unstructured prose. Point 15 can omit a committed utterance from required perception."

evidence E4:
  "Points 1 and 4 can silently retain an unchanged definition or discard an invalid revise fill. Points 8 and 9 combine provider failure and application rejection while substituting prior state or no action."

evidence E5:
  "Points 10, 14, 18, and 19 affect action selection, cognition, initial semantic state, or baseline attacks while lacking a trigger split or source provenance."

evidence E6:
  "Points 5, 7, and 17 preserve their external contract but lack durable or sufficiently specific causal diagnostics."

evidence E7:
  "Points 11, 12, 13, 16, 20, and 21 have bounded contract-defined substitutes and durable outcome or fallback receipts."

evidence E8:
  "Point 6 is disabled in production by fallbackOnError false and explicit mock-provider configuration."

decision D0 based_on PRIORITY, ORDER, E2, E3, E4:
  "Assign P0 to points 1, 2, 3, 4, 8, 9, and 15. Correct the producer for A points. For U points split transport or genuine absence from schema, consistency, or instruction-contract failure before deciding whether the substitute remains."

decision D1 based_on PRIORITY, ORDER, E5:
  "Assign P1 to points 10, 14, 18, and 19. Preserve only the proven compatibility or conservative path, distinguish invalid modern state, and record the provenance needed to identify which path ran."

decision D2 based_on PRIORITY, ORDER, E6:
  "Assign P2 to points 5, 7, and 17. Keep the contract-preserving behavior but add durable reason-coded observation at the existing receipt boundary, without adding a new provider, retry, or controller."

decision D3 based_on PRIORITY, ORDER, E7:
  "Assign P3 to points 11, 12, 13, 16, 20, and 21. Retain behavior and existing receipts; limit action to regression coverage or metric review when evidence shows a gap."

decision DDEV based_on PRIORITY, ORDER, E8:
  "Assign DEV to point 6. Preserve and test the production-disabled boundary; do not promote mock output into an authoritative production fallback."

decision LIMIT based_on PRIORITY, SCOPE:
  "This priority record authorizes documentation only. It does not accept the existing uncommitted implementation, mutate immutable character generations, deploy, or change production configuration."
