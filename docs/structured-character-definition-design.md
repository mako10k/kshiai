# Structured character definition and derived profile design

- Status: Accepted by ADR-0011; local P2 implementation active
- Date: 2026-08-13
- Decision owner: Product owner
- PERT task: `SDA_CHARACTER`
- Related: [ADR-0011](adr/0011-structured-character-definition.md),
  [common asset envelope](structured-asset-envelope-design.md),
  [projection matrix](structured-character-projection-matrix.md),
  [character focus result](character-focus-hypothesis-plan.md), ADR-0004,
  ADR-0008, and ADR-0010

## Result

The character asset becomes an immutable `CharacterDefinitionV2` plus a derived
public profile. Stable identity/background, psyche disposition, action norms,
speech tendencies, relationship seeds, mechanics, capabilities, equipment,
items, and initial loadout are structured. Bounded descriptions retain nuance.
Operational ownership, visibility, records, learned opponent memory, deletion,
draft state, and all mutable battle state live outside the definition.

The definition compiles into least-authority inputs for mechanics, private deep
psyche, conscious action/expression, observer-relative counterpart knowledge,
and perspective-specific narration. No consumer receives the entire definition.

## Current boundary to replace

Today `CharacterSheet` mixes identity, public prose, image state, combat values,
decision principles, records, improvement state, learned opponent memory, and a
one-step undo snapshot. One model call creates both structure-like fields and
`narrativeBlurb`; owner chat mutates the current sheet and public prose together.
The public DTO is a fixed field pick rather than a target-aware projection.

At battle time `CharacterSelfProfileAnchorV1` copies the public blurb and broad
self profile into several consumers. `CharacterExpressionCompactInput` still
receives raw `interior`, despite the intended deep-psyche/conscious boundary.
Opponent knowledge is safer because it is already built from a perception frame,
but static relationship and publicity policy are not part of that projection.

The new contract replaces these seams; it does not add another parallel profile
beside `CharacterSheet` as a permanent runtime path.

## Definition ownership

The immutable character generation owns:

- stable authored facts and their bounded descriptions;
- schema-ceiling and value audience policy references;
- deterministic combat inputs and initial item definitions;
- stable disposition inputs used to seed/version psyche compilers;
- stable self-awareness declarations;
- stable relationship seeds and speech/action behavioral policies;
- the derived public profile and its claim-support receipt.

The logical character record, outside the generation, owns:

- owner user ID, public/friends/private match visibility, current generation,
  compatibility status, soft deletion, and active authoring attempt;
- public and owner-only ratings/records;
- improvement analysis and durable learned opponent memory;
- media retention/tombstone state;
- operational timestamps that do not change battle behavior.

The battle owns current HP/resources, conditions, held/worn/dropped item state,
wounds, observations, beliefs, thoughts, latent psyche, attention/focus state,
conversation, and evolving relationship state. None is written back to the base
definition implicitly.

## Proposed definition schema

The following is normative logical shape. P2 implementation expresses it as
strict shared Zod schemas with the same bounds and stable IDs.

```ts
type CharacterDefinitionV2 = {
  schemaVersion: 2;
  identity: CharacterIdentityDefinitionV2;
  appearance: CharacterAppearanceDefinitionV2;
  profileBackground: CharacterBackgroundEntryV2[];        // max 16
  psycheDisposition: CharacterPsycheDispositionV2;
  actionNorms: CharacterActionNormV2[];                    // max 12
  speechPolicy: CharacterSpeechPolicyV2;
  relationshipSeeds: CharacterRelationshipSeedV2[];       // max 24
  combat: CharacterCombatDefinitionV2;
  capabilities: CharacterCapabilitiesV2;
  inventory: CharacterItemDefinitionV2[];                  // max 16
  initialLoadout: CharacterInitialLoadoutEntryV2[];         // max 16
  expressionNotes: CharacterDescriptionV2 | null;
};
```

All collection element IDs are stable within the logical character. A new
generation retains an ID for the same semantic element, uses a new ID for a new
element, and removes rather than reuses an obsolete ID. Display names never act
as references.

### Bounded expressive text

```ts
type CharacterDescriptionV2 = {
  text: string;                    // 1..600 characters
  consumerTags: RegisteredCharacterConsumer[]; // max 6
  sourceSupportRefs: string[];     // max 8, authoring-only stable claim refs
};
```

An element description explains its element. `expressionNotes` is a final
bounded escape hatch for cross-cutting voice or characterization that cannot be
represented by narrower fields. Descriptions can guide named LLM consumers but
cannot create a skill, modify a numeric effect, grant knowledge, widen
disclosure, or override a structured norm. Consumer compilers enforce per-call
item and character budgets.

## Identity and appearance

```ts
type CharacterIdentityDefinitionV2 = {
  displayName: string;             // required public, 1..48
  names: Array<{                   // max 12
    id: string;
    kind: "real_name" | "nickname" | "self_reference" | "epithet";
    value: string;
    description: CharacterDescriptionV2 | null;
  }>;
  presentation: {
    form: string | null;           // human, spirit, machine, etc.; not invented
    gender: string | null;
    ageDescription: string | null;
    pronouns: string[];             // max 6
  };
  tags: string[];                  // max 12
};

type CharacterAppearanceDefinitionV2 = {
  publicSummary: string;           // visible appearance only, max 600
  details: Array<{                 // max 16
    id: string;
    region: "face" | "hair" | "body" | "clothing" | "accessory" |
      "aura" | "form" | "other";
    description: CharacterDescriptionV2;
  }>;
  visualPrompt: string;            // restricted image-generator input, max 1600
  portrait: { mediaId: string; revisionId: string } | null;
};
```

`displayName` is the mandatory public card label, but public availability does
not give an opponent in-battle identity knowledge. Other names, age, gender,
form, pronouns, tags, appearance, and portrait are `public_eligible` values.
Their actual audience is selected by the immutable disclosure policy.

The portrait references an immutable media revision. A regenerated or toggled
portrait produces a new character generation; the prior generation and battles
retain their referenced media revision. The previous-image undo buffer remains
operational edit history, not definition truth.

## Background and stable disposition

```ts
type CharacterBackgroundEntryV2 = {
  id: string;
  kind: "origin" | "formative_event" | "role" | "affiliation" |
    "belief_context" | "relationship_history" | "other";
  summary: string;                 // max 240
  description: CharacterDescriptionV2;
  selfAwareness: "unaware" | "partial" | "aware";
};

type CharacterPsycheTendencyV2 = {
  id: string;
  label: string;                   // owner/internal stable label
  backgroundRefs: string[];        // CharacterBackgroundEntry IDs, max 6
  triggerKinds: Array<
    "threat" | "uncertainty" | "loss_of_control" | "humiliation" |
    "affiliation" | "recognition" | "injury" | "success" | "failure" |
    "counterpart_distress" | "environmental_change" | "other"
  >;                               // max 6
  selfAwareness: "unaware" | "partial" | "aware";
  tendencyDescription: CharacterDescriptionV2;
  manifestationDescription: CharacterDescriptionV2;
};

type CharacterPsycheDispositionV2 = {
  dynamicsVersion: "psyche-trait-profile-v1";
  dynamics: {
    adverseSensitivity: number;    // integer 0..1000
    uncertaintySensitivity: number;
    recoverySpeed: number;
    irritationPersistence: number;
    anxietyPersistence: number;
    approachTendency: number;
    withdrawalTendency: number;
    impulseInhibition: number;
    expressionRestraint: number;
  };
  coreNeeds: Array<{               // max 6
    id: string;
    description: CharacterDescriptionV2;
    selfAwareness: "unaware" | "partial" | "aware";
  }>;
  tendencies: CharacterPsycheTendencyV2[]; // max 12
  description: CharacterDescriptionV2 | null;
};
```

The numeric dynamics and awareness controls are `restricted`. They compile to
the accepted deterministic `PsycheTraitProfileV1`; models never receive those
numbers. Background, tendency explanation, and manifestation descriptions are
independently `public_eligible`. Thus an author may publish why a character tends
to freeze under praise without publishing a latent sensitivity value or a
battle-time activation.

`selfAwareness` controls conscious-character projection, not human owner access
and not profile publication. `unaware` tendency causes and labels go only to the
private psyche compiler. `partial` supplies a bounded felt pattern without the
hidden causal label. `aware` may supply its allowed description to conscious
context. The owner editor can inspect the complete static definition; there is
no base-definition field for live subconscious state.

## Action norms

```ts
type CharacterNormClauseV2 = {
  kind: "always" | "battle_phase" | "self_condition" |
    "counterpart_condition" | "resource_band" | "distance_band" |
    "relationship_band" | "observed_event_kind";
  operator: "is" | "is_not" | "at_least" | "at_most";
  value: string;                    // registered value for the selected kind
};

type CharacterActionNormV2 = {
  id: string;
  when: {
    match: "all" | "any";
    clauses: CharacterNormClauseV2[]; // 1..6
  };
  response: {
    disposition: "prefer" | "avoid" | "allow_only" | "forbid";
    actionRefs: string[];          // stable basic/skill/item action IDs, max 8
    actionKinds: Array<"basic_action" | "skill" | "defend" |
      "wait" | "free_action">;   // max 5
    tacticTags: string[];          // registered tags, max 8
    statement: string;             // bounded behavioral meaning, max 320
    fallbackActionRef: string | null;
  };
  priority: number;                // integer 0..100
  force: "preference" | "commitment" | "constraint";
  selfAwareness: "unaware" | "partial" | "aware";
  exceptions: Array<{              // max 4, same predicate vocabulary
    clauses: CharacterNormClauseV2[];
    description: string;
  }>;
  description: CharacterDescriptionV2 | null;
};
```

Only registered structured clauses activate a norm. Free text explains an
already structured rule and cannot become a hidden condition. Server legality,
causality, and safety always outrank character norms.

Applicable rules resolve in this order:

1. `constraint`, then `commitment`, then `preference`;
2. higher numeric priority;
3. more specific predicate count;
4. stable norm ID for deterministic ties.

Constraints intersect the legal action set. Statically detectable equal-rank
contradictions fail authoring validation. If a runtime combination unexpectedly
eliminates every legal action, the server uses the highest-priority declared
legal fallback or `wait` and records `character_norm_conflict`; an LLM cannot
invent an exception. Commitments and preferences rank remaining legal actions
but do not make an illegal action available.

Validation permits `allow_only`/`forbid` only with `constraint`, and
`prefer`/`avoid` only with `commitment` or `preference`. `selfAwareness` controls
whether conscious context receives the norm's meaning; the private evaluator can
still apply an unaware disposition without revealing its rule label or priority.

## Speech policy

```ts
type CharacterSpeechPolicyV2 = {
  selfAwareness: "unaware" | "partial" | "aware";
  frequency: "silent" | "sparse" | "measured" | "frequent";
  phasePolicy: {
    prologue: "avoid" | "allow" | "prefer";
    turn: "avoid" | "allow" | "prefer";
    aftermath: "avoid" | "allow" | "prefer";
  };
  reactTo: Array<"direct_address" | "self_impact" | "counterpart_impact" |
    "ambient_change" | "relationship_shift">; // max 5
  silenceRules: Array<{            // max 8
    id: string;
    clauses: CharacterNormClauseV2[];
    priority: number;
    description: CharacterDescriptionV2 | null;
  }>;
  register: string;                // max 160
  cadence: string;                 // max 160
  sentenceLength: "short" | "mixed" | "long";
  vocabularyHabits: string[];      // max 12
  addressRules: Array<{            // max 12
    id: string;
    target: CharacterRelationshipTargetV2;
    address: string;
    priority: number;
  }>;
  selfReferenceNameId: string | null;
  examples: Array<{ id: string; text: string; tags: string[] }>;       // max 6
  counterexamples: Array<{ id: string; text: string; reason: string }>; // max 6
  description: CharacterDescriptionV2 | null;
};
```

Examples guide style and never become facts, required phrases, or dialogue
history. Compilers select at most two relevant examples and instruct against
copying them verbatim. Phase policy describes existing prologue/turn/aftermath
speech opportunities only. It does not create a pre-action speech phase, audible
technique call, rescue warning, or elapsed time; those remain separately deferred
simulation/presentation features.

## Relationship seeds and learned relations

```ts
type CharacterRelationshipTargetV2 =
  | { kind: "character"; characterAssetId: string }
  | { kind: "role"; role: "stranger" | "ally" | "rival" | "enemy" |
      "mentor" | "student" | "family" | "protected_person" | "other" };

type CharacterRelationshipSeedV2 = {
  id: string;
  target: CharacterRelationshipTargetV2;
  relationKinds: string[];         // max 6 bounded labels
  historySummary: CharacterDescriptionV2 | null;
  defaultAddress: string | null;
  selfAwareness: "unaware" | "partial" | "aware";
  dynamics: {                     // restricted, -1000..1000
    trust: number;
    affiliation: number;
    fear: number;
    competition: number;
  };
  priority: number;                // 0..100
};
```

An exact logical character target outranks a role seed; otherwise higher
priority then stable seed ID resolves. At battle creation the logical target is
matched to the exact character asset IDs in the bound manifest. It is never
matched by display name. A seed does not grant identity knowledge or disclosure;
those still require the four projection gates.

The seed is immutable authored background. `OpponentBattleMemory` and evolving
trust/tension are durable learned or battle-scoped state outside the definition.
They can be projected into a new battle under their own owner/private contract
but never silently rewrite the seed.

## Combat, capabilities, items, and initial loadout

P2 intentionally compiles to mechanics already supported by the current engine.
The structured definition does not introduce arbitrary executable effects.

```ts
type CharacterCombatDefinitionV2 = {
  parameters: Record<"hp" | "maxHp" | "mp" | "maxMp" | "stamina" |
    "maxStamina" | "atk" | "def" | "spd" | "mag" | "res" |
    "focus" | "luck", number>;
  flags: { canFight: boolean; irreversibleIncapacitated: boolean };
};

type CharacterActionDefinitionV2 = {
  id: string;
  name: string;
  description: CharacterDescriptionV2;
  kind: "basic" | "attack" | "magic" | "defend" | "support" |
    "special" | "status";
  mechanics: {
    targetParameter: string;
    scalingParameter: string;
    resistanceParameter: string;
    power: number;
    costMp: number;
    costStamina: number;
    effects: Array<{ target: "self" | "foe"; parameter: string; delta: number }>;
    constraints: {
      reach: "contact" | "near" | "medium" | "far" | "same_area";
      requiresSight: boolean;
      mobility: "none" | "limited" | "full";
      requiresSpeech: boolean;
      requiresUsableHeldObject: boolean;
    };
  };
  tacticTags: string[];
  expressionNotes: CharacterDescriptionV2 | null;
};

type CharacterCapabilitiesV2 = {
  basicAction: CharacterActionDefinitionV2;
  skills: CharacterActionDefinitionV2[]; // max 12
};

type CharacterItemDefinitionV2 = {
  id: string;
  name: string;
  kind: "weapon" | "armor" | "tool" | "consumable" | "keepsake" | "other";
  description: CharacterDescriptionV2;
  equipmentBonuses: { atk: number; def: number; mag: number } | null;
  battleStartEffects: Array<{ parameter: string; delta: number }>; // max 4
  affordance: {
    portable: boolean;
    usable: boolean;
    useDescriptions: string[];      // max 4
    causalEnvelope: Record<string, unknown>; // validated existing vocabulary
  };
};

type CharacterInitialLoadoutEntryV2 = {
  itemId: string;
  quantity: number;                 // integer 1..20
  placement: "held" | "worn_weapon" | "worn_armor" | "carried" | "reserve";
};
```

The basic action is exactly one and skills have unique IDs. At most one item can
occupy each worn slot. Loadout references must exist, quantities are bounded,
and positive start effects still require current balance validation. The battle
compiler creates world item identities from `character generation + item ID +
instance ordinal`; dropped, transferred, consumed, broken, or newly discovered
state thereafter belongs to the battle world.

Names, descriptions, and safe capability summaries are `public_eligible`.
Numeric parameters, power, scaling/resistance fields, effect magnitudes,
bonuses, and causal envelopes are `restricted` mechanics. Opponents receive
capabilities only through observed/learned affordances, never because a skill is
listed publicly.

The existing `focus` parameter remains a restricted combat input. ADR-0008's
no-effect shadow artifacts remain bound where already configured, but the replay
did not support expression adoption or focus coupling. P2 does not enable a
focus packet, change attention behavior, or make schema approval count as new
evidence. Any later adoption requires its own accepted evidence and ADR.

## Public profile generation and validation

The profile is generated only after the definition and disclosure policy pass:

```text
frozen natural source
  + CharacterProfileSourceProjectionV2
  -> CharacterPublicProfileDraftV2
  -> support, disclosure, length, duplication, and safety validation
  -> stored publicPresentation in the same immutable generation
```

The model returns paragraphs/segments with stable `supportRefs` into the display
projection. Every factual segment needs at least one ref. A `flavor` segment may
shape rhythm, metaphor, and tone but cannot introduce a proper noun, number,
capability, item, relationship, history event, causal explanation, or information
right absent from the projection.

A separate bounded claim validator receives only the display projection and
candidate profile, never restricted definition paths or raw latent state. It
classifies each material claim as supported or unsupported and returns support
refs. Server checks that all refs exist and are publication-authorized. Any
unsupported/high-risk claim fails closed; it does not get silently redacted into
an activated profile. This validator is an authoring operation, not a battle LLM
judge and not a source of mechanics.

The server also enforces maximum paragraphs/characters, no raw schema/control
labels, no numeric hidden values, no near-duplicate skill/equipment restatement,
and no claim that contradicts structured fields. Model/provider failure leaves
the candidate unactivated. A draft has at most eight segments, four paragraphs,
and 1,200 rendered characters.

## Consumer compilers

Each compiler is versioned and emits only its named contract:

| Compiler | Input from definition | Output responsibility |
| --- | --- | --- |
| `character-profile-source-v2` | profile-authorized required/eligible values and bounded descriptions | input for public profile generation |
| `battle-character-mechanics-v2` | combat, action mechanics, item mechanics, loadout | immutable legal-action/mechanics/world seed |
| `character-psyche-dynamics-v2` | restricted numeric dynamics and matching relationship dynamics | deterministic psyche input only; never an LLM prompt |
| `character-deep-psyche-context-v2` | own stable needs/tendencies/background and descriptive matching relation seed | private LLM disposition context without raw numbers or opponent-private definition |
| `character-conscious-self-v2` | self-known identity/background, action/speech norms, capabilities, plus conscious-effect projection | action/expression self context without raw latent state |
| `character-counterpart-view-v2` | target-allowed values intersected with perception/knowledge evidence | observed or explicitly learned opponent context |
| `character-narrator-view-v2` | perspective-allowed rendering facts and bounded narrative cues | narrator input without raw dynamics/state |
| `character-image-brief-v2` | appearance-only authorized fields and restricted visual prompt | image generation; no psyche, history, combat, or relationship facts |

The complete path matrix is normative in
`docs/structured-character-projection-matrix.md`.

Description budgets are compiler input ceilings, not targets to fill:

| Compiler | Max selected values/descriptions | Max selected text |
| --- | ---: | ---: |
| public profile source | 24 | 6,000 characters |
| mechanics human labels | 16 | 3,200 characters |
| deep psyche context | 16 | 3,600 characters |
| conscious self | 12 | 2,800 characters |
| counterpart view | 8 | 1,600 characters |
| narrator view | 10 | 2,000 characters |
| image brief | 12 | 2,400 characters |

Required identity fields are retained outside optional-description eviction.
Within a budget, compilers rank current phase relevance, exact target match,
explicit consumer tag, then stable element ID. They do not concatenate the full
definition. Expression selects at most two speech examples within the same
budget.

## Psyche-to-conscious and narrator projections

Raw `battlePsycheState`, `CharacterDeepPsyche`, deterministic reaction state,
trait numbers, appraisals, hidden causes, and private reasoning remain owned by
the private psyche component. It emits three separate bounded candidates:

```ts
type CharacterConsciousEffectV2 = {
  kind: "felt_emotion" | "urge" | "concern" | "hesitation";
  description: string;             // max 240, no hidden cause/score
  intensity: "low" | "medium" | "high";
  sourceEventIds: string[];         // observer-owned committed evidence, max 8
};

type CharacterObservableManifestationV2 = {
  modality: "movement" | "posture" | "expression" | "voice";
  proposal: string;                // max 240
  sourceEventIds: string[];
};

type CharacterNarrativeCueV2 = {
  access: "self_inner" | "omniscient" | "external_observable";
  description: string;             // max 240, no labels/scores/hidden vector
  sourceEventIds: string[];
};
```

`CharacterConsciousEffectV2` may reach conscious action/expression according to
self-awareness and evidence. It never includes `interior`. An observable
manifestation reaches an opponent only after the action/expression/world layer
commits it as an event and perception projects it; the proposal itself is not an
observation. A narrative cue reaches only a compatible narration perspective.

P2 removes `interior` from both compact and legacy conscious expression inputs.
Compatibility adapters may derive an empty/neutral conscious projection for old
battles, but cannot copy raw state into the replacement field.

## Create, revision, and owner confirmation

Create follows one ordered candidate workflow:

1. freeze the owner's natural instruction;
2. generate and validate `CharacterDefinitionV2` and disclosure policy;
3. compile the display projection;
4. generate and validate the public profile;
5. show an owner-only `CharacterAuthoringPreviewV2` containing the profile,
   human-readable structure, publication choices, and safe warnings;
6. after explicit owner confirmation, atomically activate the complete envelope.

To preserve the existing confirm-before-save behavior, ADR-0011 proposes one
additive domain hold, `awaiting_owner_acceptance`, between description validation
and `committing`. It stores a digest-bound candidate, expires without activation,
and accepts/rejects only from the owning session. This refines the common state
machine without changing idempotency or atomicity.

A natural-language adjustment to a ready character starts a revision attempt
against the exact current generation. Its source combines the current public
profile, the user's new instruction, and the current structured definition as
the revision base. It regenerates a complete definition and profile, then shows
the same preview. The existing ready generation remains selectable until the
owner confirms and the new one activates.

Direct patching of activated structured JSON or derived profile prose is not a
supported player authoring path. An eventual advanced editor must submit a full
candidate and regenerate the public profile through the same validation gate.

## Explicit latest-version upgrade

An unsupported owner-managed character shows
`このキャラを最新版に更新`. The action requires an idempotency key and binds a
legacy source digest before any provider call.

Deterministic legacy mappings are:

| Legacy field | V2 treatment |
| --- | --- |
| `displayName` | `identity.displayName`, required public |
| real/nickname/self-name/epithet | name entries; preserve previously public profile policy |
| gender/age | presentation fields, public eligible but profile-off by default |
| tags | identity tags |
| appearance summary/visual prompt/current image | appearance fields and immutable media reference when resolvable |
| `narrativeBlurb` | primary frozen natural upgrade source; never copied as V2 authority |
| traits | public tendency candidates with no invented cause; unresolved background refs remain empty and awareness defaults to `partial` unless the source establishes otherwise |
| parameters and combat flags | direct bounded combat mapping |
| basic attack and skills | capability definitions with stable derived legacy IDs |
| weapon/armor | item definitions plus worn loadout entries |
| decision profile default objective and principles | `always` action-norm candidates retaining priority/force/statement |
| visibility, records, memos, learned opponent memory, undo snapshot | remain operational/external; not mapped into definition |

The structure generator may reorganize mapped data but cannot claim an unstored
history, relation, item, cause, or self-awareness. Missing required mechanics use
only documented balance defaults and are labeled as defaults in the owner
preview. Public profile generation uses the old profile plus the new display
projection. Unsupported/upgrading/upgrade-failed characters remain absent from
all selectors until owner confirmation and atomic activation succeed.

## Management, selection, and battle binding

Owner management DTOs return:

- public profile/card;
- owner-safe structured summary and publication settings;
- compatibility status, target schema, safe diagnostics, and upgrade action;
- active attempt/preview state where owned;
- records, improvement data, visibility, and media controls from operational
  state, not the immutable definition.

Public character cards receive only the public projection. Match character
queries join the logical record to a `ready` V2 current generation compatible
with `battle-character-mechanics-v2`, psyche/self/narrator compiler requirements,
and current battle rules. Opponent visibility and account/friend gates apply in
addition. Battle creation repeats all checks, compiles the exact generation, and
records its generation ID, envelope digest, and compiler versions. It performs
no character-generation write.

## Implementation slices after ADR acceptance

1. Add strict shared V2 definition, disclosure, preview, public/management DTO,
   and compiler-output schemas plus fixtures.
2. Add character authoring candidate/confirmation persistence on top of the
   accepted common attempt and atomic activation contract.
3. Implement two-stage structure/profile generation and bounded claim validation
   for mock and configured provider paths.
4. Implement deterministic character compilers/projectors, including psyche
   disposition and relationship seed mapping.
5. Replace conscious expression `interior` with the conscious-effect contract;
   retain raw state only in the private psyche stage.
6. Add explicit upgrade, management preview, and update button.
7. Split management and match selection queries; change battle creation to bind
   ready generations read-only.
8. Cut over create/revision/image flows and remove direct current-sheet mutation
   paths for new V2 characters.

No deployment, release, bulk migration, or production data operation is included
in this P2 implementation authority.

## Required verification

- strict schema bounds, stable element IDs, reference integrity, unique slots,
  and norm-conflict validation;
- source-to-structure-to-profile order and zero partial activation;
- owner confirmation, expiry, retry, idempotency, and pointer-conflict behavior;
- public claim support and restricted-source leakage failures;
- full projection-matrix presence/non-leakage and two-target variance tests;
- deterministic norm priority and legal fallback receipts;
- exact relationship target/role precedence and no name-based matching;
- psyche trait changes affect only documented psyche inputs; unrelated appearance
  and capability changes do not;
- raw latent state and `interior` are absent from conscious, opponent, public,
  and unauthorized narrator inputs;
- manifestations require committed event and observer evidence;
- management retains unsupported characters while every selection path excludes
  them and direct battle creation fails closed;
- battle creation writes zero character generations and replay remains bound to
  exact compiled snapshots;
- focus adoption/output remains unchanged;
- `npm test`, `npm run typecheck`, and `npm run build` pass before acceptance.

## Accepted implementation boundary

ADR-0011 authorizes only the local P2 implementation slices above.
Stage/production deployment, release, observation, and migration remain separate
decisions.
