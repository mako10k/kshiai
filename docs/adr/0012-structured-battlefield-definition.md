# ADR-0012: Separate battlefield presets, compiled instances, and live world state

- Status: Accepted
- Date: 2026-08-14
- Decision owner: Product owner
- Related: ADR-0010; `SDA_BATTLEFIELD` in
  `docs/structured-domain-assets.pert`;
  `docs/structured-battlefield-definition-design.md`

## Context

The current battlefield preset mixes public card prose, loose terrain and
obstacle hints, hidden coefficients, image state, and instructions used by an
LLM to construct a match battlefield. Create, chat, image, copy, and
save-from-battle routes write the mutable row directly. Management and match
selection use the same list, and battle creation may append and activate a
preset generation while resolving the selected field.

The runtime already distinguishes a `BattlefieldPreset`, a concrete
`BattlefieldInstance`, and mutable semantic/world state, but their authority is
not explicit. The concretization provider may invent topology, coefficients,
objects, and semantic seed data at match start. This conflicts with ADR-0010's
requirement that ready structured definitions are authoritative and that battle
binding is read-only.

## Decision drivers

- Preserve a reusable authored scene without letting public prose or a
  battle-time provider invent mechanics.
- Freeze topology, objects, effects, entry locations, and evolution limits
  before a preset becomes selectable.
- Keep a battle-owned immutable instance distinct from subsequent live world
  changes.
- Retain explicit owner upgrade and management access for legacy presets while
  excluding them from selectors and direct battle creation.
- Rebuild trusted system seeds without eager inference of user-authored rows.

## Considered options

1. Extend the legacy preset and keep LLM concretization authoritative. This is
   small but leaves topology and semantic identity undecided until battle start.
2. Store one fully concrete battlefield as the preset. This is deterministic
   but removes the useful template/instance distinction and match-local
   identity.
3. Store a structured reusable definition, compile a battle-owned immutable
   instance deterministically, and evolve only the battle-owned world through
   validated transitions.

## Decision

Choose option 3.

`BattlefieldDefinitionV2` is the authoritative reusable preset. It contains:

- scene identity, category, tags, scale, atmosphere, and visual definition;
- stable areas and explicit directed topology with movement, sight, and sound
  relations;
- persistent or bounded-turn effects using closed trigger, target, and
  cancellation vocabularies;
- stable first-class object definitions with placement, exposure, portability,
  usability, cover, and blocking properties;
- side entry areas, bounded engine coefficients, and allowed evolution
  pressures plus forbidden discontinuities.

The public scene card is a stored projection generated from the frozen natural
source and a server-filtered projection. Its prose never supplies topology,
coefficients, objects, effects, or runtime facts.

Creation, revision, and explicit upgrade use the common persisted authoring
attempt and atomic activation contract from ADR-0010. Legacy owner presets stay
manageable with `unsupported`, `upgrading`, or `upgrade_failed` compatibility,
but only `ready` schema-2 generations appear in match selection. System seed
definitions are deterministic imports and activate as ready schema-2
generations. No user preset is bulk upgraded.

The versioned battlefield compiler validates the exact ready generation and
deterministically creates one immutable `BattlefieldInstance`. It may choose
only values already present in the definition and cannot add topology,
mechanical coefficients, effect kinds, or first-class objects. An LLM may render
bounded presentation from the compiled instance, but it is not an authority for
the instance or initial semantic seed.

The compiler maps stable object and effect IDs into the initial semantic seed.
The battle engine then creates mutable semantic and world state from that seed.
Later happenings are limited to the bound evolution affordances and validated
world-transition contracts; they never rewrite the preset or instance.

Battle creation reads the exact ready preset generation, compiles it, records
its generation ID, content digest, and compiler version, then creates only the
battle-owned instance generation. It never appends or activates a selectable
preset generation.

Image changes are media revisions of a ready structured definition and append a
new immutable preset generation. Copy and save-from-battle are explicit imports
that create a new logical preset at generation 1. Delete remains owner-scoped
management state and does not rewrite a historical battle binding.

## Consequences

### Positive

- Match start cannot invent or silently change authored battlefield mechanics.
- Stable topology and object IDs make initial world construction reproducible.
- Public cards remain expressive without becoming runtime authority.
- Existing battles remain independent from later preset edits or images.

### Negative and risks

- Legacy user presets require explicit owner review before selection.
- Deterministic compilation provides less unbounded match-start variety; variety
  must be authored as explicit areas, objects, effects, or affordances.
- System seeds need structured import fixtures and readiness regression.
- Existing happening proposals require a later bounded consumer audit before
  every affordance can affect live world evolution.

## Compatibility and migration

- Add battlefield compatibility and authoring-attempt tables without deleting
  or backfilling legacy user rows.
- Deterministically import maintained system seeds into schema-2 generations.
- Preserve legacy rows for management and explicit upgrade input.
- Preserve existing battles and version-1 embedded instances unchanged.
- Keep the current `battlefields` row as a management/public read model; the
  ready generation owns selection and battle binding.

## Verification

- Definition validation rejects dangling topology, duplicate stable IDs,
  unknown coefficient keys, invalid effect vocabulary, and invalid entry areas.
- The same definition compiles to the same instance and semantic seed; public
  prose changes cannot change compiler output.
- Create, review, confirm, revision, failure, expiry, idempotency, and pointer
  drift are covered at repository and actual HTTP/persistence seams.
- Management includes unsupported rows, while selection, random system choice,
  policy generation, and direct battle creation accept only ready compatible
  generations.
- Battle creation performs no preset generation write and binds the exact
  generation and compiler contract.
- Image, copy, and save-from-battle operations create immutable structured
  generations and cannot restore a mutable bypass.

## Implementation references

- [Detailed design](../structured-battlefield-definition-design.md)
- `packages/shared/src/structured-battlefield.ts`
- `backend/src/repositories/battlefield-assets-v2.ts`
- `backend/src/services/battlefield-authoring-service.ts`
- `backend/src/services/battle-service.ts`
