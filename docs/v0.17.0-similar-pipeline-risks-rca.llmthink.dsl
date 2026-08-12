domain KshiaiSimilarPipelineRisksRca:
  description "Root-cause analysis of durable pipeline risks after v0.17.0"

problem RCA2:
  |
    Why can durable battle and narration work still be lost, duplicated, or
    observed against the wrong comparison basis after the first RCA fixes?
    Scope: narration outbox recovery, battle lease ownership, battle-create
    idempotency, causal narration projection, and release observability.

evidence OUTBOX1:
  |
    dispatchNarrationOutbox marks a row dispatched immediately after Cloud
    Tasks accepts it. Startup and mutation recovery select only outbox rows
    whose status is pending. A queued or expired-generating narration entry has
    no path that changes its already-dispatched outbox row back to pending.

decision RC_OUTBOX based_on RCA2, OUTBOX1:
  |
    The durable boundary tracks enqueue acceptance, but not completion of the
    downstream work. Cloud Tasks exhaustion or task loss therefore removes the
    only wake signal while canonical narration remains nonterminal.

decision FIX_OUTBOX based_on RC_OUTBOX:
  |
    Reconcile nonterminal entries with their outbox before dispatch. Reset a
    dispatched outbox only when the entry is queued and stale, or generating
    with an expired lease, and enforce a bounded recovery delay. Admin output
    must expose outbox status, attempts, and staleness. Tests cover exhausted
    delivery, active lease exclusion, and idempotent re-enqueue.

evidence LEASE1:
  |
    withBattleLease owns only a random owner ID. Its heartbeat logs rejected or
    failed renewal and allows the callback to continue. Intermediate battle
    saves keep the same battle revision, so a stale owner can still overwrite a
    checkpoint before either contender performs the final revision increment.

decision RC_LEASE based_on RCA2, LEASE1:
  |
    The lease is advisory rather than a write fence. Final revision CAS prevents
    two terminal commits but does not protect same-revision checkpoints or
    external LLM work after ownership loss.

decision FIX_LEASE based_on RC_LEASE:
  |
    Add a monotonic battle fencing token. Bind the active token to every battle
    checkpoint and final write, reject stale tokens in SQL, and abort the
    callback after heartbeat ownership loss. Preserve a compatibility path for
    non-advance writes that do not hold the battle lease.

evidence CREATE1:
  |
    POST /battles creates a random battle ID and commits the battle before a
    separate completeIdempotentRequest update. If completion fails, takeover of
    the expired processing key repeats battlefield and encounter generation and
    commits another random battle.

decision RC_CREATE based_on RCA2, CREATE1:
  |
    The idempotency record has no durable correlation to the created resource.
    Request ownership protects only the pre-commit interval.

decision FIX_CREATE based_on RC_CREATE:
  |
    Derive the battle ID from the stable idempotency operation identity and pass
    it into startBattle. Treat an existing matching battle as committed
    readback, and fail closed on mismatched ownership or input. A response-loss
    regression must prove one battle and no repeated LLM call.

evidence PROJECTION1:
  |
    A focused reproduction compared turn-start and post-bucket mechanical
    states. buildGuardedNarrationCausalProjection produced the same committed
    mechanical chains because they come from explicit mechanicalEvidence, not
    inferred state delta; semantic state is not mutated until reconciliation.

decision REJECT_PROJECTION_RISK based_on RCA2, PROJECTION1:
  |
    The suspected projection defect is not present under the current explicit
    evidence and semantic timing contracts. Do not change this consumer without
    a failing fixture; retain this result as a rejected hypothesis.

evidence RELEASE1:
  |
    Internal observability joins narration entries, leases, and attempts but not
    outbox rows. Stage verifies only that the queue is RUNNING and does not prove
    OIDC enqueue, worker execution, or terminal narration delivery.

decision RC_RELEASE based_on RCA2, RELEASE1:
  |
    Deployment acceptance checks resource existence rather than the end-to-end
    property that failed in production, and operators cannot distinguish
    pending, dispatched, or abandoned wake-up state.

decision FIX_RELEASE based_on RC_RELEASE:
  |
    Add sanitized outbox fields to internal observability and a staging smoke
    that creates an isolated receipt/outbox, dispatches it through Cloud Tasks,
    and waits for a terminal event without invoking gameplay. The fixture must
    be bounded, identifiable, and cleaned up.

decision ORDER based_on FIX_OUTBOX, FIX_LEASE, FIX_CREATE, REJECT_PROJECTION_RISK, FIX_RELEASE:
  |
    Implement outbox recovery first, then write fencing and create idempotency,
    then the shared projection basis, and finally observability and staging
    proof. Do not deploy or run a production observation in this change.
