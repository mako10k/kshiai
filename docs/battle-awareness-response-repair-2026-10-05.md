# Consciousness pipeline awareness-v5: response and physical completion repair

Owner authorization: 2026-10-05「では、それをお願いします」 to the proposed response-format and reservation-release repair. Governing sources: ADR0051 (durable actual usage, no automatic retry/fallback, inherited logical/physical distinction), ADR0050 inherited strict action contracts and immutable prompt bindings, and the long-timeout observation. This is an implementation correction within those outcomes, not a battle-rule or output-schema revision.

## Requirements and completion

Transmit the existing CharacterActionIntentSchema accurately. Physical completion observed before JSON/schema rejection releases physical concurrency while monetary cost stays unknown. Unconfirmed timeout/network failure retains its slot. Late completed thoughts release slots without changing terminal world state. Existing prompt bindings retain their original text; new battles bind awareness-prompt-v2, while output remains awareness-output-v1. No paid request, retry, model change, old trial-contract change, retrospective scratch-DB modification, or deployment.

## Basic design

A pure prose output-contract renderer owns intent-form guidance. Prompt preparation selects the immutable revision; model provider, dispatch admission and digest verification receive the same revision from persisted runtime. SDK usage observation owns evidence that a complete response was received. An invocation-local completion scope exposes that evidence to the execution factory without coupling SDK adapters to battle storage. The factory converts postresponse rejection into a typed error carrying only physical completion; execution settles the reservation and records logical failure separately.

## Detailed design

Completion observation uses AsyncLocalStorage with counts of started and observed-completed attempts. Only observed complete response increments completed, including missing usage. A scope is closed only with at least one started attempt and all started attempts completed. Parallel invocations use separate cells; calls without scope retain existing behavior. Mark before usage-write/parse so persistence or JSON errors do not masquerade as ongoing remote inference. An error from a closed scope becomes LlmPhysicalCompletionError retaining original cause/message. Unknown transport errors stay unchanged. No SDK exception or logical abort is by itself proof of remote completion.

Execution failure handlers use this typed evidence; unknown actualUsd remains null. Existing atomic storage settlement and generation fences apply. Cancelled or expired logical thoughts never apply to canonical state. New prompt renderer has typed examples validated against the authoritative schema and no duplicate permissive schema. Prompt revision is propagated independently from output revision and immutable policy revision.

## Evidence and causal limits

The observed slot leak is explained by execution's unconditional physicalClosed=false rejection settlements despite durable completed SDK records. Postresponse schema validation throws before factory can return the success receipt. This producing code condition is established by inspection and will be reproduced offline. The prompt says preserve offered structure while availableActions and CharacterActionIntent differ; this communication gap is established, but why the particular model returned a string remains unknown. Alternative explanations include model nonadherence/context effects and generation truncation; raw model output was not retained.

Review subject: this repair implementation against the requirements above. INSIDE: exact output contract, completion evidence and conservative unknown failures, immutable revision routing, no type escapes. OUTSIDE: production model latency tuning, token-budget reduction, another paid trial, monetary pricing, owner-held cutover contracts. No disputed external behavior is selected here.

Validation: strict TypeScript, meaningful offline SDK→usage→provider→execution/SQLite checks for valid output, schema/JSON refusal, timeout with late closure, concurrent scope isolation, cancellation and restart; existing tests. Relevant direct checks then one full test/typecheck/build. Parent awareness-verify remains incomplete until its own acceptance obligations hold.

## Bounded related-path check

Creation dispatch already sets physicallyClosed inside its guard immediately after the physical send returns, before the provider's JSON/domain parsing; that postresponse path does not have the same schema-refusal leak. Narration did have the same condition: physicalFinished was set only after validated provider resolution, and its late rejection callback discarded completion evidence. Apply the same observed-response scope around narration invocation and close its slot on immediate or late typed completion rejection. Preserve failed/no fabricated narration and unknown cost. Transport errors remain outstanding. No retrospective data migration.

The battle binding format v5 manifest's promptRevision validator must enumerate awareness-prompt-v1 and awareness-prompt-v2; allowing v2 in the stored binding is necessary for the owner-authorized prompt repair. Unknown versions remain rejected. The initial integration test caught the omitted literal update; it was fixed before final acceptance.

Offline timing observation: after the first 67 passing checks, another SDK-fixture happy-path run reached `AWARENESS_WORLD_COMMIT_DEADLINE` because its next timestamp (`updatedAt=10:52:47.576Z`) was earlier than runtime startedAt (`10:52:48.199Z`) and prologue commit (`10:52:48.552Z`). This was a backwards host wall-clock observation, not provider latency exceeding the ten-minute policy. Keep production's existing refusal intact. The test-only HTTP preloader now supplies Date.now from its initial epoch plus monotonic elapsed time so normal elapsed-time fixtures are deterministic; explicit backwards-clock tests remain outside that fixture and keep their coverage. The underlying host clock cause is unknown and no clock service/system setting was modified.

## Completed verification

Owner-authorized correction implemented. Relevant offline tests: 88 distinct tests passed across strict request/provider/admission/output-contract, shared battle binding, actual SDK usage observation, execution, creation, narration and isolated harness checks. The old unconditional rejection settlement failed the new reproduction test; corrected implementation passed. The related narration immediate/late rejection paths passed their tests and SDK fixture integration. An independent mode=ro SQLite readback matched SDK completed5, runtime incomplete0tick, physicalOutstanding0, unknown-cost5, both thoughts cancelled/physical finished. The real paid trial databases were not changed.

Full npm test: 163 passed, 2 unchanged owner-held cutover contract failures. All-workspace typecheck and full build succeeded; the final changed backend build succeeded. Diff whitespace check passed. Frontend bundle-size warning persists unchanged. Review found the required manifest revision update after integration evidence; final manifest accepts old/new and rejects unknown versions. Host backward-clock guard remains a separate unchanged production behavior.

Natural prose input remains unchanged, and prompt revision awareness-prompt-v2 adds 1,235 Unicode characters (including separator) on subconscious and 1,204 on conscious. These are instruction characters, not provider-reported tokens; no new input-token consumption estimate is asserted. Real model adherence and real postrepair timing remain unverified because no new paid call was made.

For this repair task remaining work is zero. Parent awareness-verify remains open: owner-held cutover contract decisions and real full-path acceptance are not supplied by these offline checks. The next measurement candidate is the same fixed isolated three-tick trial with the already prepared long-timeout policy, verifying actual result acceptance, late merge, narration and usage/slot consistency. Its internal preparation/measurement/readback estimate is 15–30 minutes (agent estimate, low confidence); failures may add corrective work. A new paid run requires separate owner authorization.

[Structured verification evidence](evidence/awareness-response-completion-repair-2026-10-05.json)

PERT response-completion-repair completed at 2026-10-05 19:57:12 JST. Measured main-agent task interval: 19:40:41–19:57:12, 16m31s / 0.275278h; preparatory discovery before task start and separately delegated agent effort are excluded. Finish actual recorded through perttool; check, dependency/resource schedule both and next rerun. observe-velocity rerun has missing_baseline for the uncommitted new task; recorded interval is not an accepted project velocity. Reobserve at the next owner-authorized history/synchronization checkpoint. Parent verification stays open. Last backend typecheck also passed after final test fixture changes.
