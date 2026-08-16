# ADR-0016: Scene beats batch narration and reserved action sequences

- Status: Accepted
- Date: 2026-08-16
- Decision owner: Product owner
- Related: ADR-0001; ADR-0006; ADR-0007; `docs/current-battle-pipeline.md`; `docs/battle-pacing-candidate-12-v2.md`
- Authority: `0016-scene-beats-batched-narration.think`

## Context

Battle scenes feel static. One combat turn still resolves about one action per
side and then the narrator describes that small delta. `candidate-12-v2`
already shortens the fight and raises damage; it does not put more committed
movement into one public 物語 block.

A normal combat advance already uses several lightweight provider calls:
later-actor decision, semantic/world reconcile, both expression agents, and a
separate narration job. Raising the internal turn count while keeping one
narration and one agent pair per turn would scale cost with that count.

ADR-0006 binds one public narration snapshot to one committed phase receipt.
Combat receipts are one per combat turn. Expression may reserve a single
`nextAction`, not a sequence.

This is a battle-ordering and narration-identity decision.

## Decision drivers

- Public story blocks must be able to show a burst of committed movement.
- Ordinary actions stay sequential (ADR-0001). The narrator must not invent
  motion the engine did not commit.
- Lightweight provider calls must not grow linearly with micro-turn count.
- Observability must still show every mechanical micro-turn.
- Existing battles must keep their 1:1 combat narration.

## Considered options

1. Only raise per-action damage or scene coefficients. Hits get larger; the
   story still ticks one small step at a time.
2. Raise `turnLimit` and keep one narration plus agent pair per turn. More
   motion, more LLM cost.
3. Let narration invent larger movement than the engine committed. Rejected
   by ADR-0006 and ADR-0009.
4. Resolve several ordinary actions in one simultaneous bucket. Conflicts
   with ADR-0001.
5. Keep sequential micro-turns, group them into a scene beat for expression
   and narration, and consume a short reserved action sequence.

## Decision

Choose option 5.

OWNER_ACCEPTANCE: the product owner directed merge of this ADR after the
Proposed text was presented on 2026-08-16, and ordered implementation as
the follow-up to the log-container fix. ACCEPTANCE applies to this revision
of ADR-0016.

Rules:

1. The micro-turn remains the engine unit. ADR-0001 order, bucket commits,
   and receipts stay per micro-turn. Existing battles keep one narration per
   combat receipt.
2. A scene beat is a consecutive run of combat micro-turns. Prologue,
   judgment, and aftermath stay their own beats.
3. A beat closes on the first of: K committed combat micro-turns (first
   slice K=3), a deterministic scene-delta threshold, KO/terminal, or an
   infeasible reserved action. K is frozen on the battle with the pacing
   policy.
4. Expression agents run at beat boundaries and may reserve up to K next
   actions per side. The engine consumes that sequence across micro-turns
   without another expression call while the beat is open.
5. `decideCharacterAction` runs only when the reserved action is missing or
   the server rejects it.
6. Semantic/world LLM reconcile runs when the beat closes. Intermediate
   micro-turns apply only deterministic engine and already-accepted world
   transitions. A later actor in the same micro-turn still sees that
   micro-turn's earlier committed facts.
7. Narration job creation moves to beat close. The snapshot includes every
   micro-turn receipt in the beat, in order. Public 物語 shows one block per
   beat.
8. `/internal/observations` still exposes every micro-turn receipt and DAG.
9. The first slice must not raise the per-battle lightweight provider count
   above the current 12-turn mean. Target is at most one expression pair,
   one world reconcile, and one narration per beat, plus decision calls only
   on reservation miss.
10. Auto-advance HTTP may still be one micro-turn per call. Beat close, not
    HTTP grouping, creates the narration job.
11. Environment `proposeHappening` and referee stay at their current cadence.

## Consequences

### Positive

- One story block can cover several committed movements.
- Reserved sequences give several specified actions without simultaneous
  buckets.
- Provider calls grow with beats, not micro-turns.

### Negative and risks

- Public prose waits until the beat closes.
- Stale reserved actions need a cheap feasibility check.
- ADR-0006's one-combat-receipt-one-narration grouping is amended for new
  battles only.

## Compatibility and migration

Battles created before acceptance keep 1:1 combat narration. New battles bind
beat K at creation. Prefer fitting beat state into existing receipts and
battle-scoped JSON. A new table, if required, is additive.

## Verification

After acceptance and implementation:

- A three-micro-turn beat with feasible reservations creates one narration
  job and at most one expression pair.
- A KO on micro-turn 1 closes the beat immediately.
- Public 物語 has one block per beat; receipts still list each micro-turn.
- Provider ledger counts do not grow linearly with K.
- Old battles still narrate each combat receipt.

## Implementation references

- Authoritative record: `docs/adr/0016-scene-beats-batched-narration.think`
- Current pipeline: `docs/current-battle-pipeline.md`
- Narration identity: ADR-0006
- Beat helpers: `packages/shared/src/scene-beat.ts`
- Combat hooks: `completeAdvancePhases` deferral and `applyCombatSceneBeat`
