# ADR-0017: Public turn clock with three intra-turn beats

- Status: Accepted
- Date: 2026-08-16
- Decision owner: Product owner
- Related: ADR-0001; ADR-0006; ADR-0016; `docs/battle-pacing-candidate-12-v2.md`
- Authority: `0017-public-turn-intra-turn-beats.think`

## Context

ADR-0016 grouped three engine resolutions so one 物語 block could cover more
committed motion. The implementation also incremented the public `ターン`
counter on every resolution. That made a beat look like a turn and spent the
twelve-turn pacing clock on the subdivision.

The owner rejected beat = turn and ordered a reconstitution: twelve public
turns, three beats inside each turn, and no turn numbers in narrator-facing
copy.

## Decision drivers

- The public clock is the `candidate-12-v2` twelve-turn match.
- Beats are an intra-turn engine loop, not another name for ターン.
- The narrator and 物語 headings must not print turn numbers.
- In-flight ADR-0016 battles must keep their recorded increment.

## Considered options

1. Keep the ADR-0016 counter and only hide headings. Display would lie.
2. Raise `turnLimit` to 36 and keep one counter. Beats would still be turns.
3. Bind a public-turn clock: `state.turn` is the 12-count; K=3 beats stay
   inside that turn.

## Decision

Choose option 3.

OWNER_ACCEPTANCE: the product owner directed this reconstitution on
2026-08-16 — beat is not a turn; do not show turns to the narrator;
twelve turns with three beats each. ACCEPTANCE applies to this revision of
ADR-0017. It amends ADR-0016 clock identity only. Skip-LLM, reserved
actions, and sequential order from ADR-0016 remain.

Rules:

1. New battles bind `sceneBeat.clock = "public-turn"`. Missing `clock` keeps
   the ADR-0016 increment for battles already in flight.
2. `state.turn` increments only when a new public combat turn starts.
3. Up to K=3 sequential engine beats belong to one public turn. Close still
   uses K, a 15% HP swing, KO/terminal, or an infeasible reservation.
4. `turnLimit` 12 counts public turns. Turn-limit finish waits for the last
   beat of public turn 12 unless KO ends first.
5. `combatTick` increments every engine beat. Causal execution identity
   includes the beat so two beats of one turn do not resume each other.
6. Restoration, due-turn effects, happenings, and battlefield intro run on
   the first beat of a public turn only.
7. Public 物語 headings and narrator-facing presentation do not print ターン
   numbers. The match header may show `ターン N / 12`.
8. Auto-advance HTTP remains one beat per call.
9. No database migration.

## Consequences

### Positive

- The public clock matches the twelve-turn pacing policy.
- One public turn / one story block can cover three engine exchanges.
- In-flight ADR-0016 battles keep their recorded increment.

### Negative and risks

- A public turn can take three HTTP advances before the header increments;
  the header also shows the beat index.
- A full-length match has up to 36 combat beats.

## Compatibility and migration

Battles without `sceneBeat.clock` keep ADR-0016 counting. New battles use
the public-turn clock. No schema migration.

## Verification

- Three combat advances on a new battle leave `turn === 1`.
- The fourth combat advance sets `turn === 2`.
- Turn-limit does not fire on beat 1 of public turn 12.
- 物語 headings do not contain `ターン`.
- An in-flight beat without `clock` still increments `turn` every advance.

## Implementation references

- Authoritative record: `docs/adr/0017-public-turn-intra-turn-beats.think`
- Beat helpers: `packages/shared/src/scene-beat.ts`
