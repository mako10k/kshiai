domain KshiaiFallbackRemediationPlan:
  description "Structure an end-to-end PERT response plan for the 21 fallback points pinned at main a4184d4188e050d8db63aea5aac004d1b6496d07."

problem PLAN:
  "How should the prioritized fallback countermeasures be grouped, ordered, verified, integrated, released, and applied to affected immutable character generations without substituting logging for source correction?"

premise INPUT:
  "The fixed inventory classifies 21 points as A=3, B=10, U=7, DEV=1 and prioritizes them as P0=7, P1=4, P2=3, P3=6, DEV=1."

premise AUTHORITY:
  "This request authorizes creation and audit of a plan only. Plan acceptance, implementation, commit, push, pull request, merge, staging, production, and asset revision creation remain separate future actions."

premise ASSETS:
  "Character generations are immutable. Code correction does not change already-created wait-only generations; affected assets require an exact read-only inventory, owner-approved target set, and new revisions rather than in-place mutation."

premise CONTROL:
  "Source-producing defects must be corrected before observability work. Bounded fallbacks with adequate receipts are retained and regression-protected. New providers, retries, controllers, phrase bans, and blanket fallback removal are outside scope."

evidence E1:
  "Points 1 through 4 share the character-authoring boundary and the current worktree contains unaccepted partial WIP for them."

evidence E2:
  "Points 8 and 9 share the psyche and character-agent pipeline, while point 15 is a distinct committed-utterance projection contract."

evidence E3:
  "Points 10, 14, 18, and 19 require action provenance or compatibility-versus-invalid trigger separation."

evidence E4:
  "Points 5, 7, and 17 retain behavior but need bounded durable failure subtypes."

evidence E5:
  "Points 11, 12, 13, 16, 20, and 21 already have bounded continuation and durable receipts. Point 6 is production-disabled."

evidence E6:
  "The repository requires focused tests, full tests, typecheck, build, and an ADR before implementation only when the accepted architecture or persisted/public contract changes."

decision D1 based_on PLAN, INPUT, CONTROL, E1, E2:
  "Complete P0 in three serial implementation tasks: authoring contract for points 1 to 4, psyche and agent failure taxonomy for points 8 and 9, and committed-utterance projection for point 15. Each task includes source correction and focused regression coverage."

decision D2 based_on PLAN, INPUT, CONTROL, E3:
  "Complete P1 next in two serial tasks: action fallback provenance for point 10, then projection, seed, and basic-attack compatibility boundaries for points 14, 18, and 19."

decision D3 based_on PLAN, INPUT, CONTROL, E4, E5:
  "Complete P2 as one bounded receipt task for points 5, 7, and 17. Complete P3 and DEV as one retention matrix for points 6, 11, 12, 13, 16, 20, and 21, without adding fallback layers."

decision D4 based_on PLAN, E6, AUTHORITY:
  "Run focused and repository-wide verification before an owner integration decision. Add an ADR task only if boundary review establishes a new architectural or persisted-contract decision; do not treat an unnecessary ADR as progress."

decision D5 based_on PLAN, AUTHORITY:
  "Model integration, staging, and production as separate owner-gated tasks. A plan edge records dependency but grants no external-write authority."

decision D6 based_on PLAN, ASSETS, AUTHORITY:
  "After the corrected code is in production, inventory affected generations read-only, obtain exact owner approval, create only new revisions for the approved set, and then inspect retained battles for action-candidate diversity, fallback reasons, provider status, and contract errors."

decision ESTIMATE based_on D1, D2, D3, D4, D5, D6:
  "Use one developer and one owner, a planning velocity of 1p per day, and a serial 40p plan: contract 1p, local correction and verification 24p, integration and release gates 8p, and asset remediation plus post-observation 7p. Estimates are planning size, not recorded actuals."

decision LIMIT based_on PLAN, AUTHORITY, CONTROL:
  "The PERT document remains proposed with only the inventory milestone reached. Existing WIP is neither accepted nor marked complete, and no implementation or external task is started by generating the plan."
