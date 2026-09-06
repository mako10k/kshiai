# ADR-0021: Engine-owned live continuation and closed contract types

- Status: Accepted
- Date: 2026-09-06
- Decision owner: Product owner
- Related: ADR-0001; ADR-0020; `docs/battle-world-model.md`; `docs/current-battle-pipeline.md`; `docs/v0.22.0-rc.5-reposition-theater-rca.llmthink.dsl`; `docs/v0.22.0-rc.5-continuation-world-drop-root-rca.llmthink.dsl`
- Authority: `0021-engine-live-continuation-and-type-escapes.think`

## Context

Production `v0.22.0-rc.5` battle `btl_2788b1aba227a7ecd768b75270676423`
narrated 38 join-at-far hops and finished at HP 109/109 with
`pairRelations` still `separate_area` and `updatedTurn` 0. ADR-0020
applied `set_placement` / `set_pair_relation` inside `executeAction`,
then the v0.17 bucket continuation discarded `worldState`. `BattleState`
was `as any` plus `Record<string, any>`, so the compiler could not
require that engine mutations appear on the checkpoint.

## Decision drivers

- A bucket stop freezes `BattleState`; only continuation fields are live.
- Fighter placement and the character pair are engine-owned mechanical
  facts after a hop.
- Contract types must stay closed TypeScript. Escapes are forbidden on
  new code and on a repaired defect path.

## Considered options

1. Append `worldState` to the continuation allow-list only. The next
   `executeAction` field would vanish the same way.
2. Diagnose the match as one-step walking and fast-forward to band.
   Rejected: `updatedTurn` 0 is a discarded hop, not a slow walk.
3. Name the engine-owned live snapshot, close the `BattleState` type
   escape on this contract, and stop semantic clobber of fighter world.
   Selected.

## Decision

Choose option 3.

OWNER_ACCEPTANCE: on 2026-09-06 the product owner instructed to forbid
type escapes going forward, to audit and test-lock only non-contract
exceptions, not to retrofit every historical escape, to treat new
additions and found defects as mandatory, and then to implement this
repair.

Rules:

1. Engine-owned live fields that must survive a bucket stop are
   combatants, finishers, `pendingEffects`, `situation`,
   `defensiveInstrumentMultipliers`, `worldState`, and
   `latestWorldTransition`. Continuation carries that snapshot.
   `materialize` and finalize restore it. `resolveTurn` must not return
   the pre-bucket `BattleState` after a world mutation.
2. Semantic derive must not overwrite `character.a` / `character.b`
   placement or the fighter pair.
3. Type escapes (`as any`, `as unknown as`, `Record<string, any>`,
   implicit `any`, unchecked `@ts-expect-error`, `noImplicitAny: false`)
   are banned on new code and on a repaired defect path. Contract types
   cannot host an escape. `BattleStateSchema` is annotated
   `z.ZodType<BattleState>` rather than `any`. Engine-live fields
   (`worldState`, `causalEngineContinuation`, `latestWorldTransition`,
   `pendingEffects`) are named on `BattleState` and must not be `any`.
   TS7056 still prevents `z.infer` of the full schema; remaining unnamed
   keys stay historically open until a defect names them. A colocated
   test must fail if the continuation becomes an open string index or
   those live fields become `any`.
4. Do not replace one-step reposition with a time-skip in this record.

## Consequences

### Positive

- Adjacent-area hops can land and later beats can strike.
- The next engine-owned field has a named snapshot instead of a forgotten
  allow-list entry.
- The compiler can see continuation completeness.

### Negative and risks

- In-flight continuations without `worldState` keep the pre-turn world
  until the next full turn. That is the previous (broken) behavior.
- Inferring `BattleState` from Zod may surface existing call-site
  strictness issues that `Record<string, any>` had hidden.

## Compatibility and migration

New and in-flight battles on `spacingSchemaVersion` 1. No database
migration. Old continuation JSON without `worldState` still parses.
ADR-0020 remains Accepted.

## Verification

- Bucket resume after a reposition keeps world revision, placement, and
  pair `updatedTurn`.
- Stale semantic locations do not reset fighter placement or pair.
- A type test fails if the continuation becomes an open string index or
  live world fields become `any`.
- Reposition event text is emitted only when the world apply changed.

## Rollback candidates

The producing repair is persistence of engine-owned world across buckets.
If new matches still look like “movement only” after that lands, peel
guards in this order. Do not revert the continuation snapshot, live
checkpoint merge, successful-apply event gate, or `out_of_range`
substitution.

1. Prompt instruction in `backend/src/llm/openai-compatible.ts` that
   tells the model to choose `reposition` when
   `decision.actionFeedback.spacing.relation` is not `in_band`. Engine
   substitution remains the primary miss correction.
2. `spacingSubstitute` in `packages/shared/src/action-feasibility.ts`
   mapping `target_unlocalized` onto `reposition`. Keep `out_of_range`.
   Observe whether hops continue after the pair is already in-band
   because perception access is still `none`.
3. `keepEngineWorldPlacement` fighter branch in
   `packages/shared/src/battle-world.ts` skipping actorState, exposure,
   and deactivation. Narrow it to placement only.
4. Same-turn `updatedTurn === turn` protection for non-fighter entities
   in that helper. Leave fighter spacing protected.
5. `REPOSITION_REQUIRES_WORLD_APPLY` in `applyAction`. Restore the
   previous no-op event only if a dead path must stay silent.

Do not restore semantic pair heuristics (`near` / `separate_area`) for
`character.a`/`character.b`. That would flatten `far`/`medium`/`contact`
after a landed hop. Do not remove ActionKind `reposition`.

Watch: hop then `target_unlocalized` substitution, or 物語 that is still
mostly movement → try 1 then 2. Missing object or condition sync → try
3 or 4.
