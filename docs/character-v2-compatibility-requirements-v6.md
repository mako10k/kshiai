# Character semantic migration — requirement candidate revision 6

- Status: Step 1 candidate; self-review complete; first owner review pending
- Date: 2026-09-10
- Decision owner: Product owner
- Replaces for review: `character-v2-compatibility-requirements-v5.md`
- Sources: owner `REVISE` route after revision-5 independent review; revision-5
  candidate and independent review; ADR-0010; ADR-0011; ADR-0027; ADR-0028;
  structured-asset and structured-character designs; current character
  authoring/selection RCA; production read-only evidence captured on 2026-09-10
- Conflicting proposed design: ADR-0029 revision 1

## Objective

Restore the eight affected already-ready characters without a permanent V2
reader exception. Migrate each frozen V2 definition into a coherent immutable
V3 generation through a versioned, reviewable LLM-assisted semantic migration.
Use exact deterministic copying where meaning is unchanged; let the LLM propose
bounded moves, transformations, synthesis, retirement, or deferral where fields
were removed, added, or changed role. Preserve displaced source values for later
remigration, retain old generations and battle bindings, and keep all
post-cutover authoring paths strict.

The objective is restoration, not adding another eligibility dead end. A
schema-valid historical value is not rejected merely because no fixed field map
was predetermined. Semantic gaps enter the migration workflow for resolution,
preservation, or valid deferral. Integrity conflicts still prevent activation;
they do not silently erase or reinterpret the source.

This requirement is separate from the provider response-schema identity defect
that currently prevents new character creation. That repair remains necessary,
but its authoring response contract must target the selected character-definition
version after cutover.

## Authority disposition

### ADR-0010 — common immutable asset envelope

Preserve immutable generations, explicit compatibility, server-side eligibility,
compare-and-swap current-pointer activation, read-only battle binding, persisted
authoring attempts, validation before activation, and no provider call inside an
activation transaction. The frozen operation is not inferred from row existence
and never runs during selection or battle creation.

Revision 6 intentionally changes ADR-0010's deterministic-only legacy mapping
direction. A successor ADR must explicitly authorize a bounded LLM-assisted
semantic migration while retaining frozen input identity, provider-request
receipts, deterministic validation, owner review, per-asset activation, and
failure isolation. It must also define how an immutable preservation capsule is
bound to the target generation without becoming authoritative runtime input.

### ADR-0011 — structured character definition

Preserve structured character truth, derived audience-specific projections,
confirmation before activation, deterministic runtime action semantics,
disclosure gates, owner management of unsupported assets, exact-generation
battle binding, and the prohibition on in-place mutation. The LLM authors a
migration candidate; it does not become an engine rule evaluator, disclosure
authority, or activation authority.

A successor ADR must explicitly supersede or refine these V2-specific parts:

- `CharacterDefinitionV2` as the only latest authored character definition;
- ready-current-V2 as the only eligible current character generation;
- V2 output for create, revision, upgrade, restore, import, and derived paths;
- deterministic-only legacy-field mapping; and
- exclusion of this bounded bulk migration from ADR-0011's accepted scope.

Existing historical V2 generations and battle bindings remain governed by
ADR-0011 and stay readable. Revision 6 does not reinterpret their stored bytes.
Production execution remains separately gated.

### ADR-0027 — conscious agency and psyche boundary

Preserve conscious ownership of goal, action, and utterance judgment, separate
from non-deliberative psyche and engine validation. Conscious guidance is
authored character input consumed by conscious judgment. It is not psyche state,
an engine action command, or an independent action-selection authority.

Migration-time LLM classification does not change those runtime responsibilities.
It may propose where authored values belong in V3, but only the validated target
schema and registered compilers determine their consumers.

### ADR-0028 — versioned conscious agency contract

Preserve all existing qualified V3 identities and their ownership:

- `BattleAssetManifest` schemaVersion 3 remains the immutable battle binding;
- `CharacterBattleCompilerInputsV3` remains the battle-bound compiled input;
- dialogue schemaVersion 3 and Compact mode remain dialogue input contracts;
- conscious input/output contract version 3 remains runtime judgment I/O; and
- `CharacterAgentState.consciousAgencyV1` remains the closed mutable
  battle-runtime conscious-agency state within `CharacterAgentState`.

`CharacterDefinitionV3` and `schemaVersion: 3` identify an authored immutable
asset definition upstream of those contracts. They replace none of them. A
changed compiler output receives a new qualified identity rather than silently
reusing `CharacterBattleCompilerInputsV3` or another V3 name.

The current generation-backed basic-action provenance discriminator
`character_generation_v2` retains its V2 meaning. A V3 source uses a qualified
successor representation or a proved semantics-preserving mapping.

### Proposed and historical candidates

Proposed ADR-0029 revision 1 selects a permanent V2 compatibility reader and
conflicts with this requirement. It must not be accepted as written. After this
requirement is accepted, revise that still-Proposed ADR or issue a successor ADR
for semantic migration. Requirement revisions 1 through 5 remain historical and
unaccepted; their review state does not carry forward.

## V3 schema and runtime boundaries

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
its later experience may therefore have indirect downstream effects.

R4. Every V3 `actionNorm` is executable and selects at least one `actionRef`,
`actionKind`, or `tacticTag`. Selectorless action norms are invalid for V3
activation. A migrated mechanical fallback is represented by a qualified
mechanical contract, never hidden in conscious guidance. The successor ADR may
choose that contract's exact schema, but it must preserve or explicitly declare
changes to applicability, legality, ordering, and conflict receipts.

R5. Changed or retired V2 source values are stored in an immutable,
content-digested `MigrationPreservationCapsuleV1` logically bound to source and
target generations. The capsule is outside authoritative character truth. It is
restricted, size-bounded, excluded by construction from public, battle, psyche,
conscious, narration, and ordinary authoring compilers, and available only to a
registered future migration consumer. Physical storage remains a successor-ADR
choice.

R6. A field not required by any currently declared compiler capability may use a
typed deferred marker instead of a fabricated value. The marker identifies the
target path, reason, candidate source paths, and the capability that would require
resolution. A required mechanics, legality, reference, disclosure, or active
consumer value must be resolved and validated before that consumer reports
compatibility. No LLM call occurs on a selection, search, battle-create, battle
retry, battle resume, or battle replay read path.

R7. After explicit schema-3 cutover, new create and ordinary revision authoring
produce complete strict V3 candidates. Upgrade, restore, import, and derived
authoring from historical input use the same semantic-migration contract and
never emit selectorless V3 action norms or a new current V2 generation.

## Frozen input and LLM-assisted semantic migration

R8. The production migration input is a frozen, owner-reviewed manifest of the
exact eight current generation IDs observed as `ready` on 2026-09-10. Before a
provider request and again before activation, the workflow rechecks logical asset
ID, current generation ID, source schema, source content identity, and applicable
compatibility state. The sixteen owner characters without an exact ready V2 state
are outside this operation and remain on their explicit authoring or upgrade path.

R9. Each `migrationAttemptId` freezes the complete V2 source, natural-source material
permitted by its retention and disclosure contract, target schema, migration
contract, prompt identity, response-schema identity, provider route, model
identity, and initial request digest. Every provider invocation within the attempt
has a distinct `providerRequestId`, request digest, parent request when applicable,
accounting record, and response or failure receipt. Provider chain-of-thought is
neither requested nor stored. Provider failure or invalid output leaves the current
generation unchanged and the attempt retryable.

R10. The LLM returns a bounded structured semantic change set. Each operation is
one of `copy`, `move`, `transform`, `synthesize`, `retire_to_capsule`, or `defer`
and identifies its target, source paths where applicable, output value or deferred
marker, bounded owner-facing explanation, provenance category, and proposed
semantic dependants. Stable IDs and references are copied from registered input
or allocated by server-owned rules; the LLM never invents control identifiers.

R11. Exact copy is preferred when a V2 value retains the same V3 role. The LLM
decides only semantic discontinuities: where a removed value belongs or whether
it can leave active truth, how an added field is derived or creatively completed,
and how a changed-role value is transformed. `retire_to_capsule` removes a value
from active V3 truth only after preserving the exact source. `synthesize` clearly
distinguishes source-supported derivation from model-created character material.

R12. A value may move to more than one target when V2 combined responsibilities
that V3 separates. For a selectorless soft norm, its awareness-gated statement
may become conscious guidance while a non-null `fallbackActionRef` is separately
preserved, transformed into an explicit mechanical conflict-fallback contract, or
retired with a declared semantic change. It is never silently dropped, treated
as ordinary conscious guidance, converted into an invented action selector, or
used as a reason by itself to reject the whole character.

R13. Fully selected action norms and all other values may be copied unchanged or
changed only through explicit semantic-change operations. Public prose is reused
unless an accepted operation regenerates it from an allowed display projection.
For every moved or transformed disclosure path, server-owned policy validation
preserves or explicitly narrows effective grants and prohibits widening. Copied
consumer tags remain descriptive guidance and never grant access by themselves.

R14. Complete-candidate validation includes structural enforcement and semantic-
consistency review. Structural enforcement covers schema bounds, registered
references, action legality, compiler compatibility, disclosure ceilings,
consumer access, target/source completeness, operation coverage, and no
unaccounted source removal. The repair closure is the union of server-known
structural dependencies, LLM-proposed semantic dependants, and additional fields
identified by independent whole-candidate semantic-consistency review.

An invalid or inconsistent result is retried with the error, cause, relevant
source context, prior valid fragments, and current repair closure. The next
provider request asks only for invalid or inconsistent portions and the fields
whose meaning may change with them. After merge, both structural and semantic
validation run over the complete candidate and may expand the closure again. An
unresolved candidate remains reviewable or failed and never activates; wholesale
output is not required when bounded repair reaches closure.

R15. Validation produces an owner-reviewable semantic diff grouped by unchanged,
moved, transformed, synthesized, retired, and deferred values. The diff exposes
behavioral and disclosure effects, uncertainties, and provenance without exposing
provider chain-of-thought or restricted values to an unauthorized surface.
Activation requires owner acceptance of exact candidate digests. One batch
acceptance may bind the exact per-asset candidate set; partial acceptance is
explicit and never inferred.

## Compatibility, readiness, and deferral

R16. Compatibility is evaluated against registered consumer/compiler
requirements. A deferred field that no currently required consumer reads does not
make the character globally unselectable. A character may be ready for the
current match/battle consumer set while remaining unresolved for a future
capability. Compatibility output reports the qualified supported and deferred
capabilities rather than one unexplained all-or-nothing mapping failure.

R17. Before a deferred value's capability is enabled or made required, a separate
authoring or migration attempt resolves and validates it and appends a new
generation. First need does not authorize an inline provider call. Until
resolution, only that capability is unavailable; existing compatible consumers
continue using the bound generation.

R18. Semantic ambiguity, a removed field, a newly required field, or changed role
is work for `transform`, `synthesize`, `retire_to_capsule`, or `defer`, not a
permanent eligibility rejection. Activation still stops on unresolved values
required by the selected consumer set, invalid references, disclosure widening,
missing preservation, invalid receipts, source or pointer drift, provider failure,
or owner non-acceptance. These are retryable or reviewable attempt outcomes and
do not mutate the current generation.

## Append-only execution, receipts, and retry

R19. Existing generation bytes are never edited. For each accepted character,
migration appends one validated V3 generation, binds its preservation capsule and
receipts, and moves only that logical asset's current pointer by compare-and-swap
against the frozen source generation. Old battles remain bound to their recorded
generations.

R20. "Bulk" means one bounded operation over the frozen manifest, not one
cross-character transaction. Each character generates, reviews, and commits
independently. One item failure neither rolls back completed items nor marks
pending items complete.

R21. At the per-asset migration commit boundary, replacement generation, current
pointer, compatibility state, preservation binding, owner acceptance, and durable
success receipt become visible atomically. A success receipt uniquely binds
migration contract, attempt, logical asset, source generation, target generation,
candidate digests, capsule, and provider-request receipt set. Later separately
authorized revisions may move
the current pointer; the migration receipt remains historical and does not claim
that its target is still current.

R22. Idempotency distinguishes attempt, provider request, candidate, and
generation identity. Replaying a completed `migrationAttemptId` returns its
recorded target without a new provider request or duplicate generation. Bounded
repair continues the same attempt, reuses valid fragments, and may add one or more
new, individually receipted `providerRequestId` values. Intentionally asking the
provider for a different semantic result creates a new attempt and owner-review
candidate rather than silently replacing the prior output. Pointer drift stops
activation without overwriting newer owner work.

## Cutover and effect boundaries

R23. Cutover is selected by an explicit qualified
`characterDefinitionSchemaVersion` authoring policy value, not by wall-clock,
deployment version, dialogue schemaVersion, or bare `V3`. Its persistence and
activation mechanism are fixed by the successor ADR. Defaults do not change
silently.

R24. Code that can read required historical V2 and new V3 generations, execute
and resume semantic-migration attempts, validate V3 projections, evaluate
consumer-scoped compatibility, express qualified V3 provenance, and reject mixed
contract tuples is deployed and verified before selecting schema 3 or running
production migration.

R25. Requirement acceptance, successor-ADR acceptance, implementation,
deployment, authoring-policy activation, provider-backed production candidate
generation, production pointer migration, and rollback are separate effects.
This candidate authorizes none of those later effects by itself.

## Acceptance criteria

- Authority review traces the changed legacy-mapping direction to ADR-0010 and
  ADR-0011 while preserving their immutable, validation, confirmation, CAS,
  read-only battle-binding, and no-battle-time-provider controls.
- Namespace tests distinguish `CharacterDefinitionV3` from all ADR-0028 V3
  contracts and `CharacterAgentState.consciousAgencyV1`; mixed tuples fail closed.
- V3 parsing accepts conscious guidance, rejects selectorless action norms, and
  keeps migration preservation outside every runtime/public compiler input.
- A structured migration fixture covers all six operations and accounts for every
  changed or removed source path without silently dropping a value.
- Fixtures cover one V2 value split across conscious guidance and a qualified
  mechanical fallback target, including a non-null fallback on a selectorless
  soft norm. The character is not rejected merely because that field is non-null.
- Synthesized fields identify allowed source material versus model-created
  character material, and neither can invent stable control IDs, runtime facts,
  information rights, or undisclosed mechanics.
- Capsule fixtures preserve exact displaced paths and values, bind source and
  target generations, enforce bounds and restricted access, and prove that all
  ordinary compilers ignore the capsule. A future migration fixture can recover
  the preserved input through its registered consumer.
- Disclosure fixtures prove path changes do not widen grants and copied consumer
  tags do not become access authority.
- Invalid-output fixtures show that structural dependencies, LLM-proposed
  semantic dependants, and independent whole-candidate semantic review can expand
  a bounded repair closure. Every merged candidate is fully revalidated and an
  unresolved semantic inconsistency cannot activate.
- Bounded repair keeps one `migrationAttemptId`, reuses valid fragments, records
  each additional provider invocation under a new `providerRequestId`, and
  creates no generation before acceptance. Completed-attempt replay makes no
  provider request and creates no duplicate generation. Requested semantic
  regeneration creates a distinct attempt and review candidate.
- Deferred optional/future fields do not block current battle compatibility.
  Deferred required fields block only the affected qualified capability and are
  resolved before that capability is enabled, without provider calls on reads.
- Guidance-only changes cannot directly change legal, ranked, or excluded action
  keys. Declared mechanical transformations appear separately in the semantic
  diff and compiler receipt.
- Production-shaped fixtures represent nine ready V2 characters: the affected
  eight with twenty-one selectorless soft entries and fully selected Takumi. All
  eight enter the semantic migration workflow; schema-valid semantic gaps are
  resolved, preserved, or validly deferred rather than excluded by a fixed-map
  eligibility rule.
- Exact candidate digests can be reviewed and batch-accepted without treating
  unreviewed or failed items as accepted.
- Each accepted fixture atomically appends V3, binds capsule and receipts, and
  moves its pointer. Old V2 and old battles remain byte-for-byte readable.
- A later ordinary revision moves the current pointer while retaining the
  historical migration receipt and capsule binding.
- Crash, partial-failure, owner-decline, provider-failure, source-drift, and
  pointer-drift fixtures leave the previous current generation unchanged and
  report a retryable or reviewable per-asset outcome.
- The sixteen no-state characters remain outside this bounded migration.
- Post-cutover create/revision are strict V3. Historical restore/import/derived
  input goes through semantic migration and never creates a new current V2.
- Dry-run performs no provider call or write and lists frozen targets, current
  identity checks, expected provider work, already-complete attempts, and drift.
  Production provider use, activation, and readback each retain later gates.

## Alternatives and tradeoffs

### A. Fully deterministic field mapping

It is reproducible and cheap, but cannot safely decide added, removed, or
role-changed meaning and tends to convert semantic gaps into new eligibility
dead ends. Revision 6 does not select it as the complete migration strategy.

### B. Unrestricted LLM rewrite and immediate activation

It is flexible and fast to describe, but hides source loss, makes retries
unstable, and bypasses validation, disclosure, owner review, and append-only
activation controls. Revision 6 rejects it.

### C. Hybrid LLM-assisted semantic migration with preservation and deferral

It costs provider calls, structured change-set design, review UI, capsule
retention, and more test cases. In return, it can restore the eight characters,
represent schema evolution honestly, preserve displaced values, and avoid both a
permanent reader exception and deterministic-map dead ends. Revision 6 selects
this option.

### D. Permanent V2 compatibility reader

It has the smallest short-term schema change but preserves dual runtime meaning
and leaves the terminology collision active. It conflicts with the objective.

## Remaining design choices and risks

- Exact qualified identity and schema of migrated mechanical fallback rules
- Physical storage, size limit, retention, export, and deletion policy for
  `MigrationPreservationCapsuleV1`
- Qualified compiler-capability and deferred-marker representations
- Migration prompt, response, semantic review, repair, and provider-request
  contract identities and bounded retry budget
- Batch owner-review UI and whether any class of no-semantic-change candidate can
  use a separately approved automatic acceptance policy
- V3 basic-action source representation
- Authoring-policy persistence and activation mechanism
- Provider cost, latency, availability, and model-version drift
- Whether retained source fragments contain data requiring shorter retention or
  explicit owner deletion

These are successor-ADR choices. They may not weaken R1-R25 or reuse an existing
identity with changed meaning.

## Out of scope

Production deployment, traffic changes, policy activation, provider-backed
production migration, pointer rollback, migration of the sixteen no-state
characters, and live xAI verification of the separate response-schema repair are
out of scope and require separate authority.

## Self-review

- The objective is restoration rather than another fixed-map eligibility gate.
- LLM judgment creates a bounded candidate and semantic diff; schemas, disclosure,
  runtime mechanics, compatibility, owner acceptance, and activation remain
  deterministic control boundaries.
- Changed and retired values are preserved outside authoritative truth and every
  ordinary compiler, with future access limited to a registered migration
  consumer.
- Deferral is consumer-scoped. It neither blocks unrelated current consumers nor
  permits a provider call on selection or battle paths.
- A selectorless soft norm may split across conscious and mechanical targets;
  non-null fallback is not silently lost, invented as a selector, or turned into
  a character-wide rejection condition.
- ADR-0010 and ADR-0011 require an explicit successor refinement before this
  nondeterministic migration can be implemented or run.
- Model nondeterminism is not mislabeled as deterministic; idempotency binds the
  frozen attempt and accepted candidate.
- Atomic receipt language is scoped to migration commit and allows later ordinary
  revisions to move the current pointer while retaining historical evidence.
- Capsule layout, retention, compiler identities, automatic-acceptance policy,
  deployment, provider use, and production mutation remain unapproved.
- Migration-attempt, provider-request, accepted-candidate, completed-replay, and
  generation identities are separate. Bounded repair reuses valid fragments
  without falsely claiming that no additional provider invocation occurred.
- Repair closure combines server-known structural dependencies, LLM-proposed
  semantic dependants, and independent whole-candidate semantic review. Every
  merge is fully revalidated and may expand the closure again.

## Proposed independent-review input

Review the exact revision-6 candidate for: correct authority refinement of
ADR-0010 and ADR-0011; preservation of ADR-0027/0028 responsibilities and
qualified identities; separation of LLM candidate authorship from deterministic
runtime and activation authority; complete change-set operation semantics;
preservation-capsule non-consumption, privacy, and future-remigration access;
consumer-scoped deferral without battle-time provider work; selectorless soft
norm and fallback splitting; disclosure non-widening; bounded structured-output
repair with independently expandable semantic closure; distinct attempt,
provider-request, completed-replay, candidate, and generation identities;
idempotency despite nondeterministic generation; owner acceptance;
append-only and later-revision receipt semantics; explicit cutover; restoration
of all eight rather than a new eligibility dead end; and strict post-cutover
authoring. Do not add deployment, production execution, migration of the sixteen
no-state characters, or live xAI work as acceptance criteria.
