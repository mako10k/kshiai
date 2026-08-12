domain KshiaiV017ObservationRca:
  description "Root-cause analysis of the first v0.17.0 production observation"

problem RCA1:
  |
    Production observation run 31587008863 stopped on the first combat turn.
    The correction must preserve fail-closed causal validation, sequential
    bucket durability, narration independence, and the one-observation limit.

evidence OBS1:
  |
    Cloud Run execution kshiai-persistent-e2e-ns7gj created battle
    btl_cce692455ac46d05dac86cbf under revision kshiai-api-00082-ceg and the
    frozen pacing-candidate-12-v2 policy. It completed prologue advance 1 and
    combat advance 2, then exited without starting advance 3.

evidence OBS2:
  |
    Turn 1 committed initiative scores A=14 and B=9 as sequential buckets A
    then B. The later B decision cites sourceBucketIndex 0 and used the fast
    model once before deterministic fallback rejected an unavailable weapon.

evidence OBS3:
  |
    Turn 1 mechanical evidence and the A action receipt own mp=-4 and focus=+4.
    The persisted turn record instead has empty sideAChange.parameterChanges.
    BattlePublic validation therefore rejected absent owned deltas a.mp and
    a.focus and correctly failed closed.

evidence OBS4:
  |
    During sequential orchestration battle-service materializes the committed
    bucket boundary into the mutable state variable. It later passes that
    boundary-derived state as advanceCharacterAgents.before. The turn record
    compares the final state against a post-bucket state although accumulated
    mechanical evidence still begins at the real turn start.

decision RC_RECEIPT based_on RCA1, OBS3, OBS4:
  |
    The receipt failure is not a bad validator or an LLM error. The root cause
    is loss of the durable turn-start comparison basis across bucket commits.
    Relaxing receipt validation or deleting evidence would conceal corruption.

decision FIX_RECEIPT based_on RC_RECEIPT:
  |
    Carry an immutable turn-start mechanical snapshot in the restartable engine
    continuation and reconstruct the record comparison basis from it at final
    assembly. Add a regression that resumes after the first bucket and proves
    side changes equal the sum of source-owned receipt deltas.

evidence OBS5:
  |
    The same battle has ordered prologue and combat narration entries and
    public queued events. Both remain queued with attempt_count=0 and there are
    no battle_narration_attempts after the observation completed.

evidence OBS6:
  |
    enqueueNarrationInTransaction writes a durable outbox row, and
    dispatchNarrationOutbox can deliver it. Repository search finds no runtime
    caller of dispatchNarrationOutbox and no deployed queue consumer; only its
    unit test invokes it. The authenticated process-next route is an operator
    endpoint, not an outbox wake path.

evidence OBS7:
  |
    A read-only gcloud queue describe on 2026-08-12 returned SERVICE_DISABLED:
    cloudtasks.googleapis.com has not been enabled for project kshiai. No queue
    resource was created during RCA.

decision RC_NARRATION based_on RCA1, OBS5, OBS6:
  |
    Narration is stuck because the implemented durable enqueue boundary was
    released without the production wake/dispatch component. Scale-to-zero and
    request completion mean a queued row cannot execute itself.

decision FIX_NARRATION based_on RC_NARRATION, OBS7:
  |
    Add a bounded authenticated worker wake path and a production dispatcher
    with durable redelivery. Deployment readiness must prove that a queued
    receipt reaches a terminal event without an administrator request. Keep
    provider execution outside advance and retain fencing and ordered receipt
    selection. Enabling the API, creating the queue, and granting the runtime
    identity enqueue/OIDC authority are an explicit infrastructure gate.

decision RELEASE_DIRECTION based_on FIX_RECEIPT, FIX_NARRATION, OBS1, OBS2:
  |
    First restore causal record correctness, then wire and verify narration
    wake-up. Do not run another production observation until local regression,
    llmthink audit, full validation, staging queue-to-terminal proof, and an
    explicit release decision pass. The incomplete battle remains diagnostic
    evidence and must not be rewritten.
