domain KshiaiIssue134SparseNarrationObserverRca:
  description |
    Hypothesis-first RCA for GitHub Issue 134: Stage observation
    btl_a90676928c9b47d618cc4812ccaf52ce failed after a valid sparse
    scene-beat narration projection.

problem RCA:
  |
    Why did a finished Stage battle with eleven terminal narration rows exit
    1 with "Public narration projection is not in contiguous receipt order",
    and what observer contract must replace 1..N density without scoring
    empty legacy logs?

premise SAFETY:
  |
    Do not add a provider call, retry, fallback, runtime prose filter,
    deployment, or replacement observation as part of this repair.

premise H1:
  |
    Hypothesis H1: some narration jobs failed to enqueue, leaving true holes
    in the worker table.

premise H2:
  |
    Hypothesis H2: the missing sequences are ADR-0016 deferred combat
    receipts, and the observer treats the filtered narration projection as if
    it owned the denser phase-receipt sequence.

premise H3:
  |
    Hypothesis H3: dialogue KPIs read persistedBattle.log, which is empty
    under terminal-snapshot delivery, so fixing only the sequence assertion
    would retain zero-line dialogue evidence.

evidence E1:
  |
    Issue 134 records sequences 1,2,3,6,7,10,11,14,15,16,17 with missing
    4,5,8,9,12,13. Every missing sequence is a canonical phase receipt with
    narrationDeferred=true and no narration input or row. All eleven
    narration rows completed with one attempt and completed outbox.

evidence E2:
  |
    Cloud Run Job kshiai-persistent-e2e-9sqqb logged
    "Public narration projection is not in contiguous receipt order" at
    2026-09-04T12:28:46Z after the Stage battle finished.

evidence E3:
  |
    waitForNarrationConvergence and inspectInternalBattleObservation both
    require sequences[index] === index + 1. canonicalCurrent.phaseReceipts
    omits narrationDeferred, so internal reconciliation cannot name the gaps.

evidence E4:
  |
    persistent-battle-e2e.ts scores assessDialogueQuality(persistedBattle.log).
    ADR-0006 public dialogue lives in narration.entries[].narrative.

decision D1 based_on H1, E1:
  |
    H1 is rejected. The worker table is complete for every non-deferred
    receipt.

decision D2 based_on H2, E1, E2, E3:
  |
    H2 is supported. The observer's 1..N density check is the failing
    contract, not scene-beat deferral.

decision D3 based_on H3, E4:
  |
    H3 is supported. Dialogue quality must be computed from terminal
    narration narratives.

decision FIX based_on RCA, D2, D3, SAFETY:
  |
    Public validation requires positive, unique, strictly increasing
    sequences. Internal validation maps every narration row to a
    non-deferred phase receipt and every omitted gap to an explicitly
    deferred receipt. Expose narrationDeferred on canonicalCurrent.
    Score dialogue from narration.entries[].narrative. Add a regression
    with deferred receipts inside a completed beat.
