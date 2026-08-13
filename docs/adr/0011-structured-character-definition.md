# ADR-0011: Structure character truth and derive audience-specific projections

- Status: Accepted
- Date: 2026-08-13
- Decision owner: Product owner
- Related: `SDA_CHARACTER` in `docs/structured-domain-assets.pert`;
  `docs/structured-character-definition-design.md`;
  `docs/structured-character-projection-matrix.md`; ADR-0004; ADR-0008;
  ADR-0010

## Context

The accepted common envelope requires each selectable asset to separate its
authoritative structured definition from derived public presentation. Character
is the first concrete family because it affects mechanics, action selection,
private psyche, conscious expression, relationships, narration, matchmaking,
and the player's primary authoring flow.

The current `CharacterSheet` combines public profile prose, identity,
appearance, combat values, capabilities, visibility, records, learned opponent
memory, and undo state. Character generation produces structured-looking fields
and `narrativeBlurb` in one model result; later chat directly mutates both. Public
DTO selection is hard-coded rather than target-aware. Battle consumer anchors
copy broad profile material, and conscious expression still receives raw
`interior` state.

At the same time, the repository already has useful boundaries: immutable battle
manifests, observer-relative perception, deterministic legal-action contexts,
accepted lightweight psyche dynamics, private psyche state, and narrator
perspective projection. The character redesign should compile into these seams
instead of replacing them with one universal prompt context.

## Decision drivers

- Represent identity, background, behavior, voice, relationships, abilities,
  equipment, items, and initial loadout without reducing character expression to
  a small enum set.
- Keep static disposition separate from mutable latent state and distinguish
  human owner access from the character's own self-awareness.
- Let the same authored value project differently to a public profile, self,
  exact counterpart, unrelated character, narrator perspective, and mechanics.
- Make action norms deterministic in priority/conflict semantics without letting
  prose override legality or mechanics.
- Preserve relationship seeds while keeping learned and battle-evolving
  relations outside immutable base truth.
- Generate public prose from natural source plus a display-safe structured
  projection and fail closed on unsupported claims.
- Preserve confirm-before-save creation and explicit latest-version upgrade.
- Avoid treating the rejected focus replay as evidence for expression adoption.

## Considered options

1. Add psyche, speech, and relationship fields to `CharacterSheet` while keeping
   combined generation, direct mutation, hard-coded public DTOs, and broad LLM
   anchors. This is locally small but preserves competing authorities and cannot
   enforce the accepted projection gates.
2. Store several free-form private/public character documents and choose prompt
   excerpts at runtime. This maximizes immediate expressiveness but makes rule
   priority, self-awareness, disclosure, mechanics, and replay nondeterministic.
3. Define a strict `CharacterDefinitionV2` with bounded descriptive escape
   hatches, stable element IDs, a complete disclosure matrix, versioned consumer
   compilers, a derived claim-supported public profile, and explicit
   create/revision/upgrade activation. This adds schema and migration cost but
   supplies one auditable character authority.

## Decision

Choose option 3.

### Definition authority

An immutable character generation contains `CharacterDefinitionV2` and its
derived public presentation under ADR-0010's envelope. The definition has these
sections:

1. identity and presentation names/facts;
2. visible appearance and immutable portrait media reference;
3. bounded background entries with authored self-awareness;
4. psyche disposition, including restricted deterministic dynamics and
   separately publishable background/manifestation descriptions;
5. structured condition-to-response action norms with deterministic priority;
6. speech frequency, phase tendencies, register, cadence, vocabulary, addressing,
   examples, and counterexamples;
7. exact-character or role relationship seeds with private dynamics;
8. combat parameters and flags;
9. stable-ID basic action and skills;
10. stable-ID equipment/items and initial loadout;
11. bounded per-element descriptions and one bounded cross-cutting
    `expressionNotes` field.

Descriptions are named-consumer guidance. They inherit or narrow their parent's
disclosure, never widen it, and cannot create mechanics, identity knowledge,
shared relationship history, or a battle fact.

Ownership, match visibility, records, learned opponent memories, improvement
state, deletion, authoring attempts, and edit history remain operational state.
Current resources, item placement, thoughts, observations, conversation, focus,
latent psyche, wounds, and changing relationships remain battle state.

### Action and relationship semantics

Action norms use registered condition predicates and stable action references.
Only structured predicates activate a rule. Rules resolve by force
(`constraint`, `commitment`, `preference`), numeric priority, predicate
specificity, then stable ID. Engine legality, causality, and safety outrank every
norm. Contradictory static constraints fail validation; an unexpected runtime
empty set uses a declared legal fallback or `wait` and records a conflict.

Relationship targets use a logical character asset ID or a registered role. An
exact character target outranks a role, followed by priority and stable seed ID.
Display-name matching is forbidden. A relationship seed does not grant
disclosure or identity knowledge. Learned opponent memory and live relationship
state can inform their named private consumers but cannot rewrite the seed.

### Psyche and conscious access

Static disposition compiles separately to the accepted restricted
`PsycheTraitProfileV1` and matching relationship dynamics for the deterministic
psyche engine. The private LLM psyche context receives bounded descriptive
tendencies/background and no raw dynamics. Background and manifestation
descriptions remain independently `public_eligible`. Authored
`unaware`, `partial`, or `aware` controls self projection, not profile
publication and not human owner access.

Raw `battlePsycheState`, deterministic state values, appraisals, hidden causes,
and `interior` stay in the private psyche stage. Private psyche may emit a
bounded conscious effect, observable-manifestation proposal, and
perspective-scoped narrative cue. Conscious action/expression receives only the
conscious effect; the counterpart receives a manifestation only after it is
committed as an event and perceived; the narrator receives only a cue allowed by
its perspective. P2 removes raw `interior` from all conscious expression input
variants.

The current `focus` parameter remains restricted mechanics. ADR-0008 shadow
records may remain, but the completed replay did not support adoption. This
decision does not enable focus projection or attention coupling.

### Public profile and consumers

The public profile is generated after structure validation from the frozen
natural source plus `CharacterProfileSourceProjectionV2`. Output segments carry
support references. A bounded claim validator sees only the display projection
and candidate profile; unsupported material facts fail activation. Flavor can
shape voice and imagery but cannot add a capability, item, relationship, history
event, hidden cause, or information right.

Separate versioned compilers produce public profile input, battle mechanics and
loadout, deterministic psyche dynamics, private deep-psyche context, conscious self context,
observer-relative counterpart knowledge, narrator perspective input, and the
appearance-only image brief. No generic consumer receives the whole definition.
The path-level ceilings and consumer rules in
`docs/structured-character-projection-matrix.md` are normative.

### Authoring and upgrade

Create and revision follow source to structure to display projection to public
profile. To preserve owner preview/confirmation, add
`awaiting_owner_acceptance` as a character authoring hold after candidate
validation and before ADR-0010's atomic `committing` transition. The hold is
owner-scoped, candidate-digest-bound, expiring, and non-selectable. Confirmation
rechecks the expected current token and activates exactly one complete
generation.

A ready character stays on its prior generation while a normal revision is
pending or fails. A legacy/latest-schema upgrade begins from an ineligible
character and uses its displayed profile as the primary natural source plus only
the deterministic mappings listed in the detailed design. It remains
`unsupported`, `upgrading`, or `upgrade_failed` until owner confirmation and
activation succeed.

Owner management retains unsupported characters and exposes
`このキャラを最新版に更新`. Match selectors, opponent/search/random pools, and
direct battle creation require a ready current V2 generation and every required
compiler. Battle creation reads and binds that exact generation and performs no
character-generation write.

The complete definition/matrix, owner-confirmation hold, legacy mapping, and
removal of raw `interior` are accepted for the local P2 implementation slices.
This decision does not authorize deployment, release, bulk migration, or
production operations.

## Consequences

### Positive

- Character truth becomes inspectable, revisioned, replayable, and separated
  from public prose and operational history.
- Rich descriptions and examples preserve expression without becoming hidden
  mechanics or disclosure rules.
- Background can be publicly visible while latent dynamics and current psyche
  remain private.
- Self, two different counterparts, and narrator perspectives can legitimately
  receive different projections from one immutable generation.
- Action and relationship behavior have deterministic reference, priority, and
  conflict semantics.
- Existing perception, mechanics, psyche, and manifest seams gain typed inputs
  rather than another broad context object.

### Negative and risks

- The schema and projection matrix are materially larger than `CharacterSheet`
  and require careful authoring defaults and UI summarization.
- Structure generation plus profile generation plus claim validation increases
  authoring latency and provider use.
- Claim support and nuance validation can reject acceptable creative prose.
- Temporary V1/V2 read models increase cutover risk until every direct mutation
  and battle-selection path is removed.
- Numeric psyche traits and action-rule conflicts require calibration and owner-
  understandable diagnostics.
- Portrait revisions and item identity add retention obligations.

## Compatibility and migration

- Existing battles retain their bound V1 character snapshots and do not gain
  inferred disposition, relationship, item, or awareness history.
- Existing current characters are unselectable until explicit successful V2
  upgrade. They remain owner-manageable and deletable.
- Legacy names, appearance, mechanics, capabilities, equipment, flags, and
  decision principles use deterministic mappings. The old public blurb is the
  natural upgrade source. Missing history, causes, relationships, and
  self-awareness are not invented.
- Visibility, records, improvement data, opponent memories, deletion, and edit
  history remain external and keep their operational meaning.
- V2 image/chat/restore operations create new immutable generations; they do not
  mutate the activated definition in place.
- V1 `CharacterSheet` may remain a temporary read model during cutover but is not
  eligibility or new-battle authority for a ready V2 character.

## Verification

- Strict schema, bound, stable-ID, reference, slot, and norm conflict tests pass.
- Create/revision/upgrade order, owner confirmation, expiry, idempotency,
  concurrent pointer drift, and partial failure are covered.
- Every projection-matrix row has positive and non-leakage tests, including two
  exact target IDs and A/B observer symmetry.
- Public profiles reject unsupported or restricted-source material claims.
- Self-awareness levels and narrator perspectives produce distinct bounded
  projections without exposing raw dynamics/state.
- Raw `interior` is absent from conscious expression, counterpart, public, and
  unauthorized narrator contracts.
- Manifestation proposals require committed event and perception evidence before
  counterpart access.
- Action norm and relationship precedence/fallback receipts are deterministic.
- Unsupported characters are present in management and absent from every
  selection/direct battle path.
- Battle creation performs no character-generation writes and binds exact V2
  generation/compiler identities.
- Existing focus output/adoption behavior remains unchanged.
- Full tests, typecheck, and build pass before local P2 acceptance.

## Implementation references

- [Detailed schema and workflow](../structured-character-definition-design.md)
- [Disclosure and consumer matrix](../structured-character-projection-matrix.md)
- [Common envelope](../structured-asset-envelope-design.md)
- `packages/shared/src/character.ts`
- `packages/shared/src/profile-grounding.ts`
- `packages/shared/src/battle.ts`
- `backend/src/repositories/characters.ts`
- `backend/src/services/battle-service.ts`
- `backend/src/llm/types.ts`
- `frontend/src/pages/CharacterCreatePage.tsx`
- `frontend/src/pages/CharacterDetailPage.tsx`
- `frontend/src/pages/MatchPage.tsx`
