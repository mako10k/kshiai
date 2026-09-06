# ADR-0020: Dedicated reposition action and appropriate range

- Status: Accepted
- Date: 2026-09-06
- Decision owner: Product owner
- Related: ADR-0001; ADR-0003; ADR-0016; ADR-0017; `docs/battle-world-model.md`; `docs/battle-action-feasibility.md`
- Authority: `0020-reposition-and-appropriate-range.think`

## Context

Production matches that spawn combatants in different battlefield areas leave
`pairRelations` at `separate_area` with blocked sight. Counterpart strikes
substitute to `defend`, `lastActionResult` describes the substitute, and speech
freezes because the world never changes. `free_action` was intended to cover
positioning, but pair/area updates are still remaining work and spend an
adjudication LLM.

## Decision drivers

- Spacing is a server-owned world transition, not a new provider call.
- Legal striking distance is an appropriate band, not always-closer.
- Engine substitution is the primary miss correction; prompts are secondary.
- Existing battles keep their recorded substitution behavior.

## Considered options

1. Finish positioning only through `free_action`. Extra LLM; pair updates unfinished.
2. Dedicated deterministic `reposition` action. Selected.
3. Keep substituting misses to `defend` and teach the model in prose. Leaves the recorded loop intact.

## Decision

Choose option 2.

OWNER_ACCEPTANCE: on 2026-09-06 the product owner approved the audited plan
covering D1–D4 of the `.think` record.

Rules:

1. New `ActionKind` `reposition`. One accepted action is at most one adjacent
   area hop along frozen battlefield topology, or one in-area distance-rank
   change, via `set_placement` and/or `set_pair_relation`.
2. `reach` remains the maximum. Engine-only optional `minReach` makes a band
   (not in structured-output character JSON in this slice). `separate_area`
   and `out_of_scene` are never in-band for counterpart strikes.
3. New battles bind `pacingPolicy.spacingSchemaVersion = 1`. Those battles substitute
   `out_of_range` and `target_unlocalized` counterpart intents to `reposition`
   toward the requested band. Generic `line_of_sight_blocked` is not mapped.
4. Observer-safe `actionFeedback` enters the existing decision frame. No new
   LLM route. Action norms, lastAction naming, and later-bucket fallback must
   include `reposition`.
5. Missing `spacingSchemaVersion` keeps rest/defend/wait substitution. No backfill.

## Consequences

### Positive

- Separate-area matches can close or open to an action's band without an extra
  provider call.
- Misses become a world change instead of a silent defend.

### Negative and risks

- A public turn whose first beat is reserved `wait` may only join areas at
  `far`; a hit can wait until a later beat.
- Missing topology forbids area hops; in-area rank changes still work.

## Compatibility and migration

New battles only. Old JSON without `reposition` still parses. Skills without
`minReach` keep max-only reach.

## Verification

Replay-shaped unit tests: separate-area spawn lists `reposition` and substitutes
a requested strike to it; two hops can share an area at `far`; a `minReach`
band at `contact` opens; generic LOS is not substituted; no new provider route.
