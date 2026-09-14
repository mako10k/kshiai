# Focused V3 character authoring — requirement candidate revision 1

- Status: Step 1 candidate; self-review complete; first owner review pending
- Date: 2026-09-11
- Decision owner: Product owner
- Scope: V3 character creation, V3 character revision, and V2-to-V3 character migration
- Sources: accepted structured-asset authoring workflow; ADR-0010; ADR-0011;
  ADR-0014; ADR-0027; ADR-0028; accepted character semantic migration
  requirement revision 6; accepted ADR-0030; owner direction on focused LLM
  input and output on 2026-09-11

## Objective

Use one V3 character-authoring process for three entry modes:

1. create a new complete strict V3 character from owner-provided natural source;
2. create a new immutable V3 revision from an existing V3 generation and an
   owner-requested change; and
3. migrate a V2-conformant character whose information is incomplete or has
   different roles under V3 into a complete strict V3 generation.

The complete candidate is assembled and validated by server-owned orchestration.
No model invocation is responsible for understanding or regenerating the entire
character. If an LLM is used, each request and response is limited to one explicit
semantic work item and its bounded dependency closure. Mechanical rules, an LLM,
or an owner decision may resolve a work item, but all routes produce the same typed,
receipted result for server validation.

## Authority disposition

### Preserved authority

- ADR-0010 continues to own immutable generations, persisted idempotent attempts,
  compatibility, owner acceptance, append/CAS activation, and read-only battle
  binding. Provider work never runs in an activation transaction.
- ADR-0014 continues to own queued authoring execution. Submit and read routes do
  not execute provider work, and the authoring worker advances the attempt.
- ADR-0011 continues to own structured character truth, derived public
  presentation, disclosure gates, confirmation before activation, and separation
  from battle state. Its V2-only authoring details require a successor ADR for V3.
- ADR-0027 and ADR-0028 continue to own the runtime boundary between authored
  character input, conscious judgment, reaction-only psyche, and deterministic
  engine validation. Authoring does not move runtime responsibilities.
- Accepted semantic-migration requirement revision 6 continues to govern exact
  V2 source preservation, typed deferral, source/pointer drift, production-manifest
  scope, and the existing production migration authority gates.

### Generalized or replaced authority

- ADR-0030's migration operations, preservation, receipts, bounded repair, and
  owner-review principles are generalized into a common authoring core.
- ADR-0030 D8's complete-source and complete-candidate LLM review is not retained.
  Complete deterministic validation remains mandatory, while semantic review is
  performed through explicit focused dependency lenses.
- ADR-0030 D9's whole-candidate LLM re-review sequence must be replaced by a
  work-item and semantic-lens retry ceiling in a successor ADR.
- This requirement does not assign final public API, persistence, prompt,
  response-schema, or contract version names. A successor ADR must enumerate and
  preserve or supersede every existing qualified identity before implementation.

Acceptance of this requirement would authorize only the requirement baseline. It
would not accept a successor ADR, implementation, provider use, deployment,
authoring-policy activation, production migration, candidate acceptance, pointer
movement, rollback, or release.

## Common authoring model

### R1. Mode-specific frozen input

Every attempt declares exactly one mode and freezes its input identity:

- `create`: owner-provided natural source, allowed referenced material, selected
  V3 target contract, and current authoring policy;
- `revise`: exact current V3 generation, owner change request, allowed referenced
  material, selected V3 target contract, and expected current pointer; or
- `migrate`: exact V2 source generation, allowed natural-source material, selected
  V3 target contract, compatibility state, and expected current pointer.

Attempt, provider request, work item, candidate, generation, and current pointer
are distinct identities. Replay and regeneration rules must not collapse them.

### R2. Reusable schema-transition blueprint

Schema-level facts are compiled once per accepted source/target contract pair,
not rediscovered in every character request. The blueprint identifies exact-copy,
rename/move, split, changed-role, added, retired, reference, disclosure, consumer,
and semantic-dependency rules. It contains no character-specific inferred facts.

Create and V3-revise modes use the V3 identity blueprint. Migration additionally
uses the accepted V2-to-V3 transition blueprint. A blueprint change is versioned
and cannot reinterpret an existing attempt.

### R3. Server-owned baseline

The server constructs the initial candidate without an unrestricted model rewrite:

- create starts from a typed empty V3 scaffold containing only server-owned
  constants, bounded defaults, and explicit unresolved target obligations;
- revise starts from an exact clone of the immutable source V3 definition;
- migrate starts from deterministic copies and moves whose V2-to-V3 meaning is
  accepted as unchanged by the transition blueprint.

Defaults cannot invent character facts, relationships, abilities, knowledge,
disclosure rights, mechanics, or author intent.

### R4. Obligation ledger

The server maintains one typed obligation ledger as the completeness authority.
Every obligation has provenance, dependency scope, status, resolver, and receipt.

- Create obligations cover every required V3 target and every material owner-source
  claim that must be represented, intentionally omitted, or returned for review.
- Revision obligations cover the requested change, resulting semantic dependants,
  and proof that unaffected V3 meaning remains unchanged.
- Migration obligations cover every relevant V2 source disposition and every
  required V3 target. A source value cannot disappear merely because no fixed
  field map exists.

An obligation ends only as resolved, validly deferred, intentionally retired with
required preservation, owner-decision-required, or failed. Only the states allowed
for the selected consumer set may proceed to owner acceptance.

### R5. Semantic work items

Unresolved obligations are grouped by declared semantic dependency, not arbitrary
byte size or top-level field count. One work item contains only:

- the relevant owner request or source fragments;
- the current values in its target and dependency closure;
- the sliced target schema for writable fragments;
- registered source, target, reference, disclosure, and consumer constraints;
- allocated identifiers needed by that item;
- prior accepted work-item results needed for consistency; and
- exact unresolved obligations, validation errors, and review concerns in scope.

A work item must not include the complete CharacterDefinitionV3 schema, complete
character candidate, or exhaustive global path lists merely for convenience. If
its dependency closure exceeds an accepted provider/model budget, orchestration
must decompose it, route it to owner review, or fail explicitly rather than
silently enlarge the request.

### R6. Resolver-neutral execution

The orchestration selects a resolver per obligation:

- deterministic resolver for exact, rule-complete transformations;
- focused LLM resolver for bounded semantic classification, transformation, or
  source-supported/explicitly creative completion;
- owner resolver when product intent or an unsupported creative choice is needed;
- typed deferral when a non-required future capability lacks sufficient evidence.

Resolver selection does not change validation, provenance, preservation, or owner
acceptance requirements. Model output is a proposal, never schema, runtime,
disclosure, activation, or identifier authority.

### R7. Focused patch output

Every resolver produces a bounded typed patch or decision. It identifies affected
obligations, target fragments, source fragments, provenance, preservation effect,
declared semantic dependants, bounded explanation, and uncertainties. LLM output
must not contain the complete V3 character and must not write outside the work
item's registered target closure.

The server allocates stable control identifiers and resolves registered references.
A model cannot invent runtime facts, engine rules, information rights, ownership,
or undisclosed mechanics.

### R8. Apply, validate, and expand

The server applies one accepted work-item result transactionally to the in-memory
candidate and ledger, then validates its local schema, bounds, references,
disclosure, consumers, preservation, source accounting, and operation conflicts.
An invalid result does not replace previously valid fragments.

A result may declare semantic dependants. Server-known dependencies and focused
semantic-review findings can expand the closure. Only newly affected or unresolved
obligations are queued again; a local error never authorizes wholesale character
regeneration.

### R9. Focused semantic lenses

Semantic consistency is reviewed through versioned dependency lenses. Initial
lenses include at least:

- identity, background, disposition, goals, conscious guidance, and action norms;
- abilities, combat parameters, action references, loadout, and mechanical fallback;
- relationships, self-awareness, speech policy, and counterpart effects;
- appearance, public presentation support, disclosure, and consumer access; and
- cross-reference and provenance consistency.

Each lens receives only its defined projection and returns bounded findings and
affected obligations. A lens may be deterministic, LLM-assisted, or owner-reviewed.
No single LLM request is treated as an oracle for whole-character correctness.
Lens coverage and overlaps are versioned and machine-checkable.

### R10. Complete server validation

Before owner review, the assembled candidate must pass the complete strict V3
schema and every server-owned invariant, including reference existence, action
legality, compiler compatibility, disclosure ceilings, consumer access, ledger
closure, preservation integrity, source accounting where applicable, semantic-lens
completion, and absence of unresolved required values.

Complete validation processes the whole candidate but does not require sending the
whole candidate or whole schema to an LLM. A structurally valid candidate with an
unresolved required semantic obligation cannot activate.

### R11. Deferral and completeness

The active CharacterDefinitionV3 is always structurally complete. Optional meaning
not required by the selected consumer set may be represented by the existing typed
deferred collection outside active definition fields. A required active value
cannot be replaced by a sentinel, empty fabrication, or deferral.

Before a deferred capability becomes required, a new authoring attempt resolves it
and appends a new immutable generation. First read or first battle use never invokes
a provider.

### R12. Preservation

Migration preserves every changed or retired V2 value under the accepted restricted
preservation-capsule contract. Revision also preserves displaced V3 values when the
accepted retention policy requires reversibility or future remigration. Creation
has no prior canonical character value to preserve, but retains allowed frozen
source provenance and all generated/owner decisions required for review and replay.

Preservation data remains outside authoritative active character truth and every
ordinary public, battle, psyche, conscious, narration, image, and authoring consumer.

### R13. Repair and retry

Retry is scoped to failed obligations and their expanded semantic closure. It
includes the exact error, cause evidence, relevant source, prior valid target
fragments, and affected lens findings. Valid unrelated work is reused.

Provider/model budgets, maximum work-item attempts, total attempt ceilings, and
escalation policy are versioned and separately approved. Exhaustion yields a
reviewable, deferred where valid, or failed attempt; it never weakens validation or
activates a partial character.

### R14. Owner review

Owner review receives the complete assembled V3 candidate through bounded human
projections plus a semantic diff appropriate to the mode:

- create: source intent to created character facts, including creative additions;
- revise: old V3 to new V3, requested changes, semantic dependants, and unexpected
  changes;
- migrate: V2 dispositions into unchanged, moved, split, transformed, synthesized,
  retired, preserved, and deferred outcomes.

The review shows uncertainties, provenance, behavior and disclosure effects, and
unresolved owner decisions without exposing restricted data to an unauthorized
surface. Acceptance binds exact candidate and supporting receipt digests.

### R15. Public presentation and immutable activation

After the structured candidate passes validation, the existing field-safe public
projection and supported-claim description process runs. Public prose never repairs
or overrides structured truth.

Owner acceptance is followed by the existing append/CAS activation boundary. A
failed attempt, declined candidate, stale source, pointer drift, or partial batch
failure leaves the current generation unchanged. Existing battles remain bound to
their recorded generation.

## Mode-specific completion contracts

### Create

Output is one complete strict V3 candidate that represents the allowed owner source,
distinguishes source-supported derivation from creative completion, and has no
unresolved required target obligation. No prior character state is inferred.

### Revise

Output is one complete strict V3 candidate derived from an exact immutable V3
source. Requested changes and their semantic effects are explicit; unaffected
meaning is byte-identical where possible or semantically accounted where canonical
normalization changes bytes. Revision never mutates the source generation in place.

### Migrate

Output is one complete strict V3 candidate plus the required preservation and
source-disposition records. Every relevant V2 source value is accounted, and no
required V3 value is fabricated, silently dropped, or left unresolved.

## Alternatives and tradeoffs

### Separate pipelines

Three independent pipelines are locally simpler to evolve but duplicate validation,
repair, receipts, and owner-review rules and are likely to drift semantically.

### One identical operation sequence

One literal sequence is superficially uniform but erases the crucial difference
between creation intent, revision preservation, and migration source accounting.

### Common core with mode-specific adapters and obligations

This adds blueprint, ledger, work-item, and lens concepts but centralizes complete
validation and focused resolver use while preserving each mode's different proof
obligations. This is the selected candidate direction.

## Assumptions and unknowns

- Exact work-item byte/token ceilings remain a successor-ADR and provider-policy
  decision and require model-specific measurement.
- The initial semantic-lens set may need refinement, but no optional future lens may
  become an acceptance blocker without a requirement revision.
- Whether one existing migration patch schema can be generalized safely or needs a
  new qualified authoring-patch identity is unresolved.
- Exact persistence for obligation, work-item, and lens receipts remains an ADR
  decision; it must preserve ADR-0010/0014 attempt and queue authority.
- This candidate does not establish that Local Ollama or xAI meets quality, latency,
  cost, or focused-work-item budgets.

## Acceptance criteria

1. One fixture for each mode produces a complete strict V3 candidate through the
   same common orchestration and distinct mode obligations.
2. No LLM fixture receives the complete CharacterDefinitionV3 schema, complete
   candidate, or exhaustive global path lists.
3. Create proves required-target and owner-source-intent coverage without inventing
   restricted facts or rights.
4. Revision proves requested semantic change, affected-dependant handling, and
   preservation of unrelated meaning from an immutable V3 source.
5. Migration proves every relevant V2 source disposition, required V3 target
   completion, split-role handling, and exact restricted preservation.
6. Deterministic, LLM, owner, and deferred resolutions use one validation and receipt
   boundary and cannot bypass server authority.
7. Invalid focused patches preserve prior valid fragments and retry only the failed
   semantic closure.
8. Lens fixtures detect cross-field contradictions without a whole-character LLM
   request and expose uncovered obligations mechanically.
9. Complete server validation rejects structural, reference, legality, capability,
   disclosure, preservation, accounting, and required-semantic failures.
10. Owner review shows mode-appropriate complete diffs and exact acceptance binding;
    activation remains append-only CAS with no provider call.
11. Existing V2 generations, current V3 generations, old battle bindings, queued
    authoring behavior, and public projection authority remain compatible.
12. Focused live-model evaluation, provider selection, production execution,
    deployment, policy activation, and release remain separately gated.

## Out of scope

- Changing CharacterDefinitionV3 field semantics in this requirement.
- Selecting a provider, model, prompt, token budget, price ceiling, or fallback.
- Implementing UI, persistence, worker, adapter, compiler, or database changes.
- Running paid or production provider calls.
- Deploying, migrating a production character, accepting a candidate, moving a
  pointer, activating schema-3 authoring policy, rolling back, or releasing.
- Generalizing this character-specific process to battlefield or narration assets.

## Proposed independent-review input

The independent reviewer should test whether the common core preserves all accepted
lifecycle and runtime boundaries; whether mode-specific obligations are sufficient
to prove complete V3 output; whether focused semantic lenses replace rather than
silently weaken whole-candidate semantic review; whether any existing qualified
identity is accidentally reused; and whether optional optimization ideas have been
promoted into acceptance blockers.

