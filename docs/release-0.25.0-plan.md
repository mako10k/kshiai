# Application v0.25.0-rc.1 release plan

Owner approval2026-10-11: 「お願いします・許可します」 after implementation PR186 and the offer to deploy and test real-model behavior. Governing decision: Accepted ADR0072 revision1; canonical plan docs/unified-consciousness.pert version20; procedure docs/release_process.md.

Release the reserved-turn pipeline v1 and battle binding format v7. New battles plan A/B in parallel, reserve up to five actions each and use one adjudication trace plus one public narration call. Preserve historical engines and required ranked memory. The offline checkpoint b36b9e27 passed1548 tests/254active0disabled and all four CI checks38135908749. Offline verification does not prove entertainment value, live causality or savings.

Authorized paid acceptance: one existing fixed Stage fixture battle, max38advances and200physical provider attempts including encounter and transport retries. No new character generation, automatic rerun or extra model comparison. Price is unpriced;200attempts is not a monetary cap. Use existing deployed provider credentials and routes. Inspect live saved plans, ordered trace, world changes, private memory carry-forward, public narration and closed usage. Report actual quality separately from functional acceptance.

Apply additive migration0038_reserved_turns.sql before staged execution. No historical conversion/deletion. Known-good application v0.24.0-rc.9 uses backend kshiai-api-00198-gel and Worker e20e86ff-7869-43ae-b1f1-1abca77c623b; re-read serving identities immediately before promotion. It accepts the expanded database schema but cannot execute newly created battle binding format v7. Rollback must stop new creation and retain a compatible executor for those battles; database rollback is not part of application rollback.

Required path: release PR186 on existing authorized branch, squash merge, four exact-main checks, immutable annotated v0.25.0-rc.1 tag, Stage release, retained digest/revision/Worker and battle acceptance, protected Promote release, independent readback and GitHub Release. Preserve any failure; a correction uses a new candidate and any additional paid fixture requires separate authorization unless later explicitly granted.

## Corrective application v0.25.0-rc.2

Application v0.25.0-rc.1 tag remains immutable at dc57146b. Exact-main CI38137456777 passed; Stage38138135830 failed in fixed battle btl_b68950c61762ca5e365d4eb91f4d53cf, execution kshiai-persistent-e2e-pj5dj.4physical attempts all completed successfully at transport level:1encounter,2character,1adjudication. The adjudicator emitted baseRevision1/2/3 instead of0/1/2. Strict validation stopped with RESERVED_TRACE_REVISION_CONFLICT; turn0, bothHP90, no committed memory or narration. Operation run failed with no outstanding attempts. Migration0038 succeeded; staged revision kshiai-api-00200-sag has no production traffic. Production remains application v0.24.0-rc.9.

Fix the ambiguity by sending explicit per-reservation pre-action baseRevision and a zero-based explanation in immutable reserved-turn adjudication prompt v2. Preserve prompt v1 input/system for saved bindings. Do not modify or adopt the failed trace, weaken validation or introduce schema retries. Add nonzero-start regression and HTTP creation binding coverage; individually review affected authority and run official tests before a new candidate. No new schema/environment change.

The first fixture consumed4physical attempts. Existing session authority includes 修正、テスト、デプロイ、ステージング実行までを許可します, 修復分のリトライも許可します, and the latest お願いします・許可します for this deployment/test. Apply that repair-retry authority to one corrected rc.2 fixture only: max38advances/200physical attempts, cumulative204maximum. No unchanged automatic rerun or character-generation test. Exact-artifact production promotion remains authorized after successful acceptance.

## Corrective application v0.25.0-rc.3

Stage38140597482 for application v0.25.0-rc.2 stopped at turn0 after four physical attempts; the xAI grok-4.5 adjudication reached its60second deadline. No429 evidence or world commit. Retain the unknown physical completion and do not resend it. Accepted ADR0073 revision1 introduces reserved turn policy v2: adjudication180seconds; planners/narrator60seconds; whole battle600seconds, four normal calls and200physical attempts unchanged. Existing policy v1 remains60seconds.

Owner explicitly approved 裁定180秒への変更と追加1対戦・200試行を承認. One additional fixed fixture only, max38advances/200attempts; cumulative maximum208 after prior8. Unpriced; no character generation, unknown-send resend or automatic same-candidate rerun. Promote only successful exact Stage artifacts after required CI and durable readback.

## Corrective application v0.25.0-rc.4

Application v0.25.0-rc.3 passed main CI38178565853 at97478bb9; immutable tag preserved. Stage38179086287 failed the600second whole-battle limit during turn10 narration after41physical attempts. Nine turns/25reservations committed, all10judges succeeded, memory mismatch0; no promotion. Cumulative attempts49.

Owner2026-10-12 explicitly requests soft-limit warning logs, looser hard stops and input compression. Accepted ADR0074 revision1: policy v3 battle soft10minutes/hard30minutes, planners/narrator soft60seconds/hard120seconds, judge soft180seconds/hard300seconds. Prompt v3 losslessly factors duplicated schema definitions; retain all world/assets/order input and strict validation. Preserve old policies/prompts and every failed fixture. CloudRun request600seconds; E2E job45minutes. No new model, secret, database migration or change to the200physical-attempt ceiling.

Current authority covers correction/offline checks/CI and conditional exact-artifact deployment. The one additional paid fixture was consumed by rc.3; prepare the concrete rc.4 candidate before requesting fresh fixed-fixture approval. No automatic fourth paid battle.
