# Structured domain assets and public projections backlog

- Status: Prioritized backlog; P0-P3 complete, P4 narration frontier
- Date: 2026-08-14
- Decision owner: Product owner
- Governing decisions: [ADR-0009](adr/0009-separate-adjudication-from-judgment-presentation.md), [ADR-0010](adr/0010-structured-selectable-asset-envelope.md); [ADR-0003](adr/0003-revision-editable-assets-and-bind-battles.md) is Superseded
- Execution order: [structured-domain-assets.pert](structured-domain-assets.pert)
- Authoring workflow: [structured-asset-authoring-workflow.md](structured-asset-authoring-workflow.md)
- Information projections: [structured-asset-information-projection-design.md](structured-asset-information-projection-design.md)
- Common envelope proposal: [structured-asset-envelope-design.md](structured-asset-envelope-design.md)
- Current-state evidence: [structured-domain-assets-current-inventory.md](structured-domain-assets-current-inventory.md)
- Character P2 proposal: [structured-character-definition-design.md](structured-character-definition-design.md), [projection matrix](structured-character-projection-matrix.md), [ADR-0011](adr/0011-structured-character-definition.md)

## Objective

Separate editable domain truth from its human-readable card or prose for three
asset families. Authoring stores a validated, immutable structured revision;
the UI shows a public natural-language projection derived from that same
revision; battles bind and consume the structured revision rather than
re-parsing the displayed prose.

```text
natural-language instruction
  -> validated structured definition
  -> public description from instruction + display-consumer projection
  -> immutable asset generation
       -> public description -> UI
       -> structured battle snapshot -> simulation / agents
```

Public projections are derived artifacts, not alternate sources of truth. They
carry the source generation ID and projection-contract version and are not
regenerated on ordinary reads. Editing either the structure or its authorized
publicity choices creates a new asset revision.

## Cross-asset invariants

- ADR-0003 immutable generations and battle binding remain mandatory.
- Character, battlefield, narration-style, and future selectable-asset creation
  use the same ordered natural text -> structure -> public text pipeline.
- A public projection never becomes character cognition, mechanics, world
  state, or a future structured revision by reverse parsing.
- This is a pre-public cutover. Conversion is explicit, never a side effect of
  battle creation. An owner/operator may upgrade an unsupported selectable
  asset from its management page; only a successful two-stage regeneration
  appends and activates a structured generation. Existing development battles
  have no backward-compatibility guarantee.
- Every schema element declares the ceiling `required_public`,
  `public_eligible`, or `restricted`; eligible values may narrow it by bounded
  target/channel allowlists. Runtime context still applies separate consumer
  and observer/self-awareness gates. Omission is not a prompt convention.
- Bounded per-element descriptions preserve creative nuance. They inherit the
  element's disclosure and consumer policy, guide authorized LLM stages, and
  never override structured mechanics.
- Structured revisions, public projections, prompt compilers, and one-time
  cutover inputs have independent schema versions and content digests.
- Dynamic battle state stays separate from authoring definitions: current held
  objects, transient psyche, wounds, and changing relations are not written
  back into the base asset implicitly.
- Each architecture-changing slice requires its own Accepted ADR before schema,
  persistence, or API implementation.

## Priority order

### P0 — Judgment presentation projection (complete)

Complete ADR-0009: keep Referee audit rationale private, publish the exact
outcome separately, and feed only an audience-safe factor projection to the
existing Judgment narrator call.

Why first: it closes a currently observed internal/external leak with a small,
reversible boundary and establishes the projection pattern used by later work.

Completed evidence: ADR-0009 and the detailed projection design are reflected
in the shared contract, battle service, Judgment provider boundary, and ordered
narration worker. Full tests, typecheck, and build passed on 2026-08-13.

### P1 — Shared asset-definition and projection envelope

Design the common revision contract before expanding any one schema:

- logical asset ID, immutable generation ID, schema version, content digest;
- structured definition, three-way disclosure ceilings, per-value target and
  channel allowlists where allowed, and consumer-specific projection policy;
- stored public projection with source generation and projector version;
- battle snapshot/compiler version;
- authoring draft, owner acceptance, and validation states;
- the shared two-stage creation/regeneration attempt and its atomic activation;
- an explicit compatibility state and owner/operator-triggered upgrade path for
  every selectable asset, with no permanent runtime compatibility branch.

P1 result: accepted ADR-0010 and the common envelope design freeze the exact
compatibility vocabulary, authoring-attempt state machine, atomic activation,
projection context, compiler readiness predicate, management/selection split,
and read-only battle-binding rule. The executable thin fixtures are delivered
with P2-P4 and the cross-asset acceptance belongs to P5.

### P2 — Character definition and public profile

Highest domain priority because character structure drives action selection,
speech, relationships, capabilities, and the player's primary authored asset.

Proposed internal sections:

1. `identity`: names, self-reference, presentation facts, form, age/gender only
   when established, and publicity per fact;
2. `profileBackground`: history and context supporting profile claims;
3. `psycheDisposition`: latent tendencies plus the background or experience
   that makes each tendency plausible; distinct from mutable battle psyche;
4. `actionNorms`: bounded rules of the form condition → preferred/avoided
   response, priority, inhibition, and exceptions;
5. `speechPolicy`: talk frequency, silence triggers, register, sentence rhythm,
   vocabulary habits, address forms, stage-reaction preference, and examples;
6. `relationshipSeeds`: typed initial relation assertions to an immutable
   character reference, with confidence/publicity; evolving matchup memory stays
   outside the definition;
7. `capabilities`: basic actions, skills, equipment, and item affordances;
8. `initialLoadout`: items available at battle creation. Live held/worn/dropped
   state belongs to the battle world, not the character definition;
9. `publicProfilePolicy`: which established facts may appear on cards/search.

Each section may retain bounded element-level descriptions. In particular,
`psycheDisposition` separates publishable/optionally publishable background and
manifestation descriptions from restricted numeric latent traits and mutable
`battlePsycheState`.

The displayed profile becomes a stored natural-language projection. Character
agents and battle creation consume structured sections and validated compilers,
not the public profile prose.

Creation first generates and validates these sections from the owner's natural
instruction. It then generates the public profile from the same frozen
instruction plus its disclosure-filtered display projection. Upgrade substitutes
the existing profile for the instruction and repeats both stages.

Pre-public upgrade UX and eligibility:

- an owner can still open an unsupported character's detail/edit page;
- that page shows `このキャラを最新版に更新` only when a supported one-way
  converter exists;
- the action is explicit and idempotent, reports validation errors, and never
  partially moves the character's current-generation pointer;
- while unsupported or conversion is running/failed, the character is omitted
  from every battle participant selector, opponent list, and automatic matching
  pool;
- eligibility is enforced by the backend selection query and again by battle
  creation, so a stale client or direct ID cannot bypass it;
- after a successful upgrade, the new generation becomes selectable. Existing
  battles are never rebound to it.

ADR-0011 and its detailed design now propose answers for:

- cardinality and priority semantics for action norms;
- static relationship seed versus durable learned relationship ownership;
- skill/equipment definition versus battle-instance item identity;
- validation/entailment policy for LLM-rendered profiles generated from natural
  source plus the disclosure-filtered display projection;
- complete path-level disclosure and consumer matrix for profile display,
  narrator perspectives, deep psyche, self-conscious action/expression, and
  observer-relative counterpart knowledge;
- stable-ID target overrides and relationship-scoped rules, including
  deny-by-default combination, knowledge prerequisites, and tests where two
  targets legitimately receive different projections;
- conscious-effect, observable-manifestation, and narrator-cue projections from
  restricted latent state, including removal of raw `interior` from conscious
  expression inputs;
- description budgets, provenance, scope, and rules preventing prose from
  overriding mechanics;
- exact compatibility-state vocabulary, upgrade endpoint idempotency key, and
  concurrency ownership;
- seed/import format and bounded field/default mapping for recreating useful
  development characters without inferring unstored intent;
- whether the button label should include a target schema/version in diagnostic
  or administrator views while retaining the simple player-facing label.

Local implementation evidence now also includes deterministic action-norm and
relationship-precedence receipts, legal fallback behavior, provider-boundary
non-leakage, and A/B symmetry. See
[`structured-character-rule-receipts-2026-08-14.md`](evidence/structured-character-rule-receipts-2026-08-14.md).
P2 is complete. The authoring/route integration matrix and bounded legacy
fallback removal are recorded in
[`structured-character-cutover-acceptance-2026-08-14.md`](evidence/structured-character-cutover-acceptance-2026-08-14.md).

### P3 — Battlefield definition, initial world, and evolution affordances

Second domain priority because it supplies canonical constraints and the source
material for environment/happening proposals.

Proposed internal sections:

1. scene identity, genre, scale, atmosphere, and stable visual traits;
2. structured areas/topology, terrain and movement/sight/sound properties;
3. persistent effects and bounded time-based effects with trigger, duration,
   target scope, and cancellation rules;
4. environment evolution affordances used by the happening proposer, including
   allowed pressures and forbidden discontinuities;
5. initial first-class objects with stable definition keys, placement, presence,
   exposure, portability, usability, cover, blocking, and causal envelope;
6. initial pair relations and entry locations;
7. public scene-card policy and visual projection inputs.

The public battlefield description is a projection. Battle creation binds the
structured definition, deterministically creates initial semantic/world state,
and gives the happening layer only allowed evolution affordances. It never
reconstructs terrain rules from the public blurb.

Creation generates this definition from a natural scene instruction, then
generates the public scene description from the instruction plus its
disclosure-filtered display projection. Upgrade uses the existing scene
description as the source, repeats
both stages, and keeps the preset unselectable until atomic activation succeeds.
The battlefield detail page exposes the corresponding latest-version update
action to its owner/operator when a converter is available.

Required design decisions before implementation:

- boundary between preset definition, concretized immutable instance, and
  mutable battle world;
- finite effect/trigger vocabulary and unsupported-effect behavior;
- first-class object key stability across concretization;
- whether LLM concretization may propose topology or only fill bounded slots;
- bounded deterministic mapping of separately stored legacy terrain, obstacle,
  and condition fields alongside the existing natural description.

ADR-0012 and
[`structured-battlefield-definition-design.md`](structured-battlefield-definition-design.md)
accept these decisions: reusable definition, deterministic instance compiler,
closed effect/evolution vocabularies, stable object keys, no LLM-authored
battle-time topology, and bounded legacy mapping. P3 is complete locally. Its
V2 structure/public-scene pipeline, explicit upgrade, immutable media and
revision activation, selector/direct-ID gates, exact battle binding, and live
single-affordance happening gate are recorded in
[`structured-battlefield-cutover-acceptance-2026-08-14.md`](evidence/structured-battlefield-cutover-acceptance-2026-08-14.md).

### P4 — Narration definition and compiled rendering policy

Third domain priority because it affects presentation only after character and
world authority boundaries are stable.

Proposed internal sections:

1. perspective and information rights;
2. narrator persona/register, audience distance, and degree of subjectivity;
3. cadence, sentence length, paragraph/line budget, and dialogue placement;
4. action, impact, release, judgment, prologue, and aftermath phase policies;
5. explanation density, metaphor tolerance, humor, violence, and explicitness;
6. preferred and forbidden rhetorical patterns;
7. tagged narration examples and counterexamples. Examples are rendering
   guidance only and never world facts;
8. public style-card policy.

A versioned compiler turns this structure into bounded phase-specific prompt
instructions. The displayed style description is a separate stored projection;
neither free-form public description nor example prose is used as canonical
scene, character, or result evidence.

Creation generates the rendering policy from a natural style instruction, then
generates the public style description from the instruction plus its
disclosure-filtered display projection. Upgrade uses the existing
description/instruction as the source and
repeats both stages. Unsupported styles remain outside narration-style
selectors until activation succeeds.
The narration-style management screen exposes the corresponding latest-version
update action to its owner/operator when a converter is available.

Required design decisions before implementation:

- closed enums versus extensible tagged dimensions;
- conflict resolution between style, perspective gates, phase contracts, and
  safety/grounding rules;
- example selection budget and anti-copy constraints;
- bounded deterministic mapping of separately stored legacy perspective fields
  alongside the existing natural description or instruction.

ADR-0013 and
[`structured-narration-definition-design.md`](structured-narration-definition-design.md)
accept these decisions: closed operational dimensions with display-only tags,
fixed safety/grounding then perspective then phase then style precedence, a
two-positive/one-counterexample per-phase budget with anti-copy clauses, and
exact legacy perspective preservation with validated regeneration of all other
structure. P4 implementation is active; local acceptance still requires the
authoring, selector, exact-binding, phase-consumer, and persistence evidence
listed in that design.

### P5 — Integrated authoring and cutover acceptance

- create/edit flows show structure and generated public projection together;
- owners can correct structure without directly editing derived prose into a
  conflicting truth source;
- unsupported selectable assets are upgraded only by their owner/operator from
  their management page and remain absent from battle selection until both
  structure and regenerated public description succeed;
- no pre-structure compatibility branch remains in the steady-state runtime;
- matchmaking cards, search, battle creation, agents, narrator, history, and
  replay each consume the correct projection or structured snapshot;
- cross-generation and mid-battle edit tests prove immutable binding;
- privacy, deletion/tombstone, export, and internal-observability behavior is
  explicit for every section.

## Explicitly excluded

- eager conversion of all existing assets and battles;
- implicit conversion during battle selection or battle creation;
- activating a structured definition before its derived public description has
  passed validation;
- a permanent legacy schema, dual-read path, or general-purpose prose parser;
- changing production APIs or database schema before the relevant family ADR is accepted;
- re-generating historical public profiles or narration styles;
- letting battle experience silently rewrite base character definitions;
- a universal free-form ontology shared by all three asset families.

ADR-0010 is the accepted P1 decision and supersedes ADR-0003 while retaining its
immutable historical generation and battle-binding requirements. Each explicit
upgrader uses the asset's existing natural description plus deterministic
mappings for separately stored fields; it does not claim to reconstruct
unstored intent. Later bulk cleanup or deletion remains a separate operation
requiring an exact target.
