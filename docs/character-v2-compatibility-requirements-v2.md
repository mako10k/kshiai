# Character conscious-guidance migration — requirement candidate revision 2

- Status: Step 1 candidate; self-review complete; first owner review pending
- Date: 2026-09-10
- Decision owner: Product owner
- Replaces for review: `character-v2-compatibility-requirements-v1.md`
- Sources: owner review direction on 2026-09-10; ADR-0010; ADR-0027;
  structured-character design; current character authoring/selection RCA;
  production read-only evidence captured on 2026-09-10
- Conflicting proposed design: ADR-0029 revision 1

## Objective

Remove the permanent V2 reader exception proposed in revision 1. Restore the
eight affected already-ready characters by deterministically migrating their
selectorless soft guidance into an explicit conscious-guidance field in a new
immutable character-definition generation. Preserve old generations and battle
bindings, do not invent action selectors, and keep new authoring strict.

This requirement is separate from the provider response-schema identity defect
that currently prevents new character creation. The identity-preserving repair
remains necessary, but the authoring response schema must ultimately target the
new character-definition schema accepted from this requirement.

## Identity and authority disposition

- `CharacterDefinitionV3` and `schemaVersion: 3` identify the proposed immutable
  authored character definition. They are distinct from the existing
  `CharacterAgentStateV3` battle-runtime state and from Compact expression
  contract versions. Documentation, code, diagnostics, and migration receipts
  must always use the qualified name rather than bare `V3` where ambiguity is
  possible.
- Existing `battle-character-mechanics-v2` action semantics may remain unchanged
  when its input action norms are fully selected. Conscious guidance receives a
  separately identified compiler/projection contract; the exact identifier is
  fixed by the successor ADR and must not reuse an existing identifier with new
  meaning.
- ADR-0010 continues to own immutable generations, atomic pointer activation,
  readiness, server-side selection, and read-only battle binding. Its prohibition
  on eager bulk inference and its owner-triggered legacy-upgrade rule remain in
  force until a successor ADR explicitly authorizes this bounded deterministic
  migration. Requirement acceptance alone does not authorize production writes.
- ADR-0027 continues to place deliberative goal, action, and utterance judgment
  in conscious agency, separate from non-deliberative psyche and engine
  validation. Conscious guidance is authored character input consumed by that
  judgment; it is not psyche state or an engine action command.
- Proposed ADR-0029 revision 1 selects a permanent V2 compatibility reader and
  conflicts with this revision. It must not be accepted as written. After this
  requirement is accepted, issue a revised or superseding ADR for the migration.
- Requirement revision 1 remains historical and unaccepted. No prior owner or
  independent-review state carries to this changed candidate.

## Required schema semantics

R1. `CharacterDefinitionV3` has a dedicated bounded `consciousGuidance`
collection separate from `actionNorms`.

R2. A conscious-guidance entry preserves the fields needed for its historical
deliberative effect: stable ID, applicability clauses and match mode, statement,
priority, `preference` or `commitment` force, self-awareness, exceptions, and
descriptive provenance where present. It has no action references, action kinds,
tactic tags, fallback action, or restrictive disposition.

R3. Conscious guidance may contribute an awareness-gated statement to conscious
judgment when its clauses apply. It must not rank, exclude, constrain, force, or
fabricate a legal action. It must not update psyche state and is not sent to the
engine as an action candidate or result.

R4. Every V3 `actionNorm` is executable and selects at least one `actionRef`,
`actionKind`, or `tacticTag`. Selectorless `constraint`, `allow_only`, `forbid`,
and soft action norms are invalid for V3 activation.

R5. New create, revision, upgrade, restore, import, and derived authoring paths
produce V3 candidates after cutover. They must not emit selectorless action
norms or use migration compatibility as an authoring fallback.

## Migration eligibility and mapping

R6. The production migration input is a frozen, owner-reviewed manifest of the
exact eight current generation IDs observed as `ready` on 2026-09-10. Before
each write, the migration rechecks that the logical asset still points to the
recorded generation, remains ready, and has not changed content.

R7. An entry is eligible for deterministic movement only when all selectors are
empty, the disposition is `prefer`, and force is `preference` or `commitment`.
The migration copies the R2 fields without LLM use or semantic rewriting and
removes that entry from the replacement generation's `actionNorms`.

R8. Fully selected action norms and all unrelated definition, disclosure,
public-presentation, media, and operational values remain semantically
unchanged. Public prose is not regenerated. New content and provenance digests
and required compiler receipts are computed for the replacement generation.

R9. A selectorless restrictive norm, unknown reference, missing receipt,
pointer mismatch, non-ready state, unexpected schema, changed source digest, or
other unmapped value fails that asset closed. The migration does not guess,
drop, or repair it and does not move its pointer.

R10. The sixteen owner characters without an exact ready V2 state are not
eligible. They remain unsupported and use the existing explicit authoring or
upgrade workflow.

## Append-only execution and recovery

R11. Existing generation bytes are never edited. For each eligible character,
the migration appends one validated V3 generation and atomically moves that
logical asset's current pointer with a compare-and-swap against the frozen V2
generation ID. Old battles remain bound to their recorded generations.

R12. "Bulk" means one bounded operation over the frozen manifest, not one
cross-character transaction. Each character commits independently and records
source generation, target generation, status, error classification, and
timestamps. A failure is observable and does not roll back already completed
characters or mark an unprocessed character complete.

R13. The operation is idempotent. Repeating it for an already migrated source
returns the recorded target; retrying a failed item is allowed only after its
unchanged source and failure disposition are revalidated. Pointer drift stops
that item without overwriting newer owner work.

R14. Deployment and production migration are separate effects. Compatible code
that can read required historical V2 generations and new V3 generations must be
deployed and verified before the production migration. This requirement does
not authorize deployment, traffic changes, migration execution, or pointer
rollback.

## Acceptance criteria

- Schema tests distinguish qualified `CharacterDefinitionV3` from runtime
  `CharacterAgentStateV3` and reject ambiguous bare-version routing.
- V3 parsing accepts conscious guidance and rejects every selectorless action
  norm before activation.
- A deterministic fixture moves all and only eligible selectorless soft entries,
  preserving their IDs, conditions, ordering inputs, awareness, exceptions, and
  statements without a provider call.
- Changing only a conscious-guidance statement can change the conscious input
  text but cannot change ranked or excluded action keys, engine candidates, or
  psyche state.
- Mixed generations preserve fully selected action norms unchanged while moving
  only eligible conscious guidance.
- Restrictive selectorless entries, unknown values, missing receipts, source
  drift, and pointer drift fail closed without a new current generation.
- Production-shaped fixtures represent nine ready V2 characters: eight with
  twenty-one eligible selectorless soft entries and one fully selected Takumi
  generation. The migration selects exactly the eight recorded sources.
- Each successful fixture appends a V3 generation and advances only that
  character's current pointer. The V2 generation remains readable, and an old
  battle remains byte-for-byte bound to it.
- A partial-failure fixture records per-character outcomes and an idempotent
  retry without duplicate target generations or hidden partial completion.
- The sixteen no-state characters remain unsupported and absent from match
  selection.
- New create/revision/upgrade/restore/import fixtures target V3 and cannot emit
  the legacy selectorless representation.
- Dry-run output lists exact eligible, rejected, drifted, and already-complete
  items without writes. Production execution and readback have their own later
  owner gate.

## Out of scope and unknowns

- The exact conscious-guidance compiler identifier and final field-level bounds
  remain successor-ADR decisions, but they must satisfy R1-R4 and cannot reuse an
  existing identity with changed meaning.
- Whether non-production test or seed assets outside the frozen production
  manifest receive the same migration is a delivery-plan decision.
- Production deployment, traffic changes, migration execution, pointer rollback,
  provider-backed regeneration, and bulk upgrade of no-state characters are out
  of scope.
- Live xAI validation of the separate response-schema identity repair remains a
  separately authorized evidence step.

## Self-review

- Source provenance and conflicting authority are explicit. ADR-0010 is not
  silently overridden, and proposed ADR-0029 revision 1 is rejected as an
  implementation authority for this candidate.
- The review scope includes schema semantics, deterministic mapping, append-only
  activation, partial failure, idempotency, and new-authoring cutover.
- The candidate neither edits immutable bytes nor assigns invented selectors.
- Production-shaped counts are evidence inputs, not permission to execute.
- A new CharacterDefinition version is separated from existing runtime and
  expression versions.
- Optional future migration of other assets and production execution are not
  acceptance blockers.

## Proposed independent-review input

Review the exact revision-2 candidate for: conflict with ADR-0010 and the exact
successor decision required; semantic completeness of R2/R7 mapping; proof that
conscious guidance cannot affect action ranking, engine input, or psyche state;
append-only generation and old-battle preservation; per-asset atomicity,
idempotency, and drift behavior; separation of CharacterDefinitionV3 from other
V3 identities; and strict V3 authoring after cutover. Do not add deployment,
production execution, LLM regeneration, or migration of the sixteen no-state
characters as acceptance criteria.
