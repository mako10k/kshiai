domain Cs316CharacterAdapterMigrateSeal:
  description "Decide whether to register only the V2-to-V3 migrate slice of the current character adapter as bounded implementation provenance."

problem P1:
  "Can the current character-v3 adapter source receive a non-draft Seal for its migrate projection and source-ledger boundary without asserting whole-adapter or product migration completion?"

premise AUTHORITY:
  "Accepted character migration requirement v6, ADR-0030, and accepted structured-semantic-authoring design rev6 govern implementation claims. A Seal records provenance, not semantic truth or owner acceptance."

premise SCOPE:
  "This action may add a bounded implementation REF for the existing local source. It does not change code, resume cc304, call a provider, apply a DB migration, or activate V3."

evidence E1:
  "The current adapter decodes schema-2 migrate source at lines 693-713, projects V2 into V3 at lines 396-413 and 1141-1146, builds a claim ledger and source dispositions at lines 1152-1168, handles typed disposition proposals at lines 846-897, and applies V3/final obligation checks at lines 1077-1124."

evidence E2:
  "The focused authoring service binds stored schema-2 source identity, target V3 contract and frozen run input at lines 65-103 and calls the adapter through executeSemanticAuthoringV1 at lines 230-249. This establishes a local consumer, not production cutover."

evidence E3:
  "An individual Luna review identified whole-adapter gaps: revise marks unrelated cluster obligations resolved at character-v3.ts lines 634-641, deferral is rejected at lines 899-907, and progress digest is narrower than the design's general state-progress claim."

evidence E4:
  "The old adapter REF is draft and transitively stale; its existing Causes are implementation contracts only. The accepted design, accepted v6 and ADR-0030 have current exact Seals available for a new downstream Cause chain."

evidence E5:
  "The called character-source-ledger helper splits selectorless V2 norms and creates source claim, exact-copy, disposition and provenance records, but discard-as-nonmaterial always returns unresolved. Capsule retention and generation binding are outside that helper."

evidence E6:
  "The current character-semantic-authoring shared file defines closed candidate operation schemas, target-key identity, bounded skeleton/cluster/ledger payloads and source-disposition decisions used by the focused adapter. An individual Luna review found this typed surface aligns with accepted design rev6 but does not implement discard, deferral or migration completion."

pending U1:
  "End-to-end provider, persistence, activation and actual migrated-character usability are not established by this source review."

pending U2:
  "The whole adapter's revise and deferral semantics remain unresolved and must not inherit this bounded Seal."

pending U3:
  "Discard-as-nonmaterial, owner Q&A and capsule retention are not established by a bounded source-ledger or adapter Seal."

decision D1 based_on P1, AUTHORITY, E1, E2, E3, E4, E5, U1, U2, U3:
  "Register new current-purpose non-draft REF candidates for the helper's V2 claim split and initial exact-copy/provenance ledger, then the adapter's deterministic V2 projection and handoff to that helper, typed preserve/transform handling and V3/final-obligation gate. Require source match, exact accepted Causes, a helper Cause on the adapter, and individual review. Exclude all-disposition or whole-adapter conformance."

decision D2 based_on D1, SCOPE, E3, E5, U1, U2, U3:
  "Keep the old adapter REF draft/stale as historical-purpose evidence and do not promote whole-adapter conformance, revise/deferral/progress behavior, discard, capsule retention, cc304, provider execution, pointer changes, acceptance or product migration from D1. If exact Cause/clauses or source comparison fail, leave the new REF unpublished."

decision D3 based_on AUTHORITY, SCOPE, E6, U1, U2, U3:
  "A separate non-draft current-purpose REF for only the shared character typed contract surface may be published after exact source and Cause comparison and individual candidate review. It must link to accepted design/v6/ADR-0030 and the current V3 schema as a typed dependency, without claiming runtime semantic handling or product migration."
