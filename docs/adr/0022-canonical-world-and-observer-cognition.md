# ADR-0022: Canonical world and observer cognition

- Status: Accepted
- Date: 2026-09-06
- Decision owner: Product owner
- Related: ADR-0020; ADR-0021; `docs/battle-world-model.md`; `docs/battle-action-feasibility.md`; `docs/canonical-world-and-observer-cognition.llmthink.dsl`; `docs/v0.22.0-rc.6-reposition-noop-id-split-rca.llmthink.dsl`
- Authority: `0022-canonical-world-and-observer-cognition.think`

## Context

Canonical world is supposed to be unique and viewpoint-free. Two-person
relations constituted by perception are not that world: they are mutual
cognition, and there may be two of them. Physical effects must be judged
through canonical state.

The engine mixed the two. `targetWorldFailure` returned `target_unlocalized`
from `perception.counterpart.currentAccess` before reading placements or
mechanical distance. `executeAction` planned hops from the same access.
Production `btl_162854a54de03aa54d93918d1b0feae1` therefore labeled 36
physically out-of-area strikes as unlocalized.

## Decision drivers

- Canonical state is unique and viewpoint-free.
- Perceptual relations are two observer frames, not a modifier on unique world.
- Physical hits, misses, and hops are judged only through canonical state.
- Mental-effect routing may later differ; it is not decided here.
- Do not delete `pairRelations` or rewrite hops in this slice.

## Considered options

1. Keep one `assess` path for observer listing and engine revalidation.
   Leaves the mix-in in place.
2. Split observer listing from canonical revalidation now; leave
   `pair.sight` / `pair.sound` stored until occlusion moves to areas or
   objects. Selected.
3. Delete `pair.sight` / `pair.sound` in the same slice. Rewrites
   projection, init, and hops beyond the found engine defect.

## Decision

Choose option 2.

OWNER_ACCEPTANCE: on 2026-09-06 the product owner stated the unique-world
versus two-cognition principle and instructed to record it as an ADR and
repair the current engine mix-in, with an llmthink analysis.

Rules:

1. Unique world may hold placements, topology, body facing, eye direction,
   organ vision and hearing, exposure, and a mechanical distance band.
2. Two-person perceptual relations live only in `perceptionFrameA` and
   `perceptionFrameB`. Observer-safe listing may hide a counterpart action
   when `currentAccess` is not `coarse` or `clear`, and may label targets
   with `perceivedAs`.
3. Engine revalidation, substitution, and hop correction must not read
   observer frames. Canonical `target_unlocalized` is missing or
   out-of-scene placement, or actor delirious. `separate_area` and in-area
   rank misses stay `out_of_range`. ADR-0020 substitution of those reasons
   to `reposition` remains.
4. `pair.sight` / `pair.sound` are not the two cognitive frames. Relocating
   physical occlusion is later work. Do not fast-forward hops.

## Consequences

### Positive

- A physically in-band strike is not substituted because an observer cannot
  localize the counterpart.
- A physically out-of-area strike is `out_of_range`, not `target_unlocalized`.
- Character decision still sees only observer-safe counterpart actions.

### Negative and risks

- Forced or policy-chosen strikes can physically connect even when that
  observer's frame is `none`. That is the unique-world rule, not a leak
  of unperceived world into the character prompt.
- `pair.sight` / `pair.sound` remain on world until a later ADR.

## Compatibility and migration

No database migration. In-flight battles keep stored perception frames;
the engine stops reading them for physical adjudication. ADR-0020 and
ADR-0021 remain Accepted.

## Verification

- Observer listing still drops counterpart strikes when access is not
  `coarse` or `clear`.
- Revalidation of an in-band strike with access `none` accepts.
- Revalidation of `separate_area` with access `none` substitutes
  `reposition` with reason `out_of_range`.
- Generic organ/exposure LOS still does not map to `reposition`.
