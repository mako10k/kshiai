# ADR-0023: Pair channels are not unique cognition

- Status: Accepted
- Date: 2026-09-06
- Decision owner: Product owner
- Related: ADR-0022; ADR-0020; `docs/battle-world-model.md`; `docs/remaining-pair-channel-mix-in.llmthink.dsl`
- Authority: `0023-pair-channels-are-not-unique-cognition.think`

## Context

ADR-0022 split observer listing from canonical revalidation. Unique world
still stored `pair.sight` and `pair.sound` as one mutual channel. Engine
line of sight, visual counterpart projection, and utterance hearing read
those fields as if they were unique two-person cognition.

## Decision drivers

- Unique world is viewpoint-free: placements, facing, organs, exposure,
  illumination, noise, object sensory effects, mechanical distance.
- Two-person perceptual relations live only in the two observer frames.
- Stored JSON must still parse. Fast-forward hops are out of scope.

## Considered options

1. Leave `pair.sight` / `pair.sound` as authority. Keeps the mix-in.
2. Stop reading them now; keep the keys as a derived fill from presence
   and same-area. Selected.
3. Delete the keys in this slice. Rewrites in-flight battle parse.

## Decision

Choose option 2.

OWNER_ACCEPTANCE: on 2026-09-06 the product owner instructed to tidy the
remaining mix-in after ADR-0022.

Rules:

1. Engine LOS uses organ vision (including causality-derived vision) and
   exposure. It does not read `pair.sight`.
2. Observer visual access is projected from presence, `separate_area` /
   `out_of_scene`, exposure, organ vision, facing, illumination, and
   mechanical distance. It does not read `pair.sight`.
3. Utterance hearing uses organ hearing, distance, area noise, and
   utterance properties. It does not read `pair.sound`.
4. `pair.distance` and orientations stay unique. `sight` / `sound` keys
   remain a derived compatibility fill, not authority.

## Consequences

### Positive

- Unique world no longer judges seeing/hearing through a mutual channel.
- Observer frames remain the only two-person cognition.

### Negative and risks

- Old snapshots still carry `sight` / `sound`; readers must ignore them
  as authority. A later ADR may drop the keys.
- Cover that existed only as `pair.sight = blocked` no longer blocks
  strikes or visual access unless exposure, organ vision, or an object
  effect says so.

## Compatibility and migration

No database migration. In-flight JSON keeps the keys. Writers still fill
derived values from presence and same-area so invariants hold.
ADR-0020, ADR-0021, and ADR-0022 remain Accepted.

## Verification

- `pair.sight = blocked` at in-band distance does not make a strike
  `line_of_sight_blocked` and does not drop visual access to `none`.
- Hidden exposure or blocked organ vision still blocks LOS and visual
  access.
- Utterance hearing still drops on blocked organ hearing, not on
  `pair.sound`.
