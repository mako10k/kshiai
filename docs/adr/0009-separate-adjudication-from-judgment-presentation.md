# ADR-0009: Separate adjudication from judgment presentation

- Status: Accepted
- Date: 2026-08-13
- Decision owner: Product owner
- Related: ADR-0003; ADR-0006; `docs/judgment-presentation-projection-design.md`; `docs/structured-domain-assets-backlog.md`

## Context

Turn-limit adjudication correctly reads bounded committed engine facts rather
than narrator prose, and gameplay retains exclusive authority over the winner.
However, the adjudicator's free-form internal `reason` is currently appended
verbatim to the public verdict and supplied to the judgment narrator with an
instruction not to paraphrase it. This exposes internal evaluation vocabulary
such as committed effects, remaining capacity, and aggregate effectiveness in
the story surface even though raw reason facts and engine fields remain private.

The terminal outcome does not need a second narrative authority. The result
card and immutable verdict already communicate the winner. The judgment
narrator should add presentation, not publish the adjudicator's audit record.

## Decision drivers

- Preserve the canonical winner and auditable internal rationale.
- Prevent internal adjudication ontology and free-form audit prose from becoming
  public story text.
- Retain a concise audience-facing sense of why a decision was reached.
- Add no provider call and introduce no character-cognition or world-state path.
- Keep already queued legacy judgment work safe without rewriting history.

## Considered options

1. Improve only the adjudicator prompt so its `reason` sounds literary. This
   still makes one field serve incompatible audit and presentation purposes.
2. Pass the raw reason to the judgment narrator and permit paraphrase. This can
   hide vocabulary but still exposes internal input and invites semantic drift.
3. Keep raw adjudication internal, render only the immutable outcome directly,
   and give the existing judgment narrator a deterministic audience-safe
   projection. This preserves both authority and presentation isolation.

## Decision

Choose option 3.

- `BattleAdjudication` remains the immutable internal audit record. Its
  `reason`, `reasonFacts`, source, fallback side, and input range are not public
  narration inputs or public DTO fields.
- The server-owned public verdict contains only the outcome: either
  `判定は <name> の勝利。` or `判定は引き分け。` It never concatenates the raw
  adjudication reason.
- A deterministic `JudgmentPresentationProjectionV1` is derived from the
  canonical winner and the enumerated factors of reason facts. It discards raw
  factor statements and maps at most two winner-consistent factors to bounded
  audience-facing Japanese basis lines.
- The existing `narrateJudgment` call receives that projection, participant
  labels, scene, style, and earlier public narration. It may frame or naturally
  express a projected basis but cannot reconsider or restate the verdict, add
  a new cause, add character speech, or modify any canonical state.
- If projection is absent or narration fails, the public result is the outcome
  only. Missing presentation never exposes the raw reason.
- Legacy queued judgment requests may still contain `adjudicationReason`; new
  workers ignore it. Completed historical public logs are not rewritten.

## Consequences

### Positive

- Internal scoring vocabulary no longer appears merely because it was useful
  for audit or model control.
- The winner remains visible even when the presentation provider fails.
- Public explanation can match the narration style without becoming result
  authority.
- No additional model call, persistence owner, or character context is added.

### Negative and risks

- Factor-to-basis mapping is intentionally coarse and may omit nuances retained
  in the internal reason.
- The judgment narrator may omit a projected basis; outcome-only is an accepted
  fallback.
- Historical completed verdict prose can retain the earlier internal-sounding
  reason because replay history is immutable.

## Compatibility and migration

- `BattleAdjudication` persistence is unchanged and remains available to
  internal observability.
- New deferred judgment requests replace `adjudicationReason` with the
  presentation projection. The generic legacy snapshot schema retains the old
  optional field for read compatibility, but no presentation consumer reads it.
- Public battle DTO shape and winner/rating behavior do not change.
- Active battles and queued legacy receipts need no data rewrite.

## Verification

- Public immediate summaries and terminal worker snapshots never contain the
  raw adjudication reason.
- Changing raw `reason` and raw reason-fact statements while keeping factor and
  winner constant does not change the presentation projection or exact verdict.
- Only winner-consistent factors enter the projection; missing or contradictory
  factors fall back to one neutral audience-facing basis.
- Legacy deferred input containing only `adjudicationReason` produces an
  outcome-only verdict and does not expose that field.
- Winner, rating, receipts, world, mechanics, cognition, and provider-call count
  are unchanged.

## Implementation references

- [Detailed design](../judgment-presentation-projection-design.md)
- `packages/shared/src/battle.ts`
- `backend/src/services/battle-service.ts`
- `backend/src/services/narration-worker.ts`
- `backend/src/llm/openai-compatible.ts`
- `backend/src/services/battle-speech-wiring.test.ts`
- `backend/src/services/narration-worker.test.ts`
- `backend/src/llm/openai-compatible-narration.test.ts`
