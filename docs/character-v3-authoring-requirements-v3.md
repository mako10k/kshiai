# Generative and recoverable V3 character authoring — requirement candidate revision 3

- Status: Step 1 candidate; self-review complete; owner review pending
- Date: 2026-09-11
- Decision owner: Product owner
- Replaces for review: `character-v3-authoring-requirements-v2.md`
- Scope: V3 character creation, V3 character revision, and V2-to-V3 migration
- Sources: revision 2; owner corrections on generative completion, contradiction
  handling, and review timing; accepted V2 compatibility requirement revision 6;
  ADR-0010, ADR-0011, ADR-0014, ADR-0027, ADR-0028, and ADR-0030

## Objective

Use one recoverable authoring process to create a complete strict V3 character from
sparse natural input, revise an immutable V3 generation, or migrate incomplete V2
information into V3. Sparse input is normal: absence ordinarily creates a generation
obligation, not a reason to stop. The process may interpret minor inconsistencies
charitably or adjust low-importance traits toward a coherent character.

The normal outcome is an automatically assembled, validated owner-review candidate.
Human Q&A is exceptional and is used only for an explicit, important, irreducible
conflict whose credible resolutions would materially change protected meaning. Review
must be early enough to prevent downstream rework and light enough not to stall
generation: cheap hard checks run continuously, semantic checkpoints occur before
meaning fans out, and only affected scopes are rechecked.

The server owns assembly, validation, reconciliation, recovery routing, stable IDs,
runtime mechanics, disclosure, and activation. No LLM request contains or regenerates
the whole character.

## Authority disposition

### Preserved authority

- ADR-0010 retains immutable generations, persisted idempotent attempts, owner
  acceptance, append/CAS activation, and read-only battle binding.
- ADR-0014 retains queued execution; submit and read routes run no provider work.
- ADR-0011 retains structured truth, derived presentation, disclosure gates, owner
  confirmation, and separation from battle state. Its V2 authoring details still
  require a V3 successor ADR.
- ADR-0027 and ADR-0028 retain the boundary among authored input, conscious judgment,
  reaction-only psyche, and deterministic engine rules.
- Accepted V2 compatibility requirement revision 6 retains exact source preservation,
  typed deferral, drift handling, production-manifest scope, and production gates.

### Generalized or replaced authority

- ADR-0030 operations, preservation, receipts, and owner-review principles become a
  common create/revise/migrate authoring core.
- ADR-0030 D8 whole-source/whole-candidate LLM review becomes server-wide validation,
  focused semantic lenses, progressive checkpoints, and final input/output
  reconciliation.
- ADR-0030 D9 whole-candidate re-review becomes affected-scope automatic recovery,
  focused retry, and exceptional persistent human Q&A.
- Exact API, persistence, status, prompt, response-schema, and receipt identities are
  successor-ADR decisions and must explicitly preserve or supersede existing names.

Acceptance establishes only the requirement baseline. It does not authorize an ADR,
implementation, provider call, evaluation, deployment, production migration,
candidate acceptance, pointer movement, rollback, or release.

## Required outcome semantics

### R1. Generative success is the default

Creation commonly begins with abbreviated owner input. Missing detail normally becomes
a typed generation obligation and is completed from protected constraints, adaptable
preferences, allowed references, and coherent creative judgment. Migration likewise
generates V3 meaning that does not exist in V2 when the selected consumer requires it.
Absence alone never causes human Q&A or a terminal invalid result.

Automatic success still requires strict structure, legal references, disclosure and
consumer safety, provenance, semantic coherence, and final owner review. It cannot be
inflated by dropping protected meaning, fabricating server-owned facts, or hiding
uncertainty.

### R2. Mode-specific frozen authority

Every attempt declares exactly one mode and freezes its authority:

- `create`: owner source, allowed references, clarifications, V3 contract, and policy;
- `revise`: immutable V3 source, requested change, clarifications, allowed references,
  V3 contract, and expected pointer; or
- `migrate`: exact V2 source, transition rules, allowed source and clarifications, V3
  contract, compatibility state, and expected pointer.

A revision request outranks old V3 only in its resolved scope. An accepted transition
may authorize migration changes. Attempt, request, work item, question, answer,
candidate, generation, and current pointer remain distinct identities.

### R3. Input importance and authority classes

The server records each material input constraint with provenance, confidence, and one
of these reviewable classes:

- **protected anchor**: explicit must/must-not constraints; identity-defining facts;
  essential relationships; essential abilities or limitations; requested revision
  scope; accepted mechanics; ownership; disclosure and consumer limits;
- **adaptable preference**: meaningful characterization that should be preserved when
  practical but may be reconciled or adjusted to maintain coherence; or
- **open creative space**: unspecified meaning the authoring process may create.

Explicit owner priority overrides inferred importance. Uncertain classification does
not itself ask the owner unless choosing the class could materially change a protected
anchor.

### R4. Reusable transition blueprint and server baseline

Versioned blueprints compile schema facts for accepted source/target pairs: copies,
moves, splits, changed roles, additions, retirement, references, disclosure, consumers,
and dependencies. They contain no character-specific inference.

Create begins from a typed V3 scaffold, revise from an exact immutable V3 clone, and
migrate from deterministic blueprint copies and moves. Server defaults may supply
constants and safe mechanics but not character identity, relationships, abilities,
knowledge, owner intent, or disclosure grants.

### R5. Claim and obligation ledgers

The server records material claims, requested changes, constraints, accepted
transformations, generated additions, adjustments, conflicts, and clarifications with
source provenance. It tracks every required V3 target and relevant source disposition
as an obligation with dependencies, resolver, attempts, status, and receipts.

Missing input ordinarily marks an obligation `generate`, not `needs_owner`. Revision
also proves unrelated protected meaning remains accounted for. Migration accounts for
every relevant V2 value; lack of a fixed mapping never silently deletes it.

### R6. Focused semantic work items

Obligations are grouped by semantic dependency. Each work item includes only relevant
claims and fragments, writable sliced schema, registered references and constraints,
allocated IDs, prior results, and exact in-scope findings. It excludes the complete V3
schema, complete candidate, and exhaustive paths. Oversized closure is decomposed or
technically blocked; it is not silently enlarged.

### R7. Resolver-neutral typed results

Deterministic logic, a focused LLM, an owner answer, or valid deferral returns the same
bounded patch or decision contract: affected obligations, source and target fragments,
provenance, preservation effect, semantic dependants, owner-facing explanation,
uncertainty, and any recorded low-importance adjustment. LLM output cannot escape its
registered closure or invent stable IDs, engine rules, runtime facts, ownership, or
disclosure rights.

### R8. Automatic generation and reconciliation

For missing open or adaptable meaning, the process generates the smallest coherent
completion and labels it `source_derived` or `model_created`. For a minor
inconsistency, it may:

1. adopt a coherent interpretation that satisfies all protected anchors;
2. select the interpretation best supported by source priority and surrounding facts;
   or
3. adjust or replace an unimportant trait so the result is coherent.

Every adjustment records the competing claims, selected interpretation, before/after
meaning, affected dependants, and bounded explanation for final review. Automatic
reconciliation may not silently override a protected anchor or create a runtime fact,
right, mechanic, ownership claim, or disclosure grant.

### R9. Transactional local apply and immediate hard validation

One result is applied transactionally to the in-memory candidate and ledgers. Before
it replaces valid fragments, the server checks sliced schema, bounds, references,
action legality, disclosure, consumers, write scope, preservation, source accounting,
and authority. Invalid output retains prior valid fragments and creates a precise
focused repair finding. These inexpensive checks run after every patch and do not wait
for a human.

### R10. Progressive semantic review

Semantic review uses four proportionate stages:

| Stage | Timing and scope | Blocking rule |
| --- | --- | --- |
| Immediate hard checks | After every patch; local structural and authority invariants | Reject only the invalid patch and start automatic recovery |
| Semantic-skeleton checkpoint | Once identity, core goals, essential abilities/limits, and key relationships exist; before dependent prose and behavior fan out | Stop fan-out only for a material protected conflict; soft findings enter automatic repair |
| Affected-cluster checkpoint | At a dependency boundary or after a material change; only changed claims and dependants | Reopen and recheck only affected obligations and lenses |
| Final reconciliation | Complete server candidate against all frozen authority before owner review | Block candidate-ready only for material unresolved defects |

Unchanged lenses and valid work are reused. A checkpoint is not added merely because
another review is possible; it must prevent a named failure path with less expected
cost than the rework it avoids.

### R11. Focused semantic lenses

Versioned lenses cover identity/background/disposition/goals/guidance; abilities,
combat parameters, actions and fallback; relationships, self-awareness, speech and
counterpart effects; appearance, public support, disclosure and consumers; and
cross-reference, provenance and authority. Each receives only its projection and
returns bounded findings linked to claims and obligations. A lens may be deterministic,
LLM-assisted, or owner-reviewed; no whole-character LLM call is a correctness oracle.

### R12. Automatic recovery cascade

Before human input, the process exhausts applicable authorized steps without repeating
an unchanged request: deterministic resolution; focused generation/classification;
cause-classified local validation; focused repair with exact errors and prior valid
fragments; decomposition; another pre-authorized resolver; and consumer-scoped typed
deferral. Each retry must add information or test a different alternative. Wholesale
regeneration, blind retry, and unapproved provider escalation are forbidden.

### R13. Exceptional human Q&A threshold

Human Q&A is entered only when all of these are true:

1. the conflict or problem is explicit rather than merely missing detail;
2. it affects a protected anchor, required correctness, or materially defining trait;
3. credible automatic resolutions would create materially different characters or
   violate different protected constraints;
4. focused automatic recovery has been exhausted; and
5. the process cannot safely choose, reconcile, or defer the result without owner
   intent.

If any condition is false, authoring continues through generation, automatic
reconciliation, repair, or valid deferral. A question shows the minimal source and
candidate projection, why automatic choice is unsafe, bounded effects of choices, a
free-form path, and the exact work resumed. It never asks for raw schema knowledge or
hidden chain-of-thought.

### R14. Answer authority and resumption

An answer is append-only, provenance-linked authority scoped to its question. It is
not final acceptance. The same attempt reopens only affected obligations, rebuilds
their focused work, reruns affected lenses, and reuses valid unrelated work. Equivalent
questions are deduplicated; a later round is permitted only for newly distinguished
material uncertainty.

### R15. Final input/output reconciliation

Each lens compares frozen input, authorized changes, recorded interpretations and
adjustments, and final output. Material relations are classified as preserved,
authorized change, source-supported synthesis, creative completion, coherent
interpretation, low-importance adjustment, valid deferral, preserved retirement,
material contradiction, source loss, unsupported material addition, or unresolved
material meaning.

The first eight outcomes are reviewable success states when their invariants hold.
Only the last four block candidate-ready and create focused repair or, when R13 is
satisfied, human questions. Schema validity alone cannot override reconciliation.

### R16. Complete server validation

Before owner review, the entire candidate passes strict V3 schema and server invariants:
references, actions, compiler compatibility, disclosure, consumers, ledger closure,
preservation, source accounting, lens coverage, final reconciliation, and absence of
material unresolved meaning. The server validates the whole candidate; the LLM need
not receive it.

### R17. Deferral and preservation

Active V3 is structurally complete. Meaning unnecessary to selected consumers may use
accepted typed deferral outside active fields. Required structure and values cannot use
sentinels or fabricated empties. Changed or retired V2 values and retention-required V3
values are preserved under restricted contracts and excluded from ordinary runtime,
public, and authoring consumers.

### R18. Final owner review and activation

Final review presents the complete safe candidate and a mode-specific semantic diff:
created facts and creative additions; requested and consequential revision changes;
or every migration disposition. It highlights protected-anchor interpretations,
automatic low-importance adjustments, uncertainties, and consequential generated
facts without flooding the owner with routine completions.

Q&A answers do not replace final acceptance. Acceptance binds the exact candidate and
receipts. Append/CAS activation performs no provider work; failure, decline, drift, or
cancellation leaves the current generation unchanged.

### R19. Recoverable and terminal conditions

Sparse input, ordinary missing detail, minor contradiction, focused model failure, and
repair exhaustion are generation or recovery states, not terminal invalid character
labels. Provider/infrastructure failures remain retryable. Integrity conflicts,
schema/compiler defects, and implementation faults enter technical recovery. Only
explicit cancellation, authorized deletion, or separately governed unrecoverable
integrity/security conditions may close without a candidate.

### R20. Evaluation and tuning evidence

A representative owner-reviewed create/revise/migrate corpus measures automatic
completion, generated-information quality, automatic reconciliation accuracy,
protected-anchor preservation, unnecessary-question rate, questions per recovery,
late-review rework, checkpoint blocking time, repeated questions, latency, calls,
tokens/cost, and final semantic correctness. Automatic success excludes hidden source
loss, protected contradiction, unsafe invention, improper deferral, or a material issue
left for final review to discover.

Numeric success thresholds, corpus composition, importance calibration, and checkpoint
budgets require separate owner decisions backed by local and accepted live-model
evidence.

## Mode-specific completion contracts

- **Create:** a complete coherent strict V3 candidate representing protected input and
  transparently distinguishing derivation, creative completion, and adjustment.
- **Revise:** a complete strict V3 candidate from an exact immutable source, with
  requested and consequential changes explicit and unrelated protected meaning
  accounted for.
- **Migrate:** a complete strict V3 candidate plus preservation and source-disposition
  records, with every relevant V2 value and required V3 target accounted for.

## Alternatives and tradeoffs

### Strict early semantic gates

They minimize the chance of downstream propagation but turn normal sparse input and
minor ambiguity into repeated blocking or questions. This is not selected.

### Review only after complete assembly

It maximizes uninterrupted generation but discovers identity, goal, ability, or
relationship conflicts after dependent content has multiplied. This is not selected.

### Progressive affected-scope review

It adds checkpoint state and importance classification, but it repairs cheap defects
immediately, checks the semantic skeleton before fan-out, and avoids rereviewing valid
unaffected work. This is selected.

## Assumptions, risks, and unknowns

- Importance classification may overprotect a preference or underprotect a defining
  trait; evaluation must measure both errors and expose classifications in review.
- Creative completion may drift toward generic characters; quality and diversity need
  corpus evidence, not larger prompts.
- Too many dependency boundaries could recreate gate accretion; the successor ADR must
  define a bounded checkpoint policy and removal/tuning evidence.
- Numeric automation targets, model routes, token/cost ceilings, retry budgets, and the
  exact API/status/receipt identities remain unresolved.
- Local Ollama and xAI quality, latency, cost, and recovery evidence remains separate.

## Acceptance criteria

1. Create, revise, and migrate use one orchestration with distinct frozen authority.
2. A sparse create fixture reaches a complete coherent candidate without pre-review
   human questions when no protected conflict exists.
3. A migration fixture generates required missing V3 meaning and labels it
   `source_derived` or `model_created`.
4. A minor contradiction fixture is coherently interpreted or changes a low-importance
   trait, recording claims, choice, before/after meaning, and dependants.
5. A protected-anchor contradiction is never silently overwritten.
6. Human Q&A occurs only when all five R13 conditions are evidenced.
7. Ordinary absence, adaptable preference conflict, and open creative choice do not
   trigger human Q&A.
8. No LLM receives the complete schema, candidate, or exhaustive path set.
9. Invalid patches retain prior valid fragments and receive cause-informed focused
   repair without blind retry.
10. Semantic-skeleton review occurs before dependent content fans out, while soft
    findings continue through automatic recovery.
11. Material changes reopen only affected obligations and lenses; unchanged valid work
    is reused.
12. Final reconciliation accepts recorded creative completion and minor adjustment but
    detects material contradiction, source loss, unsupported material addition, and
    unresolved material meaning.
13. Complete server validation covers structural, reference, action, compiler,
    disclosure, consumer, preservation, accounting, coverage, and reconciliation rules.
14. Answers are append-only scoped authority and do not imply final acceptance.
15. Evaluation reports both unnecessary early questions and late-review rework, so one
    cannot be improved by hiding the other.
16. Final owner acceptance precedes append/CAS activation, and provider, deployment,
    production, rollback, and release actions remain separately gated.

## Out of scope

- Changing V3 field semantics.
- Selecting numeric thresholds, provider routes, budgets, or production policy.
- Implementing UI, persistence, workers, adapters, compiler, or database changes.
- Running paid/production calls, deploying, migrating production data, accepting a
  candidate, moving a pointer, activating policy, rolling back, or releasing.
- Generalizing beyond character assets.

## Proposed independent-review input

Review whether sparse input reliably enters generation rather than owner questioning;
whether importance classes protect defining meaning without freezing adaptable traits;
whether minor contradictions are transparently reconciled; whether R13 makes human
Q&A genuinely exceptional; whether the semantic-skeleton checkpoint prevents fan-out
without becoming a strict early gate; whether affected-scope rechecks and final
reconciliation preserve correctness; and whether unselected numeric or implementation
choices remain outside acceptance.
