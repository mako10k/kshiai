# ADR-0013: Compile narration style definitions into phase-specific policy

- Status: Accepted
- Date: 2026-08-14
- Decision owner: Product owner
- Related: ADR-0010; `SDA_NARRATION` in
  `docs/structured-domain-assets.pert`;
  `docs/structured-narration-definition-design.md`

## Context

The current narration style is a mutable name, public description, perspective,
and free-form instruction. Management and match selection read the same list,
generation writes happen both when a style is saved and again when a battle is
created, and the same unchecked instruction is passed to prologue, combat,
judgment, and aftermath narrators. Generated styles are persisted immediately
without owner review.

Perspective projection already limits which character information a narrator
receives, and phase narrators already have distinct authoritative input
contracts. The style instruction nevertheless has no machine-checkable cadence,
intensity, rhetoric, example, phase, or conflict contract. This conflicts with
ADR-0010's requirement that selectable authored assets have a ready structured
generation, a derived public projection, explicit activation, and read-only
battle binding.

## Decision drivers

- Preserve expressive authored voices without letting style prose invent
  character, world, action, result, or private facts.
- Make perspective rights, phase behavior, density, and intensity reviewable
  before selection.
- Give every narrator a bounded phase-specific prompt instead of one mutable
  instruction.
- Keep examples useful as rendering guidance without making them facts or text
  to copy.
- Upgrade owner-authored legacy styles explicitly and retain old battles on
  their frozen snapshots.

## Considered options

1. Keep the free-form instruction and add stronger prompt warnings. This is
   small but leaves policy, phase conflicts, and readiness unvalidated.
2. Use an open map of arbitrary style dimensions and compiler tags. This is
   extensible but makes server validation and conflict precedence unstable.
3. Use closed operational dimensions, bounded descriptive fields, a derived
   public style card, and a versioned deterministic phase compiler.

## Decision

Choose option 3.

`NarrationDefinitionV2` is the authoritative style policy. It contains:

- identity, language, public tags, and one bounded narrator-persona descriptor;
- requested perspective rights using the existing closed perspective
  vocabulary;
- closed voice register, audience distance, subjectivity, address, sentence,
  paragraph, line, and dialogue-placement controls;
- an exact policy for prologue, action, impact, release, judgment, and aftermath;
- bounded explanation, imagery, metaphor, humor, violence, and explicitness
  dimensions;
- stable preferred and forbidden rhetoric entries; and
- stable tagged examples and counterexamples whose text is rendering guidance
  only.

Operational dimensions and phase names are closed enums or bounded numeric
values. Display tags do not affect compilation. Adding an operational value
requires a new schema/compiler version.

The public style card is a stored derived projection generated from the frozen
natural source and a server-filtered display projection. It may describe voice,
cadence, and audience-visible intensity. It excludes example text, forbidden
patterns, compiler instructions, internal precedence, and control metadata. Its
claim receipt must validate every factual segment before activation.

Creation, revision, and explicit upgrade use the common persisted attempt and
atomic activation contract from ADR-0010. Legacy owner styles remain manageable
as `unsupported`, `upgrading`, or `upgrade_failed`, but only `ready` schema-2
generations appear in selectors or bind to new battles. Generated candidates
require owner confirmation. System styles are deterministic schema-2 imports;
user styles are never bulk upgraded.

`narration-prompt-v2` validates the exact ready envelope and compiles a frozen
instruction for every supported phase. It selects examples by stable ID and
phase in definition order, with at most two positive examples and one
counterexample per phase and bounded total text. Every compiled instruction
states that examples must not be copied and cannot supply facts.

Conflict precedence is fixed:

1. provider safety, output schema, committed battle facts, and grounding;
2. server perspective/information projection;
3. phase narrator contract and result authority;
4. compiled narration style.

A style may narrow presentation but cannot broaden any higher-priority input.
The compiler emits no character, battlefield, action, or result facts.

Battle creation reads and binds the exact ready generation, content digest,
compiler version, and compiled phase policy. It performs no narration-style
generation write. Narration consumers use only the frozen compiled policy for
their phase; they never reread the current style row or use public card prose.

## Consequences

### Positive

- Style behavior is inspectable and reproducible across all narration phases.
- Perspective and result authority cannot be overridden by authored prose.
- Examples can shape voice without becoming narrative evidence.
- Existing battles remain stable after style edits or deletion.

### Negative and risks

- Legacy owner styles require explicit review before becoming selectable.
- Closed operational vocabularies require versioned changes for new controls.
- Deterministic compilation is deliberately less permissive than directly
  injecting arbitrary prompt text.
- System presets require maintained structured import fixtures.

## Compatibility and migration

- Add narration compatibility and authoring-attempt tables without deleting or
  eagerly upgrading user rows.
- Deterministically import maintained system seeds as ready schema-2
  generations.
- Preserve legacy rows for management, deletion, and explicit upgrade input.
- Preserve existing battle snapshots and schema-1 generations unchanged.
- Keep `narration_styles` as a management/public read model; the ready
  generation owns selection and new battle binding.

## Verification

- Schema tests reject unknown phases, unbounded budgets, duplicate stable IDs,
  invalid rhetoric/example tags, and unsupported compiler contracts.
- Compiler tests prove deterministic phase output, precedence language,
  example budgets, anti-copy language, and independence from public prose.
- Repository and actual HTTP/persistence tests cover candidate review,
  confirmation, revision, upgrade, expiry, idempotency, and pointer drift.
- Management includes unsupported rows while selectors and direct battle IDs
  accept only accessible ready schema-2 generations.
- Battle creation performs no narration-style generation write and all
  prologue, action/impact/release, judgment, and aftermath requests use their
  frozen phase instruction.
- Full workspace tests, typecheck, build, PERT validation, and local evidence
  pass before the task is closed.

## Implementation references

- [Detailed design](../structured-narration-definition-design.md)
- `packages/shared/src/structured-narration.ts`
- `backend/src/repositories/narration-style-assets-v2.ts`
- `backend/src/services/narration-style-authoring-service.ts`
- `backend/src/services/battle-service.ts`
