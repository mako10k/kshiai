# Character V2 compatibility correction — requirement candidate revision 1

- Status: Step 1 candidate; owner review pending
- Date: 2026-09-10
- Decision owner: Product owner
- Sources: current owner bug report; ADR-0010; ADR-0027; structured-character design; rc8 RCA; production read-only evidence captured on 2026-09-10
- Related proposed design: ADR-0029

## Objective

Restore characters that were successfully activated as Character V2 before the
selector rule to match selection without weakening new authoring validation or
rewriting immutable production generations. Make the legacy terminology debt
explicit: a selectorless soft statement is conscious guidance retained in the
old `actionNorms` location, not an executable action selector.

This requirement is separate from the provider response-schema defect that
currently prevents new character creation. That defect is a mechanical failure
to send the normalized JSON Schema and may be corrected without changing this
compatibility decision.

## Prior-authority disposition

- ADR-0010 continues to own immutable generations, explicit readiness state,
  server-side selection, compiler compatibility, and read-only battle binding.
- ADR-0027 continues to own the separation among non-deliberative psyche,
  conscious goal/action/utterance judgment, and engine validation.
- The rc8 RCA correctly restored historical candidate readability. Its later
  statement that every selectorless active V2 generation is `unsupported` is
  implementation evidence, not an Accepted ADR, and is the behavior being
  reconsidered here.
- Legacy rows with no ready V2 generation remain `unsupported`; this candidate
  does not restore the pre-V2 runtime path.

## Terminology and required behavior

R1. **Executable action norm** means a norm whose response selects at least one
`actionRef`, `actionKind`, or `tacticTag`. It may rank or constrain matching legal
actions according to its disposition and force.

R2. **Legacy conscious-only guidance** means an already-activated V2 norm with
no action selector, a soft `prefer` disposition, and `preference` or `commitment`
force. It may contribute its awareness-gated statement to conscious judgment.
It must not rank, exclude, force, or fabricate an action.

R3. A stored generation is eligible for R2 only when the persisted
`character_asset_states` row already marks that exact current generation
`ready`. Read-time compatibility must not promote an unsupported generation or
move a pointer.

R4. A selectorless constraint, an unknown reference, a missing required
compiler receipt, an invalid public-profile claim receipt, a state-pointer
mismatch, or a non-V2 generation still fails closed.

R5. New create, revision, upgrade, restore, and derived generations must satisfy
the current activation rule: every newly activated action norm has at least one
structured selector. The compatibility interpretation in R2 is not a new
authoring fallback and must not be emitted by the LLM or deterministic converter.

R6. The existing immutable generation bytes are not edited. No automatic
production migration or LLM regeneration follows from this requirement.

R7. In comments, diagnostics, and design text, do not call R2 an executable
action norm without the `legacy conscious-only guidance` qualifier. Do not move
it into psyche: it is deliberative guidance consumed by conscious judgment, not
a non-deliberative reaction state.

## Acceptance criteria

- A fixture whose exact V2 generation is already `ready` and contains only R2
  selectorless entries remains selectable and can be bound to a new battle.
- The same statements enter conscious principles when their clauses apply, but
  changing only those statements does not change the mechanically ranked or
  excluded action keys.
- Selectorless `constraint`, `allow_only`, or `forbid` entries remain rejected.
- A newly saved authoring candidate containing any selectorless action norm is
  rejected before activation.
- Unsupported legacy/no-state characters remain absent from selection.
- Current production-shaped evidence is represented by fixtures: nine stored
  ready characters, eight with soft selectorless V2 guidance and one with fully
  selected norms. The test does not read or mutate production.
- Existing V1/V2 battle snapshots and immutable generation digests are unchanged.

## Out of scope and unknowns

- A future schema field dedicated to conscious principles is desirable but is
  not selected here; its exact V3 mapping remains unknown.
- Production deployment, traffic changes, production generation mutation,
  provider-backed regeneration, and bulk upgrade are out of scope.
- This candidate does not make all twenty-five owner characters selectable;
  the sixteen characters with no ready V2 state still require the existing
  explicit upgrade workflow.
- Live xAI validation of the separate creation-schema repair remains separately
  authorized evidence.

## Proposed independent-review input

Review the exact revision-1 bytes for: consistency with ADR-0010 immutable
activation and ADR-0027 responsibility boundaries; whether R2 can affect action
ranking or constraints; whether any non-ready generation can be promoted by a
read; and whether the new-authoring rule is kept distinct from persisted V2
compatibility. Do not add a general migration, a new V3 field, or deployment as
an acceptance condition.
