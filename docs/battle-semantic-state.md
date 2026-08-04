# Battle semantic state

Status: implemented and locally accepted
Last updated: 2026-08-04
Implementation plan: [`docs/battle-semantic-state.pert`](battle-semantic-state.pert)

## 1. Purpose

Battle narration previously described more world change than the persisted
battle state could represent. A character could pick up a pipe, break a window,
become covered in dust, or form a new belief in prose, while the next turn still
started from the original obstacle list and static portrait description.

This design introduces one mutable, structured semantic snapshot per battle and
retains only the immediately preceding JSON Pointer transition. It preserves the
existing authority split:

- deterministic code owns parameters, resource costs, action legality, defeat,
  winner settlement, persistence, and patch validation;
- structured LLM output owns semantic interpretation of free-form character,
  action, and battlefield descriptions;
- character agents own each character's private continuity;
- the narrator renders already-committed facts and does not mutate state.

## 2. Goals

1. Persist observable scene, field-object, and character changes between turns.
2. Make the latest before/after difference compact, inspectable, and easy to patch with
   JSON Pointer tooling, `jq`, or an application-level maintenance command.
3. Treat sides A and B symmetrically using the same state shape and turn phase.
4. Let schemas remain genre-neutral and extensible without accepting arbitrary
   edits to mechanical or private state.
5. Give each character a post-resolution perception of committed changes before
   updating its private goal, emotion, beliefs, observations, and memory.
6. Keep old saved battles loadable without rewriting their historical turns.

## 3. Non-goals

- This is not a rigid physics, anatomy, spatial-grid, or inventory simulation.
- Semantic facts do not directly set HP, parameters, action legality, or winners.
- Natural-language keywords, regular expressions, or substring checks do not
  select mechanics or infer semantic patches.
- The initial implementation does not generate a new battlefield image every
  time the semantic state changes.
- The system does not expose private agent state or hidden combat parameters in
  the public battle DTO.

## 4. Pre-implementation state and gaps

### 4.1 Existing persisted state

- `BattlefieldInstance` freezes `terrain`, `obstacles`, and `conditions` at match
  start as strings.
- `Situation` stores one scene string, notes, tags, and bounded coefficients.
- `CombatantState` stores deterministic parameters and fightability.
- `CharacterAgentState` stores private memory, goal, emotion, beliefs,
  observations, voice, and last speech.
- `BattleTurnRecord` stores engine events, parameter changes, cognition, and
  private-agent diffs.
- `battles.state_json` stores the complete `BattleState` snapshot.

### 4.2 Missing causal continuity

The current model has no authoritative representation for these transitions:

```text
field object -> held object
intact object -> broken object + resulting debris
baseline character appearance -> battle-visible change
resolved action -> scene change -> character perception -> private reaction
```

`TurnEvent` is presentation-oriented and identifies actors and targets mainly by
display name. Actions are not retained as first-class turn records. Situation
proposals occur before resolution, so they cannot authoritatively describe the
current action's consequences. Character-agent advancement must therefore run
for external narration too; narration perspective changes presentation, not
whether private continuity and next-turn intent advance.

## 5. Design principles

### 5.1 Stable envelope, flexible facts

The outer document and mutation protocol are validated strictly. Domain facts
inside an entity remain JSON values with shallow, bounded nesting. This keeps
queries and patches stable while allowing unfamiliar fictional concepts.

### 5.2 Stable IDs and maps, not mutable array indexes

Every identity-bearing item is stored in a record keyed by a stable entity ID.
Patches address `/entities/window.north`, not `/obstacles/3`. Arrays may be used
for scalar display values, but not as the canonical identity of mutable objects.

### 5.3 One canonical home per fact

An object's location is stored on that object. A second inventory list must not
duplicate ownership. A query derives “items held by A” from entity locations.
Mechanical parameters remain in `CombatantState`; private conclusions remain in
`CharacterAgentState`.

### 5.4 No destructive disappearance

Consumed, destroyed, or removed entities remain as inactive/tombstoned entities
with lifecycle facts. This prevents accidental resurrection and preserves an
audit trail. A picked-up entity moves to a holder rather than being deleted.

### 5.5 Patches are proposals until validated

LLM output never mutates a battle directly. The server checks revision, allowed
roots, operation count, paths, IDs, value size/depth, and protected namespaces,
then applies the patch atomically.

## 6. Data model

The following TypeScript is illustrative. Zod schemas are the implementation
authority.

```ts
type SemanticScalar = string | number | boolean | null;
type SemanticValue =
  | SemanticScalar
  | SemanticValue[]
  | { [key: string]: SemanticValue };

type SemanticLocation =
  | { type: "scene"; area: string }
  | { type: "held"; side: "a" | "b" }
  | { type: "attached"; entityId: string }
  | { type: "absent" };

type BattleSemanticEntity = {
  kind: "character" | "object" | "terrain" | "effect" | "other";
  label: string;
  location: SemanticLocation;
  active: boolean;
  createdTurn: number;
  updatedTurn: number;
  facts: Record<string, SemanticValue>;
  visibleTo?: Array<"a" | "b">; // omitted means both
};

type BattleSemanticState = {
  schemaVersion: 1;
  revision: number;
  scene: {
    summary: string;
    facts: Record<string, SemanticValue>;
  };
  entities: Record<string, BattleSemanticEntity>;
};
```

### 6.1 Required character entities

Every state contains `character.a` and `character.b` with identical shapes.
Their flexible facts may contain values such as:

```json
{
  "posture": "standing",
  "expression": "watchful",
  "visible_conditions": {
    "dust": "coat and hair are covered in pale dust"
  },
  "appearance_changes": {}
}
```

These facts are observable battle overlays. They do not replace the immutable
character profile or portrait, and they do not contain private thoughts.

### 6.2 Field entities

Create entities only for things likely to be moved, held, consumed, broken,
used as cover, or otherwise revisited. Ambient qualities such as rain, darkness,
temperature, or crowd mood normally belong in `scene.facts`.

```json
{
  "window.north": {
    "kind": "object",
    "label": "north window",
    "location": { "type": "scene", "area": "main hall" },
    "active": true,
    "createdTurn": 0,
    "updatedTurn": 0,
    "facts": {
      "material": "glass",
      "integrity": "intact"
    }
  }
}
```

### 6.3 Fact-key policy

- Keys use stable `snake_case` identifiers.
- Existing keys are reused when they express the same concept.
- New keys are allowed only when existing facts cannot represent the concept.
- Identity-bearing collections use keyed objects instead of arrays.
- Values are bounded in byte size and nesting depth; the initial target is a
  maximum depth of 3 below `facts`.
- The validator does not interpret fact wording as mechanics.

### 6.4 Side-specific observation

Entities are visible to both sides when `visibleTo` is omitted. A structured
`["a"]` or `["b"]` scope is used only when the entity as a whole is not
observable by the other side. Required character entities remain visible to
both. The engine filters entities using this field and committed locations; it
never searches descriptions for words such as “hidden” or “noticed”. Ambient
scene facts are public. A side-specific detail should therefore be represented
as an entity rather than a private scene-fact convention.

Each A/B/public observation contains only its current filtered snapshot and the
diff from the immediately previous revision. It contains no `visibleTo` metadata
and no older snapshots. Required characters, entities changed in the latest
transition, held or attached entities, and the most recently updated remaining
entities are selected deterministically, up to 32 observed entities.
The diff is calculated against the exact snapshot retained from the preceding
turn, not a newly projected approximation of that snapshot. Attached entities
are included only together with their complete observable attachment chain;
missing, hidden, or cyclic attachment targets cannot produce dangling public or
side-specific references.
An attached entity cannot be visible to a side that cannot observe its target.
Character roots always use scene locations; restraints, equipment, and effects
attach to the character instead of making the character depend on another root.

## 7. Patch model

The mutation format is JSON Patch-inspired and uses JSON Pointer paths. A turn
envelope adds optimistic concurrency and causal references.

```ts
type SemanticPatchOperation =
  | { op: "add"; path: string; value: SemanticValue | BattleSemanticEntity }
  | { op: "replace"; path: string; value: SemanticValue | BattleSemanticEntity }
  | { op: "remove"; path: string };

type TurnSemanticPatch = {
  baseRevision: number;
  turn: number;
  sourceEventIds: string[];
  operations: SemanticPatchOperation[];
};
```

The first implementation permits writes only below `/scene` and `/entities`.
Entity deletion through `remove` is rejected; set `active` to `false`, set its
location to `absent`, and record a lifecycle fact instead. Removing a disposable
leaf fact is permitted.

Example: A picks up a pipe.

```json
{
  "baseRevision": 3,
  "turn": 2,
  "sourceEventIds": ["turn-2-action-a"],
  "operations": [
    {
      "op": "replace",
      "path": "/entities/iron_pipe.1/location",
      "value": { "type": "held", "side": "a" }
    }
  ]
}
```

Example: A window breaks and fragments are created.

```json
{
  "baseRevision": 5,
  "turn": 3,
  "sourceEventIds": ["turn-3-hit-b"],
  "operations": [
    {
      "op": "replace",
      "path": "/entities/window.north/facts/integrity",
      "value": "broken"
    },
    {
      "op": "add",
      "path": "/entities/glass_fragments.1",
      "value": {
        "kind": "object",
        "label": "scattered glass fragments",
        "location": { "type": "scene", "area": "below the north window" },
        "active": true,
        "createdTurn": 3,
        "updatedTurn": 3,
        "facts": {
          "integrity": "fragmented",
          "hazard": "sharp"
        }
      }
    }
  ]
}
```

## 8. Authority and validation

### 8.1 Protected mechanical state

Semantic patch paths can never address these values:

- `sideA` or `sideB` parameters and base parameters;
- resource costs, defending, `canFight`, or irreversible incapacity;
- turn, turn limit, status, winner, finish reason, or rating settlement;
- policies and action selection;
- private agent states or prior turn records.

The semantic reconciler may return a separately validated proposal for bounded
*next-turn* situation coefficients. It cannot change the mechanics of the turn
that produced the patch. The engine does not derive coefficients by matching
words inside semantic facts.

### 8.2 Patch validation

Before application, the server verifies at least:

1. `baseRevision` equals the current semantic revision.
2. The turn equals the resolved turn.
3. Every supplied `sourceEventId` names an event from that resolved turn.
4. Operations stay within allowed roots and configured count/size limits.
5. Replaced entities and referenced locations exist where required.
6. `character.a` and `character.b` cannot be removed, change identity, or stop
   using scene-root locations.
7. New IDs are unique, safe JSON Pointer segments, and stable within the battle.
8. `createdTurn` and `updatedTurn` agree with server-owned turn metadata.
9. The resulting document passes the complete semantic-state schema.

Server code supplies turn metadata rather than trusting model-generated values.
The complete patch applies atomically or not at all.

## 9. Battle initialization

### 9.1 New battles

Extend battlefield concretization so its structured response includes an initial
semantic scene and interactable field entities. This replaces the current model
where the LLM primarily returns detailed strings. Keep `narrativeSetup` and scene
summary for display and fallback, but treat `BattleSemanticState` as the mutable
source of truth.

The server always injects the two character entities with stable IDs. Their
baseline appearance is copied as a string fact from `appearance.summary`; the
server does not parse that prose into mechanics.

### 9.2 Legacy battles

`semanticState` is optional while old state JSON exists. On read or advance,
`ensureBattleSemanticState` creates a deterministic revision-0 seed from already
structured fields:

- `Situation.scene` and notes become the scene summary/facts;
- each existing battlefield obstacle becomes a stable object entity;
- battlefield terrain and conditions become scene facts;
- side A and B become the required character entities.

This compatibility path does not reinterpret prose, call an LLM, or rewrite old
turn records. The next normal save persists the seed.

## 10. Per-turn pipeline

```text
1. Load mechanical state, semantic snapshot, and private agent states.
2. Select and record both intended actions using stable side/action IDs.
3. Deterministic engine validates and resolves mechanics; it emits stable events.
4. Semantic reconciler receives:
     before semantic snapshot
     resolved actions and events
     battlefield baseline and public character descriptions
   It returns a structured semantic patch and optional next-turn coefficient proposal.
5. Server validates and atomically applies the semantic patch.
6. Server builds A/B cognition from committed mechanics plus the post-patch
   A/B observable snapshot and latest observation diff. Projection uses only
   structured visibility, ownership, locations, and committed state.
7. A/B character agents advance in parallel from their own private state and
   reserve one validated next-turn action from their own structured finisher
   window and available-action list.
8. Server derives compact action beats from resolved actions, selected policy
   fields, skill/basic-action descriptions, and committed event outcomes.
9. Narrator receives those beats, the last two public turn blocks, the permitted
   inner digests, and the final observable snapshot; it produces presentation only.
10. Persist the latest canonical snapshot, latest transition, latest A/B/public
    observations, bounded DramaState, current private agent states, and ordinary
    mechanical turn record.
```

Character-agent advancement runs for every narration perspective. Perspective
continues to control what the narrator may see, not whether private continuity
exists.

## 11. Latest transition and bounded continuity

Semantic snapshots and agent-state changes are not copied into turn records.
`BattleState` retains only:

```ts
type LatestSemanticTransition = {
  turn: number;
  status: "applied" | "rejected" | "skipped";
  fromRevision: number;
  toRevision: number;
  patch: TurnSemanticPatch | null;
};
```

`observationStateA`, `observationStateB`, and `observationStatePublic` each hold
only a current filtered snapshot and its latest diff. Longer subjective history
is retained only when a character agent chooses to summarize it in bounded
memory or beliefs. Full semantic replay is deliberately not supported.

`DramaState` is also bounded and contains no full prose history. It retains only
the last action signature per side, consecutive repetition counts, turns since a
location/environment beat, a three-entry structured beat fingerprint window,
the last public speech per side, and the current opening/rising/climax phase.
It can request a non-mechanical semantic environment beat; only the separate
anti-stall supervisor may propose symmetric mechanical environment effects.

## 12. Query and maintenance model

The application owns a provider-neutral patch library shared by runtime and
maintenance tooling. The maintenance command emits JSON suitable for `jq`:

```text
npm run battle-state --workspace=backend -- inspect <battle-id> [json-pointer]
npm run battle-state --workspace=backend -- diff <battle-id>
npm run battle-state --workspace=backend -- patch <battle-id> <expected-revision> <patch.json>
```

The command validates the same schemas and protected paths as runtime code.
Patch writes also acquire the normal battle lease and recheck the expected
revision after acquiring it.
Direct SQL JSON mutation is reserved for recovery because SQLite JSON functions
and PostgreSQL JSONB functions differ and can bypass invariants.

Example queries remain straightforward because entities are keyed maps:

```text
/entities/window.north/facts/integrity
/entities/character.a/facts/visible_conditions
all entities whose location is { type: "held", side: "a" }
```

## 13. Public projection and privacy

`BattlePublic` exposes the current public observation and latest public diff:

- scene summary;
- active field entities relevant to the current scene;
- A/B observable character overlays;
- no hidden coefficients, raw parameter values, private memories, beliefs, or
  maintenance metadata.

The narrator receives only the same observable facts plus inner digests allowed
by the existing narration-perspective gate. The semantic reconciler receives no
private agent state.

## 14. Failure behavior

- Initialization failure: construct a deterministic minimal seed from the
  concretized battlefield and character summaries.
- Reconciler timeout or provider failure: retain the current semantic state,
  set the latest transition status to `skipped`, and continue with engine events.
- Invalid or conflicting patch: reject the entire patch, record bounded
  diagnostics server-side, and continue without semantic mutation.
- Agent failure: retain that character's previous private state. The latest
  observation remains available, but no private-state history is created.
- Narrator failure: use committed events and current observable state for the
  existing presentation fallback. Presentation failure never rolls back state.

No fallback infers semantic changes by searching free-form prose.

## 15. Size and lifecycle limits

Initial limits, configurable after measurement:

- at most 24 semantic operations per turn;
- at most 64 active entities and 128 total entities per battle;
- at most 32 facts per entity;
- maximum fact nesting depth 3;
- maximum semantic patch payload 16 KiB;
- maximum complete semantic snapshot 16 KiB;
- maximum 32 entities in each A/B/public observation snapshot;
- retain all entity tombstones for the duration of the battle;
- do not duplicate semantic snapshots, observation snapshots, patches, or
  private-agent state changes in the turn-record window.

Limit failures reject the patch rather than truncating it into a different
meaning.

## 16. Implementation mapping

| Area | Primary files | Change |
|------|---------------|--------|
| Shared schema | `packages/shared/src/battle.ts` | Semantic state, patch, action/event IDs, turn-record extensions, public projection |
| Patch engine | new `packages/shared/src/semantic-state.ts` | Pointer validation, atomic apply, diff helpers, legacy seed |
| Engine record | `packages/shared/src/battle-engine.ts` | Stable action/event records and post-resolution cognition inputs |
| Provider contract | `backend/src/llm/types.ts` | Initialization and reconciliation structured outputs |
| Provider prompt | `backend/src/llm/openai-compatible.ts`, `mock.ts` | Initial structure, semantic patches, bounded fallback |
| Turn orchestration | `backend/src/services/battle-service.ts` | Resolve -> reconcile -> apply -> agents -> narrate |
| Persistence | `backend/src/repositories/battles.ts` | Soft compatibility and deterministic legacy seed |
| Operations | `backend/src/scripts/battle-semantic-state.ts` | JSON inspect/diff and lease/revision-guarded patch commands |
| Frontend | `frontend/src/pages/` | Optional bounded observable-state presentation |
| Tests | colocated `*.test.ts` | Patch, migration, symmetry, privacy, pipeline, failure coverage |

No database table migration is required for the first version because the full
battle state is already persisted in `state_json`. Indexes or extracted columns
may be added later only for measured cross-battle query needs.

## 17. Acceptance criteria

1. Picking up an entity changes its canonical location to side A or B; it no
   longer appears in a query for field-located entities and can later be dropped.
2. Breaking an intact window persists the broken state and creates fragments;
   both remain visible on the next turn and cannot silently revert.
3. A visible character change persists independently of the immutable character
   sheet and is supplied to both cognition and narration as appropriate.
4. A/B use the same state shape, validation, and post-resolution update stage;
   side-swapped fixtures produce side-swapped semantic results.
5. A character updates private state only after receiving committed mechanical
   and semantic consequences. External narration does not disable this update.
6. Invalid paths, stale revisions, oversized payloads, entity deletion, and
   protected mechanical/private edits fail closed without partial mutation.
7. Narration cannot resurrect inactive or consumed entities because it reads the
   committed final snapshot and has no mutation authority.
8. Legacy active and finished battles load without an LLM migration and remain
   resumable or viewable.
9. Public DTOs contain no private state, hidden coefficients, or raw parameters.
10. Tests contain no semantic routing based on regex, keyword lists, or
    `includes()` against free-form battle prose.

## 18. Decisions deferred until implementation evidence

- Whether semantic reconciliation can share one provider request with another
  structured fast-model operation after latency and token-cost measurement.
- Whether long battles require a compacted semantic-patch archive beyond the
  existing turn-record retention window.
