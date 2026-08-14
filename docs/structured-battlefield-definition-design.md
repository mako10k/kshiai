# Structured battlefield definition design

- Status: Accepted implementation design
- Date: 2026-08-14
- Authority: ADR-0010 and ADR-0012
- PERT task: `SDA_BATTLEFIELD`

## Authority split

```text
owner source
  -> BattlefieldDefinitionV2 (reusable immutable authority)
  -> BattlefieldPublicPresentationV2 (stored derived card)
  -> ready preset generation
       -> BattlefieldCompilerV2
       -> BattlefieldInstance (battle-owned immutable start artifact)
       -> initial semantic/world state (battle-owned mutable state)
```

The definition controls possible structure. The instance freezes the exact
starting structure for one battle. Semantic/world state records what actually
changes. Neither public prose nor a concretization provider can move facts in
the opposite direction.

## Definition contract

Every array element uses a stable key unique within the definition. References
are validated before activation.

### Scene and areas

- `identity`: display name, category, tags, scale, atmosphere, genre.
- `appearance`: public summary, visual prompt, and optional immutable media
  revision.
- `areas`: name, bounded description, terrain class, movement difficulty,
  visibility, audibility, and surface conditions.
- `topology`: directed `from`/`to` area references with movement, sight, and
  sound relations. The provider cannot add edges at battle creation.
- `entryAreas`: exact area IDs for sides A and B.

### Effects and objects

- Effect triggers are closed to `battle_start`, `turn_start`, `entered_area`,
  `object_activated`, and `stagnation`.
- Durations are `persistent` or a bounded count of turns.
- Targets are `scene`, one exact area, all combatants, or occupants of one exact
  area.
- Cancellation is closed to `none`, `source_removed`, `object_disabled`, and
  `area_left`.
- First-class objects have a stable key, exact initial area, presence/exposure,
  and explicit portable, usable, cover, and blocking properties.
- Object and effect descriptions guide authorized rendering but cannot override
  their structured properties.

### Mechanics and evolution

The coefficient registry is finite: `damage`, `heal`, `spd`, and the currently
supported element channels `neutral`, `fire`, `water`, `wind`, `earth`,
`light`, and `dark`. Values remain bounded by the existing coefficient clamp.

Evolution pressures are closed to `weather_shift`, `visibility_shift`,
`hazard_escalation`, `structural_failure`, `crowd_shift`, and
`resource_emergence`. Each affordance names affected area/object IDs and a
bounded description. Forbidden discontinuities are explicit stable tags.

## Projection and disclosure

The public scene projection may include identity, atmosphere, area summaries,
observable terrain, public objects, and public persistent effects. It excludes
numeric coefficients, internal effect scheduling, hidden objects, topology
control metadata, and evolution control metadata.

The image projection contains only visual identity, atmosphere, visible areas,
terrain, visible objects, and visual conditions. Mechanics, hidden objects,
triggers, cancellations, and evolution controls are absent.

The public-description claim receipt uses exact projection references. A fact
segment without support, a mechanics/control claim, or an unknown proper noun
blocks activation.

## Authoring and compatibility

The attempt kinds and states are those accepted by ADR-0010. Creation has no
visible logical row before confirmation. Revision and upgrade freeze the
expected ready generation ID and content digest. Confirmation rechecks both,
appends schema 2, updates the read model, and moves the current pointer in one
transaction.

Legacy mapping is bounded:

- display/category/tags/appearance map directly;
- each unique terrain hint becomes one area in stable input order;
- if no terrain hint exists, one `main` area is created;
- adjacent input areas receive bidirectional open topology;
- obstacle hints become stable public objects in the first area;
- condition hints become persistent scene effects;
- only registered coefficient keys survive;
- the legacy narrative blurb is upgrade source and never parsed as structure.

System seed import uses the same mapping with `sourceKind=import`. User rows are
never imported automatically.

## Deterministic compiler

`battlefield-instance-v2` performs no provider call. It:

1. validates the ready envelope and required compiler versions;
2. copies scene identity and the declared entry/topology snapshot;
3. renders a bounded terrain summary from ordered areas;
4. maps ordered objects and effects to public instance fields;
5. copies only registered coefficients;
6. creates semantic seed IDs from definition IDs without renaming;
7. freezes evolution affordances in the instance;
8. records the preset generation in the battle manifest before persistence.

The same generation therefore produces byte-equivalent compiler output. Any
desired variety must be represented by a future versioned deterministic
selection policy over authored alternatives, not unbounded provider invention.

## Cutover matrix

| Surface | Unsupported | Ready V2 |
| --- | --- | --- |
| Management list/detail/delete | allowed when accessible | allowed |
| Explicit upgrade | allowed for owner/operator | `already_current` |
| Chat/image | `battlefield_upgrade_required` | immutable candidate/revision |
| Match selector/search | excluded | included |
| Random system pool | excluded | included |
| Policy generation/direct ID | rejected | exact generation read |
| Battle creation | rejected | read-only bind and deterministic compile |

## Acceptance boundary

Local acceptance requires schema/compiler tests, repository transaction tests,
actual HTTP/persistence tests, selection and direct-ID rejection, read-only
battle binding, immutable image/import paths, full workspace tests, typecheck,
build, and PERT validation. Release, Stage, production Promote, and bulk
migration remain separately gated.
