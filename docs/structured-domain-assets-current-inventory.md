# Structured selectable assets: current-state inventory

- Status: Current-state evidence for `SDA_ENVELOPE_DESIGN`
- Date: 2026-08-13
- Scope: characters, battlefield presets, narration styles, asset generations,
  selection, and battle binding
- Related: [authoring workflow](structured-asset-authoring-workflow.md),
  [information projection](structured-asset-information-projection-design.md),
  [ADR-0003](adr/0003-revision-editable-assets-and-bind-battles.md)

## Result

The repository already has immutable generation IDs and an embedded battle
manifest, but it does not yet have the proposed structured-asset boundary.
Current rows mix authoring structure, public prose, private/internal fields, and
compiled runtime input. Eligibility is inferred from row existence rather than
an explicit compatibility contract. Most importantly, battle creation currently
uses the same write-and-activate operation as authoring, so selecting an asset
can append a generation and move its current pointer.

These findings make the P1 work a contract replacement around existing assets,
not merely the addition of more fields.

## Existing reusable seams

| Seam | Current behavior | Reuse decision |
| --- | --- | --- |
| Immutable generation record | `asset_generations` records type, logical ID, monotonic generation, generation ID, schema version, canonical content digest, and content | Retain the identity and canonical-digest approach |
| Current pointer | `asset_current_generations` names one current generation per logical asset | Retain, but only authoring activation may move it |
| Transaction serialization | `writeAssetGeneration` runs inside a transaction and uses a PostgreSQL advisory transaction lock per asset | Retain per-asset serialization; add expected-current/source conflict checks |
| Battle manifest | `BattleAssetManifest` embeds validated snapshots and generation IDs | Retain immutable battle-owned snapshots; add compiler/projector identity where behavior depends on it |
| Battle resume | Existing battle paths prefer manifest snapshots over mutable current rows | Retain and make universal for authoritative asset input |
| Request idempotency | A general idempotency table and battle-create ownership pattern already exist | Reuse the pattern, but persist authoring attempts and terminal failures explicitly |

## Shared generation and persistence

Current evidence:

- `backend/src/db.ts:55-92` stores mutable character rows, generic immutable
  generation rows, current-generation pointers, and character drafts.
- `backend/src/db.ts:251-279` stores battlefield and narration-style current
  values as mutable `sheet_json` rows.
- `backend/src/repositories/asset-generations.ts:9-18` has a generic generation
  envelope whose payload is one untyped `content` value.
- `backend/src/repositories/asset-generations.ts:67-148` computes a digest,
  appends a generation, and updates the current pointer in the same operation.
  Identical content returns the existing current generation.

Gaps:

- no distinct structured definition, public description, source provenance,
  disclosure policy, compiler versions, or projection versions;
- no persisted authoring-attempt state for a two-stage model workflow;
- no explicit asset compatibility/readiness state or failure diagnostics;
- generation append cannot be staged independently of current activation;
- idempotency by content digest is insufficient for retries whose frozen input
  is the same but whose provider output differs;
- the current pointer has no caller-supplied expected-generation guard.

## Character

Current evidence:

- `packages/shared/src/character.ts:223-277` stores identity, presentation,
  mechanics, visibility, records, learned memories, and revision state in one
  `CharacterSheet`.
- `packages/shared/src/character.ts:280-298` derives a battle snapshot by
  omitting several mutable fields, but it still uses the legacy sheet schema.
- `packages/shared/src/character.ts:413-474` and `:502-550` define a hard-coded
  public DTO rather than a schema/value/consumer projection.
- `backend/src/routes.ts:579-657` asks one provider operation to generate the
  whole sheet, including its public blurb, then stores that sheet as a draft.
- `backend/src/repositories/characters.ts:209-289` returns all active owner
  characters for management; `:292-342` constructs opponent candidates from
  active/visible rows without a schema or compiler compatibility predicate.
- `backend/src/llm/types.ts:150-165` still lets the conscious expression stage
  receive the raw `interior` member of character-agent state.

Consequences:

- the structured definition and displayed profile are not separately generated
  or validated;
- publication is coded as a single DTO mapping and cannot differ by target;
- management and battle-selection concerns are not represented separately;
- present LLM consumer types do not consistently enforce self-awareness and
  latent-state boundaries.

## Battlefield preset

Current evidence:

- `packages/shared/src/battlefield.ts:48-68` mixes card data, loose terrain,
  obstacle and condition hints, hidden coefficients, and public prose.
- `packages/shared/src/battlefield.ts:70-90` omits coefficients from the public
  DTO but has no target-, channel-, or runtime-knowledge policy.
- `backend/src/routes.ts:1191-1211` generates structure-like fields and public
  prose in one provider result and immediately saves it.
- `backend/src/repositories/battlefields.ts:18-89` seeds and refreshes system
  mutable rows directly; `:98-139` uses the same accessible list for display
  and selection; `:180-209` writes a generation and mutable row together.
- `packages/shared/src/battlefield.ts:95-110` already distinguishes a concrete,
  battle-scoped instance from a preset. That distinction should be preserved.

Consequences:

- preset definition, public scene card, and concretization guidance are not
  separate authorities;
- neither user nor system presets carry an explicit readiness state;
- seed refreshes can mutate current rows without a corresponding generation;
- random and direct selection cannot filter on compiler compatibility.

## Narration style

Current evidence:

- `packages/shared/src/narration-style.ts:12-33` stores the public description
  beside a free-form runtime `instruction` and perspective.
- `packages/shared/src/narration-style.ts:35-46` exposes the raw runtime
  instruction in the public DTO.
- `backend/src/routes.ts:1322-1369` permits direct manual creation/update of the
  instruction, while generated creation obtains description and instruction
  from one provider call.
- `backend/src/repositories/narration-styles.ts:20-59` refreshes system mutable
  rows directly; `:68-90` lists all accessible rows; `:103-130` silently falls
  back to the default style when an explicitly requested style cannot be used.

Consequences:

- an implementation-oriented prompt instruction is part of the external editing
  and DTO surface;
- the public description and compiled rendering policy can drift independently;
- an explicit stale/unsupported selection can silently mean a different style.

## Battle creation and immutable binding

Current evidence:

- `backend/src/services/battle-service.ts:546-575` reads current character,
  battlefield, and narration rows before creating the battle.
- `backend/src/services/battle-service.ts:654-712` calls
  `createAssetGeneration` for both selected characters, the narration style, and
  the source battlefield preset during battle creation.
- the narration write uses the smaller `NarrationStyleSnapshot`, while normal
  narration authoring writes the full `NarrationStyle`. The battlefield write
  also normalizes its snapshot clock. Both can therefore have a digest different
  from the asset's authoring generation and move its current pointer.
- `backend/src/services/battle-service.ts:714-759` then embeds generation IDs,
  digests, and snapshots into `BattleAssetManifest`.
- `packages/shared/src/battle.ts:1663-1704` validates that version-1 manifest.

Required correction:

```text
authoring or explicit upgrade
  -> append fully validated asset generation
  -> atomically activate current pointer

battle creation
  -> resolve accessible current generation
  -> require readiness and compiler compatibility
  -> compile and bind that exact generation
  -> never append or activate a selectable-asset generation
```

A battle-owned battlefield instance and other genuinely battle-owned immutable
artifacts may still be created during battle creation. They must use a distinct
asset type and cannot move a selectable preset's current pointer.

## API and UI separation needed

The current collection endpoints serve both management and match UI. The common
contract needs two server-owned views:

- a management/detail view that includes unsupported and failed assets plus the
  compatibility reason and explicit upgrade affordance;
- a selection view that returns only accessible `ready` generations compatible
  with every required compiler.

Battle creation repeats the selection predicate under the asset lock or an
equivalent consistent read. A stale client supplying a direct logical ID fails
with a typed incompatibility result. An explicitly supplied unavailable
narration style must not silently fall back; only omission may choose an eligible
default.

## P1 implementation seams

P1 must introduce, after ADR acceptance:

1. shared envelope, compatibility, projection-context, and management DTO
   contracts;
2. authoring-attempt persistence with idempotency and terminal error receipts;
3. separately testable append and activation repository operations;
4. server-side management versus selection queries;
5. battle binding that reads existing ready generations and records exact
   compiler outputs without mutating selectable assets;
6. asset-family adapters so P2-P4 can replace one legacy family at a time while
   the public launch remains blocked until the integrated cutover acceptance.
