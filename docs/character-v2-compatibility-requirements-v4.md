# Character conscious-guidance migration — requirement candidate revision 4

- Status: Step 1 candidate; self-review complete; first owner review pending
- Date: 2026-09-10
- Decision owner: Product owner
- Replaces for review: `character-v2-compatibility-requirements-v3.md`
- Sources: owner `REVISE` route on 2026-09-10; revision-3 independent
  review; ADR-0010; ADR-0011; ADR-0027; ADR-0028; structured-character
  design; current character authoring/selection RCA; production read-only
  evidence captured on 2026-09-10
- Conflicting proposed design: ADR-0029 revision 1

## Objective

Restore the eight affected already-ready characters without a permanent V2
reader exception. Deterministically move their selectorless soft guidance into
an explicit conscious-guidance field in a new immutable character-definition
generation. Preserve old generations and battle bindings, do not invent action
selectors, and make every post-cutover authoring path strict.

This requirement is separate from the provider response-schema identity defect
that currently prevents new character creation. The identity-preserving repair
remains necessary, but its authoring response contract must target the selected
character-definition version after cutover.

## Authority disposition

### ADR-0010 — common immutable asset envelope

Preserve immutable generations, explicit readiness, server-side eligibility,
compare-and-swap current-pointer activation, read-only battle binding, explicit
latest-version handling, defined deterministic mappings, no inferred eager bulk
conversion, and no battle-time conversion. The frozen owner-reviewed operation
in this requirement must comply with those controls; it is not inferred from row
existence or executed during battle creation. If its orchestration changes the
meaning of ADR-0010's explicit latest-version action, the successor ADR must name
and bound that refinement while preserving per-asset validation and activation.

### ADR-0011 — structured character definition

Preserve structured character truth, derived audience-specific projections,
confirm-before-activation, deterministic action semantics, disclosure gates,
owner management of unsupported assets, exact-generation battle binding, and
the prohibition on in-place mutation. A successor ADR must explicitly supersede
or refine these V2-specific parts:

- `CharacterDefinitionV2` as the only latest authored character definition;
- ready-current-V2 as the only eligible current character generation;
- V2 output for create, revision, upgrade, restore, import, and derived paths;
- exclusion of this bounded deterministic bulk migration from ADR-0011's
  accepted design scope. Production execution remains separately gated.

Existing historical V2 generations and battle bindings remain governed by
ADR-0011 and stay readable. Revision 4 does not reinterpret their stored bytes.

### ADR-0027 — conscious agency and psyche boundary

Preserve conscious ownership of goal, action, and utterance judgment, separate
from non-deliberative psyche and engine validation. Conscious guidance is
authored character input consumed by conscious judgment. It is not psyche state,
an engine action command, or an independent action-selection authority.

### ADR-0028 — versioned conscious agency contract

Preserve all existing qualified V3 identities and their ownership:

- `BattleAssetManifest` schemaVersion 3 remains the immutable battle binding;
- `CharacterBattleCompilerInputsV3` remains the battle-bound compiled input;
- dialogue schemaVersion 3 and Compact mode remain dialogue input contracts;
- conscious input/output contract version 3 remains runtime judgment I/O;
- `CharacterAgentState.consciousAgencyV1` remains the closed mutable
  battle-runtime conscious-agency state within `CharacterAgentState`.

`CharacterDefinitionV3` and `schemaVersion: 3` identify an authored immutable
asset definition upstream of those contracts. They replace none of the above.
If compilation from CharacterDefinitionV3 changes an existing output shape or
meaning, the successor ADR must assign a new qualified compiler identity rather
than silently reuse `CharacterBattleCompilerInputsV3` or another V3 name.

The current generation-backed basic-attack provenance discriminator
`character_generation_v2` retains its V2 meaning. A V3 source must use a
qualified successor representation or an explicitly demonstrated
semantics-preserving mapping; it must not reuse that discriminator with changed
meaning.

### Proposed and historical candidates

Proposed ADR-0029 revision 1 selects a permanent V2 compatibility reader and
conflicts with this requirement. It must not be accepted as written. After this
requirement is accepted, revise that still-Proposed ADR or issue a successor ADR
for migration. Requirement revisions 1 through 3 remain historical and
unaccepted; their review state does not carry forward.

## Required schema semantics

R1. `CharacterDefinitionV3` has a dedicated bounded `consciousGuidance`
collection separate from `actionNorms`.

R2. A conscious-guidance entry contains stable ID, applicability clauses and
match mode, statement, priority, `preference` or `commitment` force,
self-awareness, exceptions, and descriptive metadata. It has no action
references, action kinds, tactic tags, fallback action, or restrictive
disposition.

R3. When applicable, conscious guidance may supply an awareness-gated statement
to conscious judgment. It is not directly projected into engine candidate or
result fields, does not change the deterministic legal, ranked, or excluded
action sets, and does not directly write psyche state in the same transition.
It may legitimately change conscious judgment; a different committed action and
its later experience may therefore have indirect downstream effects, including
later psyche reactions.

R4. Every V3 `actionNorm` is executable and selects at least one `actionRef`,
`actionKind`, or `tacticTag`. Selectorless `constraint`, `allow_only`, `forbid`,
and soft action norms are invalid for V3 activation.

R5. New create, revision, upgrade, restore, import, and derived authoring paths
produce V3 candidates after the explicit cutover selector chooses character
definition schema 3. They must not emit selectorless action norms or use migration
compatibility as an authoring fallback.

## Deterministic migration mapping

R6. The production migration input is a frozen, owner-reviewed manifest of the
exact eight current generation IDs observed as `ready` on 2026-09-10. Before
each write, migration rechecks logical asset ID, current generation ID, ready
state, source schema, and source content identity.

R7. An action-norm entry is eligible for movement only when all selectors are
empty, disposition is `prefer`, and force is `preference` or `commitment`.
Migration removes that entry from replacement `actionNorms` and copies, without
LLM use or semantic rewriting:

- norm ID, `when.match`, clauses, statement, priority, force, self-awareness;
- every exception's clauses and description; and
- the complete norm description, including text, consumer tags, and source
  support references.

The V3 guidance fields use bounds at least sufficient to losslessly represent
every frozen eligible source. Tighter new-authoring bounds may not truncate a
migrated source.

R8. Fully selected action norms and all unrelated definition, disclosure,
public-presentation, media, and operational values remain semantically
unchanged. Public prose is not regenerated. For each moved value, a versioned
deterministic mapping translates the literal V2 `actionNorms` disclosure paths
to the corresponding V3 `consciousGuidance` paths. Effective grants may not
widen; any narrowing required by R3 is explicit and tested. Copied consumer tags
remain descriptive named-consumer guidance and never grant access by themselves.
Replacement content/provenance digests and required compiler receipts are
recomputed and identify the source generation and migration contract.

R9. A selectorless restrictive norm, unknown reference, missing receipt,
pointer mismatch, non-ready state, unexpected schema, changed source identity,
out-of-bounds frozen value, or other unmapped value fails that asset closed.
Migration does not guess, drop, truncate, or repair it and does not move its
pointer.

R10. The sixteen owner characters without an exact ready V2 state are not
eligible. They remain unsupported and use the existing explicit authoring or
upgrade workflow.

## Append-only execution and atomic receipt

R11. Existing generation bytes are never edited. For each eligible character,
migration appends one validated V3 generation and moves only that logical asset's
current pointer by compare-and-swap against the frozen source generation. Old
battles remain bound to their recorded generations.

R12. "Bulk" means one bounded operation over the frozen manifest, not one
cross-character transaction. Each character commits independently. One item
failure neither rolls back completed items nor marks pending items complete.

R13. One per-asset atomic success boundary includes the replacement generation,
current pointer, compatibility/readiness state, and durable success receipt. A
success receipt uniquely binds migration contract, logical asset, source
generation, and target generation. No state may expose a migrated current pointer
without the corresponding receipt, or a success receipt without that pointer.
The physical table and key layout remain successor-design choices.

R14. Migration is idempotent by the source-generation and migration-contract
identity. Repeating completed work returns the recorded target without appending
a duplicate. Retrying a failed item requires revalidation of its unchanged source
and failure disposition. Pointer drift stops that item without overwriting newer
owner work.

## Cutover and historical input handling

R15. Cutover is selected by an explicit, qualified
`characterDefinitionSchemaVersion` authoring policy value, not by wall-clock,
deployment version, dialogue schemaVersion, or bare `V3`. Its persistence and
activation mechanism are fixed by the successor ADR. Defaults do not change
silently.

R16. Code that can read required historical V2 generations and new V3
generations, compile V3 guidance, translate disclosure paths, express qualified
V3 generation provenance, and reject mixed contract tuples must be deployed and
verified before selecting schema 3 or executing migration.

R17. After schema-3 cutover, restore, import, or derived authoring from a V2
source must pass the same deterministic V2-to-V3 mapper. A fully selected V2
source produces empty `consciousGuidance`; an eligible selectorless soft entry
moves under R7. Any source that cannot be mapped losslessly fails closed. These
paths never create a new current V2 generation after cutover.

R18. Deployment, authoring-policy activation, production migration, and any
pointer rollback are separate effects. This requirement candidate authorizes
none of them.

## Acceptance criteria

- Authority tests or review trace the successor decision to ADR-0010 and
  ADR-0011, preserve ADR-0010's no-inference controls, and attribute withheld
  bulk-migration authority to ADR-0011.
- Namespace tests distinguish `CharacterDefinitionV3` from
  `BattleAssetManifestV3`, `CharacterBattleCompilerInputsV3`, dialogue V3,
  conscious I/O V3, and `CharacterAgentState.consciousAgencyV1`; mixed tuples
  fail closed.
- A V3 generation-backed basic-action source uses a qualified successor identity
  or a proved semantics-preserving mapping. It never labels changed V3 provenance
  as `character_generation_v2`.
- V3 parsing accepts conscious guidance and rejects every selectorless action
  norm before activation.
- A deterministic fixture moves all and only eligible selectorless soft entries,
  preserving every R7 value without truncation or a provider call.
- Disclosure fixtures translate every affected V2 literal path to the matching
  V3 guidance path, preserve or explicitly narrow effective grants, prove no
  grant widening, and prove that copied consumer tags are not access authority.
- Changing guidance while holding mechanical inputs fixed cannot change legal,
  ranked, or excluded action keys. Projection tests prove no guidance field is
  sent directly to engine candidates/results or same-transition psyche writers.
- A conscious-decision test may choose a different action from different
  guidance and records resulting later state as an indirect consequence rather
  than a direct guidance write.
- Mixed generations preserve fully selected action norms unchanged while moving
  only eligible conscious guidance.
- Restrictive selectorless entries, unknown values, missing receipts, source
  drift, pointer drift, and lossy mapping fail closed without a new current
  generation.
- Production-shaped fixtures represent nine ready V2 characters: eight with
  twenty-one eligible selectorless soft entries and one fully selected Takumi
  generation. The frozen migration manifest selects exactly the eight sources.
- Each successful fixture appends a V3 generation and atomically commits pointer,
  readiness state, and the uniquely bound success receipt. The V2 generation
  remains readable and an old battle remains byte-for-byte bound to it.
- Crash-boundary and partial-failure fixtures expose neither pointer-without-
  receipt nor receipt-without-pointer, and idempotent retry creates no duplicate
  target generation.
- The sixteen no-state characters remain unsupported and absent from match
  selection.
- The explicit authoring-policy selector is independent of dialogue/battle V3
  selectors and does not change by default.
- Post-cutover create/revision/upgrade paths produce strict V3. Restore/import/
  derived V2 inputs map losslessly through R7 or fail closed, never reactivating
  V2 as a new current generation.
- Dry-run output lists exact eligible, rejected, drifted, and already-complete
  items without writes. Production execution and readback have a later owner gate.

## Out of scope and remaining design choices

- The exact qualified compiler identifier, V3 basic-attack source representation,
  physical migration-ledger schema, and authoring-policy persistence mechanism
  remain successor-ADR decisions. They must satisfy R1-R18 and may not reuse an
  existing identity with changed meaning.
- Migration of non-production test or seed assets outside the frozen manifest
  is a delivery-plan choice.
- Production deployment, traffic changes, policy activation, migration execution,
  pointer rollback, provider-backed regeneration, and bulk upgrade of no-state
  characters are out of scope.
- Live xAI validation of the separate response-schema identity repair remains a
  separately authorized evidence step.

## Self-review

- ADR-0010's inferred-conversion controls and ADR-0011's withheld bulk-migration
  authority are attributed separately; neither review nor migration direction is
  treated as authority for production execution.
- ADR-0010, ADR-0011, ADR-0027, and ADR-0028 authority is explicitly preserved,
  refined, or separated; Proposed ADR-0029 revision 1 is not implementation
  authority.
- Every existing material V3 namespace identified by the prior reviews is
  separated from `CharacterDefinitionV3`; the actual state identity is
  `CharacterAgentState.consciousAgencyV1`, not an invented V3 type.
- Direct engine/psyche flow is distinguished from indirect consequences of a
  conscious action choice.
- Frozen descriptive metadata is mapped losslessly. Literal disclosure paths and
  effective grants have an explicit proof obligation, and consumer tags do not
  become access authority.
- V3 basic-action provenance must be qualified without changing the meaning of
  `character_generation_v2`; its final representation remains a successor design.
- Transaction and cutover requirements state observable results without fixing a
  physical database design.
- Immutable bytes, old battles, selector non-invention, no-provider migration,
  no-state exclusion, and new-authoring strictness remain unchanged.
- Production-shaped counts are evidence inputs, not execution authority.

## Proposed independent-review input

Review the exact revision-4 candidate for: correct separation of ADR-0010
no-inference controls from ADR-0011 bulk-migration authority; use of the actual
`CharacterAgentState.consciousAgencyV1` identity; complete separation from all
ADR-0028 V3 namespaces; lossless R7 metadata mapping; deterministic disclosure-
path translation and no grant widening; qualified V3 basic-action provenance;
the distinction between prohibited direct flow and legitimate indirect action
consequences; atomic pointer/readiness/receipt invariants without premature
physical design; explicit cutover selection and V2 restore/import handling;
append-only old-generation and old-battle preservation; and strict post-cutover
authoring. Do not add deployment, production execution, LLM regeneration, or
migration of the sixteen no-state characters as acceptance criteria.
