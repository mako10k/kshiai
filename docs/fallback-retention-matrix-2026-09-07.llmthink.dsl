domain KshiaiFallbackRetentionMatrix:
  description "Audit and regression-protect the accepted bounded fallback contracts at points 6, 11, 12, 13, 16, 20, and 21 without changing runtime fallback behavior."

problem P1:
  "Which accepted fallback contracts already have direct regression evidence, and which missing assertions must be added without adding, removing, or broadening a fallback layer?"

premise SCOPE:
  "FPR_RETENTION_MATRIX covers only production mock exclusion, later-bucket deterministic choice and receipt, runtime feasibility substitution, action-norm conflict fallback, semantic atomic no-change, terminal narration continuity, and engine-authoritative adjudication."

premise AUTHORITY:
  "This task authorizes regression protection of accepted behavior, not a change to production semantics, provider routing, persistence boundaries, or fallback inventory classification."

premise TEST_POLICY:
  "Existing direct assertions should be retained; only a contract property not presently asserted should cause a new regression case or assertion."

evidence E6:
  "provider-config.test.ts directly proves mock is rejected in production even when fallback is enabled, and requires explicit opt-in behind a real provider outside production."

evidence E11:
  "battle-service.ts persists causalLaterDecision with status, validation, acceptedAction, provider, elapsed time, and fallbackReason, but repository tests contain no direct causalLaterDecision assertion."

evidence E12:
  "action-feasibility.test.ts directly covers movement_blocked to defend, insufficient_resource to rest, finisher_unavailable partial downgrade, actor_unavailable failure, out_of_range to reposition, and line_of_sight_blocked substitution; other implemented reason-to-substitute branches are not collected into one explicit mapping regression."

evidence E13:
  "character-definition-rules.test.ts directly proves a conflicting constraint selects the highest-ranked legal declared fallback and that an unavailable declared fallback cannot be invented and instead selects legal wait, including the receipt fallback identity."

evidence E16:
  "battle-public.test.ts proves an invalid semantic patch is rejected and retains the semanticState object; focused execution confirms the accepted contract retains canonical semantic and world state, updates latestSemanticTransition to a rejected zero-revision receipt, and records latestWorldTransition as skipped at the same revision."

evidence E20:
  "narration-worker.test.ts proves bounded retries produce a failed terminal event and release its successor, but does not assert the failed event's deterministic narrative or bounded fallbackReason payload."

evidence E20_PRIVACY:
  "narration-worker.ts currently assigns Error.message.slice(0, 80) to errorClass and persists that value as fallback_reason and the public failed-event fallbackReason; the existing test error text provider_down_private_detail would therefore be disclosed verbatim."

evidence E21:
  "battle-speech-wiring.test.ts proves provider-selected side cannot change the engine winner and that absence of a provider result selects deterministic_fallback; the fallback reason, reasonFacts, and engineFallbackSide are not all asserted together."

evidence E11_FIXTURE:
  "An existing scene-beat service fixture with unequal speed reaches the later causal bucket deterministically; a schema-valid but unlisted skill proposal produces a persisted fallback receipt selecting defend without exporting a production helper."

decision D1 based_on P1, E6, E13, TEST_POLICY:
  "Keep the point 6 and point 13 tests unchanged because they already assert their required boundaries directly."

decision D2 based_on E11, E11_FIXTURE, AUTHORITY:
  "Add a later-bucket regression through an existing battle service boundary when a deterministic fixture can reach it, asserting rejection reason, deterministic accepted action, fallback status, and durable receipt; otherwise retain U11 explicitly rather than altering production visibility."

decision D3 based_on E12, TEST_POLICY:
  "Add only missing feasible reason-to-substitute mappings using the existing revalidation API, preserving partial, substitute, and terminal failure distinctions and the original reason receipt."

decision D4 based_on E16, E20, E20_PRIVACY, E21, TEST_POLICY:
  "Strengthen existing regressions to assert semantic and world atomic no-change with a rejected zero-revision semantic receipt and skipped zero-revision world receipt, terminal failed-event narrative with a bounded classified fallbackReason that excludes exception text, and deterministic adjudication reason facts plus engineFallbackSide."

decision D4_CORRECTION based_on E20_PRIVACY, AUTHORITY:
  "Replace narration terminal persistence of arbitrary exception text with a closed bounded failure class while preserving retry count, terminal deterministic narrative, failed-event continuation, and every fallback layer; this is a receipt privacy correction established by direct code evidence, not a new fallback behavior."

decision D5 based_on D1, D2, D3, D4, D4_CORRECTION, AUTHORITY:
  "Record a compact retention matrix linking each point to its preserved contract and test evidence, run focused and full validation plus forbidden-boundary scans, and change no runtime fallback implementation unless a new failing regression independently establishes a defect."

evidence E_FINAL_TESTS:
  "After the changes, the complete shared suite passed 304 of 304, backend passed 294 of 294, frontend passed 20 of 20, deployment passed 3 of 3, and all focused retention suites passed."

evidence E_FINAL_BUILD:
  "Repository typecheck and production build completed successfully; Vite reported only the existing advisory chunk-size warning."

evidence E_FINAL_BOUNDARY:
  "The final diff check passed, no any type, arbitrary Record string boundary, or double cast was added, and the touched narration fallback and public-event boundaries now use narrow or closed types."

decision RESULT based_on D1, D2, D3, D4, D4_CORRECTION, D5, E_FINAL_TESTS, E_FINAL_BUILD, E_FINAL_BOUNDARY:
  "FPR_RETENTION_MATRIX is complete locally: all seven accepted boundaries have direct matrix evidence, missing regressions are present, terminal narration no longer persists or publishes arbitrary exception text, and no fallback layer or adjudication authority changed."
