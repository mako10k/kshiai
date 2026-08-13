domain KshiaiV0173ProviderOperationAccountingRca:
  description |
    Hypothesis-first analysis of the v0.17.3 observation operation-accounting
    gap. Separate functional battle success, logical provider operations,
    physical HTTP attempts, retries, tokens, cost, and admission projections.

problem RCA:
  |
    Why did the v0.17.3 bounded production observation complete normally and
    log 58 successful LLM operations while durable observation data reported
    zero narration HTTP attempts and its projected layer budget omitted calls
    that occurred? What must change before another paid observation can be
    accepted as cost-bounded evidence?

premise SAFETY:
  |
    Do not run another production battle, raise the approved ceiling, deploy,
    or invoke an LLM while analyzing or repairing accounting. The current
    observation task remains suspended until local and Stage acceptance pass.

premise UNITS:
  |
    Treat an application operation, a logical provider call, a physical HTTP
    attempt, an adapter retry, tokens, and estimated cost as distinct units.
    Cloud Tasks delivery attempts and narration receipt attempt_count are also
    separate and must not be substituted for provider HTTP attempts.

premise AUTHORITY:
  |
    Cloud logs are diagnostic evidence. A runtime ceiling requires durable,
    correlated accounting at the provider-attempt boundary and an atomic
    reservation before each outbound attempt. A projection is admission
    evidence only and cannot prove actual consumption.

premise H1:
  |
    Hypothesis H1: narration actuals are reported as zero because terminal
    narration entries clear active_attempt_id, while internal observability
    joins battle_narration_attempts only through active_attempt_id.

premise H2:
  |
    Hypothesis H2: fixing the terminal-attempt join is sufficient to make the
    narration HTTP-attempt count exact.

premise H3:
  |
    Hypothesis H3: the preflight projection is an accurate conservative upper
    bound for every provider layer exercised by the observation workflow.

premise H4:
  |
    Hypothesis H4: the existing success logs can serve as the authoritative
    actual-operation ledger for enforcing the approved ceiling.

evidence E1:
  |
    Production observation github-31653257074-1 on v0.17.3 revision
    kshiai-api-00088-guy finished battle
    btl_bdc8bd7c4df5c9766dbb68a4b86a7419 at turn 9. Eleven narration receipts
    were terminal, contiguous, unblocked, unleased, and each had
    attempt_count=1. History visibility and ordered projection passed.

evidence E2:
  |
    Revision logs for the bounded observation window contain 58 successful LLM
    operation completions and no logged provider failure or retry. They include
    eleven narration operations, four advanceCharacterPsyche operations, one
    concretizeBattlefield operation, and one prepareBattleEncounter operation.

evidence E3:
  |
    processNextNarration writes generated.httpAttempts to the claimed
    battle_narration_attempts row. On successful commit it then sets the
    terminal battle_narration_entries row active_attempt_id to NULL.

evidence E4:
  |
    inspectInternalBattleObservation obtains latestAttempt through the internal
    observation API. That API LEFT JOINs battle_narration_attempts only where
    attempt.attempt_id equals entry.active_attempt_id. A successfully completed
    entry therefore has no joined attempt even though its immutable attempt row
    remains retained, and the observer reduces the missing value to zero.

evidence E5:
  |
    createLlmNarrationGenerator always returns httpAttempts=1 after an LLM
    method succeeds. OpenAiCompatibleProvider performs bounded same-provider
    retries inside retryLlmProviderCall, but LlmProvider results do not expose
    retry or physical-attempt metadata. The generator also ignores the supplied
    remainingHttpAttempts context. A successful call after an internal retry
    would still be recorded as one narration HTTP attempt and could not stop at
    the remaining physical-attempt boundary.

evidence E6:
  |
    projectObservationProviderOperations hard-codes encounter=1 and
    deepPsyche=0. The observed workflow executed both battlefield
    concretization and encounter preparation and executed four deep-psyche
    calls. The projection is not derived from a revisioned pipeline operation
    plan and has no completeness check against provider methods.

evidence E7:
  |
    The durable observation marks only narration as actualMeasured and states
    that every other layer remains bounded by projection. No durable row binds
    each provider operation or physical attempt to the observation run, battle,
    layer, operation name, model tier, retry ordinal, outcome, tokens, or cost.

evidence E8:
  |
    Current [llm] success and retry log messages include provider, operation
    label, model, and elapsed time, but they do not include observation run ID,
    battle ID, logical call ID, or physical attempt ordinal. Time-window log
    counting reconstructed this run after the fact but cannot atomically reject
    a call before an approved run ceiling is exceeded.

decision D1 based_on H1, E3, E4, E1:
  |
    H1 is supported. The zero narration actual is a deterministic read-model
    bug: terminal success deliberately clears the active pointer, but the
    observability query mistakes that pointer for durable latest-attempt
    identity.

decision D2 based_on H2, E5:
  |
    H2 is rejected. Joining the retained terminal attempt will recover the
    application-reported value for narration, but that value still hard-codes
    one and undercounts any physical retries hidden inside the provider
    adapter.

decision D3 based_on H3, E2, E6, UNITS:
  |
    H3 is rejected. The projected total happened to exceed the reconstructed
    actual total in this run, but two layer assumptions were already false.
    Being below the aggregate ceiling does not validate a layer-incomplete
    projection or prove that a future run will stop before overspend.

decision D4 based_on H4, E7, E8, AUTHORITY:
  |
    H4 is rejected. Logs confirmed functional success and exposed the
    discrepancy, but they are neither complete run-bound accounting nor an
    enforcement point. They remain a diagnostic cross-check only.

decision SCOPE based_on RCA, E1, E2, D1, D2, D3, D4:
  |
    The observation is accepted as one functional lifecycle success and
    rejected as acceptance-grade cost telemetry. Do not reinterpret this
    accounting defect as a battle failure, and do not resume paid observation
    merely by increasing the ceiling.

decision FIX1 based_on D1:
  |
    Correct the internal narration read model to select the latest retained
    attempt per receipt independently of active_attempt_id, ordered by
    started_at and a stable attempt identity. Separately aggregate all retained
    attempt rows per receipt for actual HTTP attempts, tokens, and cost; never
    derive totals from latestAttempt alone because abandoned or failed prior
    attempts also consumed budget. Keep active_attempt_id only as ownership of
    current work. Add regressions where successful completion clears the active
    pointer and where an earlier abandoned attempt plus a later terminal
    attempt both remain in the aggregate.

decision FIX2 based_on D3, E6, UNITS:
  |
    Define a revisioned exhaustive taxonomy mapping every battle provider
    operation to one layer. Derive the preflight projection from the workflow
    phase plan and feature flags, including battlefield concretization,
    encounter preparation, prologue and aftermath deep psyche, conditional
    environment work, narration, and referee. Test completeness against the
    provider-operation registry. A conservative projection remains an
    admission guard, not an actual ledger.

decision FIX3 based_on D2, D4, AUTHORITY:
  |
    Before implementation, accept an ADR for provider-operation ownership,
    correlation, persistence, retry boundaries, privacy, retention, and
    migration. At the common provider transport boundary, record one durable
    event for every physical outbound attempt with observationRunId, battleId,
    logicalCallId, layer, operation, provider, model tier, attempt ordinal,
    outcome, elapsed time, and available usage. Do not persist prompts,
    responses, private character state, or secrets in this ledger.

decision FIX4 based_on FIX3, AUTHORITY:
  |
    Enforce the actual ceiling with an atomic reservation before each physical
    provider attempt. Use an idempotent key of logicalCallId plus attempt
    ordinal, reject an unbound or unclassified attempt, and stop before the
    reservation would exceed the approved run ceiling. Record completion or
    failure after the external call without releasing consumed attempt count.
    Missing token or price metadata stays unknown and receives a separately
    approved conservative bound; it must not be rewritten as zero.

decision FIX5 based_on FIX1, FIX2, FIX3, FIX4, SCOPE:
  |
    Observation acceptance must prove that the exact run and battle are bound
    before creation, every provider attempt is classified, all logical calls
    and narration receipts are terminal, ledger totals equal the sum by layer,
    narration receipt accounting agrees with the provider ledger, actual
    attempts do not exceed the reservation ceiling, and no unknown usage is
    presented as zero. Logs may independently cross-check the durable result.

decision TESTS based_on FIX1, FIX2, FIX3, FIX4, FIX5, SAFETY:
  |
    Validate without a live LLM: first add a terminal-attempt query regression;
    then exercise projection completeness for prologue, combat, judgment, and
    aftermath; then use an injected fake transport that succeeds, retries, and
    fails to prove one reservation per physical attempt and fail-closed
    exhaustion. Stage must run the exact receipt and ledger fixture with no
    provider call before any release or production observation is considered.

decision ORDER based_on SAFETY, FIX1, FIX2, FIX3, FIX4, FIX5, TESTS:
  |
    Keep observation suspended. Apply the narrow terminal-attempt read fix and
    projection taxonomy first. Record and accept the provider-ledger ADR before
    adding durable state or changing retry ownership. Implement reservation and
    acceptance gates behind fake-transport tests, pass full local validation,
    then pass the LLM-free Stage fixture. A release and one new bounded
    production observation each require a later explicit decision.

pending P1:
  |
    Choose conservative token and price bounds for providers that omit usage or
    for calls that fail after partial consumption. Operation count can be exact
    independently, but cost acceptance cannot treat unknown usage as zero.

pending P2:
  |
    Decide whether the first ADR and migration cover only battle-scoped calls
    or a reusable application-wide provider ledger. The initial acceptance
    gate must not delay battle correlation by requiring unrelated feature
    migration.
