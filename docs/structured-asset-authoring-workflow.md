# Structured selectable-asset authoring workflow

- Status: Accepted product workflow and common architecture; family schemas remain gated
- Date: 2026-08-13
- Decision owner: Product owner
- Applies to: characters, battlefield presets, narration styles, and future
  user-selectable authored assets
- Related: [structured-domain-assets-backlog.md](structured-domain-assets-backlog.md),
  [structured-asset-information-projection-design.md](structured-asset-information-projection-design.md),
  [proposed common envelope](structured-asset-envelope-design.md),
  [ADR-0010](adr/0010-structured-selectable-asset-envelope.md),
  [ADR-0003](adr/0003-revision-editable-assets-and-bind-battles.md)

## One workflow

Every selectable asset uses the same ordered authoring pipeline:

```text
natural-language source
  -> generate and validate structured definition
  -> derive the field-safe rendering projection
  -> generate public natural-language description from
       source + rendering projection
  -> validate and atomically activate one immutable generation
```

The first generation step must finish and pass the asset schema before public
description generation starts. The two generated artifacts are not independent
authorities:

- the validated structured definition is authoritative for battle behavior,
  agent context, world initialization, and rendering constraints;
- the source text is private authoring provenance and supplies intent, emphasis,
  vocabulary, and nuance during authoring only;
- the public description is a stored derived presentation. It is never parsed
  during battle execution and never overrides the structured definition.

The description generator receives the original source text and a
profile/scene/style-display projection of the validated structure. Schema
elements are classified as required public, public eligible, or restricted;
only the first class and explicitly published values of the second enter this
projection. A character's disposition background may therefore be included,
while raw battle-time latent psyche state is not. Material factual claims in the
description must be supported by that projection. Flavor and voice may come
from the source text and bounded per-element descriptions, but cannot create a
skill, item, relationship, terrain rule, effect, perspective right, or other
authoritative fact.

## Create

1. The owner submits a natural-language instruction.
2. The server freezes that instruction for the attempt and asks the
   asset-specific structure generator for a typed candidate.
3. Server validation, normalization, bounded defaults, and domain checks produce
   the canonical structured definition or fail the attempt.
4. The server applies the schema disclosure ceiling, value-level target/channel
   policy, display-consumer contract, and applicable knowledge rules to project
   renderable structured facts and their bounded descriptions.
5. The description generator receives the frozen instruction plus that
   projection and produces the profile, scene description, or style description.
6. The server validates the description and atomically appends the definition,
   source digest, generated description, schema/compiler/projector versions, and
   content digests as one immutable generation. Only then does it move the
   current pointer and make the asset selectable.

Failure in either generation or validation stage creates no selectable partial
generation. Retrying the same idempotency key either returns the committed
generation or resumes/reports the same failed attempt; it does not append a
duplicate generation.

## Upgrade to the latest supported schema

Upgrade uses the same pipeline rather than a special battle-time migration:

```text
current displayed description
  -> regenerate current-schema structured definition
  -> regenerate displayed description from
       old description + display-consumer structured projection
  -> atomically activate the new generation
```

For a legacy character, the current profile is the natural-language source. For
a battlefield it is the current scene description; for a narration style it is
the current style description or instruction. Explicit deterministic mappings
may also carry separately stored legacy fields such as parameters or skill
records, but the converter must not invent facts absent from either source.

The owner/operator starts upgrade from the asset's detail screen with
`このキャラを最新版に更新` or the corresponding asset label. Upgrade is
explicit, owner-scoped, idempotent, and atomic. Failure retains the old current
pointer and unsupported status; success activates a new immutable generation.
Existing battles remain bound to their recorded generations.

## Compatibility and selection

An asset is selectable only when its current generation satisfies the current
asset schema and the required battle compiler contract. This is enforced in
both list/query paths and battle creation:

- unsupported, upgrading, and failed-upgrade assets remain visible to their
  owner on management/detail screens but are absent from player selectors,
  automatic matching, and random pools;
- direct IDs and stale clients are rejected again when creating the battle;
- character, battlefield, and narration-style eligibility are evaluated
  independently, and every selected asset must be ready;
- creation and upgrade never occur implicitly during selection or battle
  creation.

ADR-0010 accepts the exact status vocabulary, attempt persistence, concurrency
owner, and schema/compiler compatibility predicate in the common envelope
design. Each asset-family implementation remains gated by its own accepted ADR.
