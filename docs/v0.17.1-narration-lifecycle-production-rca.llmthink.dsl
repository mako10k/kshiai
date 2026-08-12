domain KshiaiNarrationLifecycleProductionRca:
  description |
    Hypothesis-first RCA for the v0.17.1 production narration lifecycle,
    battle UI, history listing, cost boundary, and release acceptance.

problem RCA:
  |
    Why did the v0.17.1 production observation advance canonical turns while
    narration appeared late or out of order, Cloud Tasks multiplied, the UI
    looked inconsistent, one active battle disappeared from history, and LLM
    cost could not be bounded operationally?

premise SAFETY:
  |
    The production narration queue was paused at 2026-08-12T20:59:26+09:00.
    Keep it paused during RCA. Do not create another battle, resume the queue,
    invoke an operator narration endpoint, deploy, or make an LLM call.

premise CONTRACT:
  |
    ADR-0006 intentionally permits canonical turns to advance ahead of
    narration and intentionally publishes terminal prose snapshots instead of
    provider token deltas. Therefore turn lead and absence of token-by-token
    prose are not defects by themselves; lifecycle convergence, logical SSE
    updates, ordered presentation, honest UI state, and bounded cost remain
    required.

premise METHOD:
  |
    Evaluate each hypothesis independently. Distinguish duplicate Cloud Tasks
    wake-up from duplicate provider invocation, and distinguish canonical
    battle status from narration presentation status.

premise H1:
  |
    Hypothesis H1: stale outbox recovery re-arms an already live Cloud Task and
    creates additional delivery generations for the same receipt.

premise H2:
  |
    Hypothesis H2: duplicate wake-up also caused duplicate LLM attempts for the
    same receipt in the observed production battles.

premise H3:
  |
    Hypothesis H3: the task cardinality and handler contract disagree. Every
    receipt owns one task, but the handler processes the battle's oldest
    nonterminal receipt instead of the receipt carried by that task, turning
    later tasks into lease-conflict retries and Cloud Tasks backoff.

premise H4:
  |
    Hypothesis H4: narration SSE is implemented as finite replay polling, not a
    request that waits briefly for a new durable event, so the UI receives no
    live incremental response and reconnects by polling full response bodies.

premise H5:
  |
    Hypothesis H5: the battle UI renders canonical progress, legacy advance
    phase state, completed presentation blocks, every pending receipt, and the
    result independently instead of reducing them into one sequence-owned
    presentation timeline.

premise H6:
  |
    Hypothesis H6: the missing active history row is caused by a saved battle
    snapshot that violates the BattleState schema and is silently skipped by
    the list projection.

premise H7:
  |
    Hypothesis H7: release and observation acceptance tested queue reachability
    and canonical battle completion but did not require ordered worker
    convergence, one provider attempt per receipt, queue drain, SSE delivery,
    history visibility, or UI order.

premise H8:
  |
    Hypothesis H8: narration cost telemetry is insufficient for a production
    budget because successful adapter usage records null tokens and null cost,
    while queue delivery generations and 503 dispatches are counted separately
    from provider attempts.

premise H9:
  |
    Hypothesis H9: the dominant observed LLM cost was the intended per-turn
    fan-out across character expression, selected deep psyche and environment
    work, and narration, rather than provider retries caused by duplicate
    narration tasks.

premise H10:
  |
    Hypothesis H10: the four environment proposals used the expensive engine
    tier during the observed battle.

evidence E1:
  |
    The observed finished battle btl_444ad43e0abfcf9d5789cabef8821549
    committed 14 ordered narration receipts. Before convergence, outbox rows
    reached delivery generations 0 through 3 and delivery_attempts 1 through 4.
    Cloud Tasks listed multiple live tasks for those generations and request
    logs showed many 503 responses interleaved with 200 responses.

evidence E2:
  |
    recoverStaleNarrationOutbox resets a dispatched outbox when its entry has
    remained queued past five minutes. It cannot ask Cloud Tasks whether the
    previous generation still exists. wakeNarrationTasks runs after every
    advance and every Cloud Run instance startup calls the same global recovery
    before dispatch. Recovery is not scoped to the battle that caused the wake,
    so activity from one battle can re-arm stale outboxes from another.

evidence E3:
  |
    The production read-only snapshot after queue pause contained 22 narration
    entries, 22 claimed attempts, and 22 attempt rows; zero entries had
    attempt_count greater than one. The observed finished battle had 14 entries
    and 14 attempts. Duplicate wake-up did not become duplicate provider
    invocation in this observation.

evidence E4:
  |
    The Cloud Task body contains battleId, receiptId, outboxId, and generation,
    but the route calls processNextNarration with only battleId. The worker then
    SELECTs the oldest queued or generating entry. It does not verify that the
    claimed receipt equals the task receipt and the route does not terminally
    acknowledge a task whose own receipt already completed.

evidence E5:
  |
    The route derives ownerId only from outboxId. Delivery generation is absent.
    Different generation tasks for one outbox therefore share a lease owner and
    may reacquire the same battle lease while one another is active because the
    lease upsert allows the same owner. Fencing prevents stale terminal writes,
    but it does not prevent the external provider call that happens after a
    later fence has been issued.

evidence E6:
  |
    The production observation completed receipts in strict sequence but often
    about 60 to 80 seconds apart even though recorded provider elapsed time was
    2.4 to 5.3 seconds. The excess delay is consistent with task conflicts and
    retry backoff, not provider latency.

evidence E7:
  |
    GET narration/follow reads currently persisted events once, serializes a
    finite response, appends a reconnect comment, and closes. The frontend
    waits for response.text before reducing any event and repeats this call on
    a 1.5 second timer. There is no server-side bounded wait for an event and no
    incremental reader in followBattleNarration.

evidence E8:
  |
    ADR-0006 explicitly chose terminal-only public prose. The frontend still
    has streamDraft and PHASE_LABEL values including narrating from the legacy
    advance stream, while the backend intentionally forwards only phase events
    and no narrator prose. The UI can therefore say that the current advance is
    narrating even though narration belongs to the separate durable queue.

evidence E9:
  |
    BattlePage renders completed battle.log blocks first, then one current
    streamDraft, then all queued or generating narration placeholders. It also
    renders the canonical Result panel as soon as BattleState.status is
    finished. It does not interleave terminal blocks and placeholders by one
    narration sequence and does not delay or annotate presentation completion.

evidence E10:
  |
    A read-only production reproduction found the recent active battle absent
    from both status=all and status=active list projections. Its persisted
    snapshot fails BattleStateSchema only at agentStateA.currentGoal because the
    string is longer than 240 characters. listBattlesForUser catches the parse
    failure and skips the entire row.

evidence E11:
  |
    Resolved reflect input permits reflectionGuideline up to 400 characters.
    applyReflectMemoryWrites assigns guideline directly to currentGoal, whose
    CharacterAgentState schema maximum is 240. It bounds currentConcern but not
    currentGoal. This creates the exact persisted schema violation found in the
    missing active battle.

evidence E12:
  |
    Stage creates a smoke task whose smokeId route returns 200 without creating
    an outbox, acquiring a lease, selecting a receipt, calling the generator,
    writing a presentation, or following SSE. The observer declares success
    when the canonical battle is finished and persistedBattle.log is nonempty;
    it does not wait for all narration entries to become terminal or the queue
    to converge.

evidence E13:
  |
    createLlmNarrationGenerator returns tokenCount null and estimatedCostUsd
    null for successful narration. Internal observability can expose these
    columns but cannot derive an exact narration token or dollar total from the
    observed run. Queue dispatch attempts and delivery generations also do not
    represent provider calls.

evidence E14:
  |
    Cloud Logging recorded two new production service instances starting at
    2026-08-12T11:50:02Z. Each startup runs global outbox recovery. The recovery
    query tests entry age but not dispatched_at age; after one startup re-arms
    and dispatches an old entry, another startup can immediately re-arm it again
    because the entry updated_at remains old. This is a scale-out amplification
    loop, not just one battle's retry.

evidence E15:
  |
    A hypothesis-driven read-only scan of 157 retained battles found two raw
    invalid active snapshots: one general-account battle with the confirmed
    overlong currentGoal, and one E2E legacy row with a consequence-receipt
    shape mismatch. Both are candidates for silent omission because the list
    projection catches parse failure and continues.

evidence E16:
  |
    The 12-turn observation battle retained 13 fulfilled character-expression
    invocations for each side, one fulfilled prologue deep-psyche invocation for
    each side and 12 skipped normal-turn psyche stages, four successful
    environment proposal receipts, and 14 completed narration attempts. Battle
    creation also invoked one encounter preparation and the turn limit invoked
    one referee. This is at least 48 successful application-level LLM operations
    for one synthetic battle before any adapter-level retry. Six more narration
    receipts from a concurrently active user battle also completed during the
    queue drain.

evidence E17:
  |
    Provider routing assigns encounter preparation, character expression, deep
    psyche, environment proposals, and narration to the fast tier. The observed
    turn-limit referee alone used the engine tier, once. Its result cannot select
    the canonical winner: buildBattleAdjudication pins winnerSide to the
    deterministic engine winner and consumes the referee only as explanatory
    reason and reasonFacts.

decision D1 based_on RCA, METHOD, H1, E1, E2, E14:
  |
    H1 is supported. Recovery uses age as a proxy for task loss even when the
    task is visibly alive and retrying. Per-advance and per-instance global
    scans amplify one another, and delivery generations multiplied wake tasks
    for the same receipt.

decision D2 based_on H2, E3:
  |
    H2 is rejected for the observed production data. Wake-up duplication did
    not produce a second provider attempt for any receipt. Do not report task
    dispatch count as LLM invocation count.

decision D3 based_on H3, E4, E6:
  |
    H3 is supported. The unit of delivery is a receipt but the unit of worker
    selection is a battle. Later receipt tasks contend for the same oldest item
    and intentionally return 503, letting Cloud Tasks backoff become the serial
    scheduler. This caused most of the narration latency and task churn.

decision D4 based_on E5:
  |
    A latent duplicate-provider risk remains even though H2 was not observed.
    Lease identity must include delivery generation or a unique task execution
    identity, and a worker must transactionally claim the exact receipt before
    any provider call. Same-owner lease reacquisition must not fence a live
    invocation behind its back.

decision D5 based_on H4, E7, CONTRACT:
  |
    H4 is supported as a transport and UX mismatch. Terminal-only prose is the
    accepted contract, but logical SSE should incrementally deliver durable
    status and terminal snapshots over a bounded physical request. Current code
    performs short polling disguised as SSE and buffers every response in the
    frontend.

decision D6 based_on H5, E8, E9, CONTRACT:
  |
    H5 is supported. The UI retained legacy advance-narration concepts and does
    not own a single sequence reducer for presentation. Canonical completion
    and presentation completion require separate, explicitly labelled state.

decision D7 based_on H6, E10, E11, E15:
  |
    H6 is supported with a concrete cause. Reflect writes an allowed 400
    character guideline into a 240 character currentGoal. The list projection
    silently drops the invalid battle instead of returning a degraded row or an
    explicit error.

decision D8 based_on H7, E12:
  |
    H7 is supported. Release acceptance proved OIDC reachability only, and the
    observation proved gameplay completion with some narration. Neither proved
    the lifecycle property that failed in production.

decision D9 based_on H8, E13:
  |
    H8 is supported. The system had attempt ceilings but no trustworthy
    production token or cost ledger, no run-level budget rejection, and no
    kill switch in the observation workflow. Queue pause was the first reliable
    operational stop.

decision D10 based_on H9, E3, E16:
  |
    H9 is supported. The observed cost growth is primarily explained by a large
    intended fan-out: at least 48 successful LLM operations for the synthetic
    battle, plus narration from a concurrent active battle. The observed
    narration receipts were not provider-retried. Task multiplication remains
    a correctness and latent cost risk, but it is not the measured main cost
    multiplier in this run.

decision D11 based_on H10, E17:
  |
    H10 is rejected. All four environment proposals used the fast tier. The
    only observed engine-tier operation was one referee call, and it provided
    explanation rather than canonical authority. Route that explanation through
    the fast tier and retain the deterministic fallback.

decision FIX1 based_on D3, D4, D1:
  |
    Redesign delivery as exact-receipt execution. One task may claim only its
    own receipt after verifying battleId, receiptId, outboxId, delivery
    generation, nonterminal status, predecessor terminality, and a unique
    fencing owner. A completed or superseded receipt returns 200. An
    out-of-order but live receipt uses bounded rescheduling without provider
    work; it does not use repeated 503 contention as normal scheduling.

decision FIX2 based_on D1, FIX1, E14:
  |
    Stop re-arming solely from DB age. Track an explicit delivery lease or task
    acknowledgement deadline, record the active generation, and reconcile only
    after the generation is terminal, exhausted, or explicitly missing. Make
    recovery a singleton or transactionally claimed operation rather than an
    every-instance startup side effect. Ensure one live generation per receipt
    and terminally close its outbox when the receipt commits.

decision FIX3 based_on D5, D6:
  |
    Replace the client presentation path with one sequence reducer that joins
    terminal and nonterminal narration entries in sequence. Remove legacy
    narrating and narrator draft handling from advance SSE. Implement a bounded
    follow request that flushes existing events immediately, waits briefly for
    one new durable event or heartbeat, then closes; read it incrementally with
    refreshed bearer credentials and reconnect cursor.

decision FIX4 based_on D6:
  |
    Keep canonical turn lead, but show two separate indicators: current
    canonical turn or result, and narrated-through sequence or turn. Place the
    canonical result after the ordered story lane or label it as mechanically
    decided while narration remains pending. Never append all pending blocks
    after completed blocks without sequence ownership.

decision FIX5 based_on D7:
  |
    Bound reflectionGuideline to the currentGoal schema at the write boundary
    and validate BattleState before every persistence commit. The history list
    must project required fields directly from safe columns or return a
    degraded row with a diagnostic flag; it must not silently omit a battle
    because unrelated private state is invalid. Repair the affected persisted
    battle only through an explicit owner-approved migration or safe read-time
    compatibility rule.

decision FIX6 based_on D8, D9:
  |
    Replace the Stage smoke with an LLM-free exact-receipt worker fixture that
    covers outbox, task, fence, terminal presentation, SSE cursor, and cleanup.
    Production observation acceptance must wait for every expected receipt to
    become terminal, assert one provider attempt per receipt, assert no live
    task or newer delivery generation remains, verify history visibility and
    ordered UI projection, and record calls, tokens, cost, latency, and fallback.
    Add a per-run cost and attempt ceiling plus an operator pause before any new
    observation is authorized.

decision FIX7 based_on D10, D9:
  |
    Reduce the baseline call fan-out independently of task correctness. Record
    and enforce an observation-wide provider-operation ceiling before battle
    creation, expose projected and actual calls by layer, stop auto-advance
    before the ceiling, and prefer deterministic or explicitly accepted light
    routes where layer separation is preserved. Do not merge deep psyche,
    expression, narration, and canonical adjudication into one prompt merely to
    save calls.

decision FIX8 based_on D11, D9:
  |
    Route referee rationale through the fast tier. Preserve the isolated referee
    context, bounded canonical inputs, deterministic winner authority, timeout,
    and fallback. Verify tier selection with a provider-stub regression test so
    no LLM is invoked. Reconsider a deterministic rationale in a later measured
    cost slice if the fast call still lacks sufficient value.

decision ORDER based_on SAFETY, FIX1, FIX2, FIX3, FIX4, FIX5, FIX6, FIX7, FIX8:
  |
    Keep production queue paused. First make battle history fail visible and
    repair schema-boundary validation without invoking an LLM. Second correct
    exact-receipt task lifecycle and prove no duplicate provider work with a
    stub. Third replace the frontend sequence and SSE contracts. Fourth close
    telemetry and release acceptance. Only then request owner approval for a
    staged LLM-free proof, queue resume, deployment, or another observation.

pending P2:
  |
    Decide whether terminal mechanical result is shown immediately above the
    story lane or held in an explicitly labelled pending-narration result block.
    Canonical settlement itself remains immediate.

pending P3:
  |
    Choose the source of exact token and price evidence for each provider call,
    including conservative accounting when a provider omits usage.
