# Generative and recoverable V3 character authoring — requirement candidate revision 4

- Status: Step 1 candidate; self-review complete; owner review pending
- Date: 2026-09-11
- Decision owner: Product owner
- Replaces for review: `character-v3-authoring-requirements-v3.md`
- Scope: V3 character creation, V3 character revision, and V2-to-V3 migration
- Sources: pending character revision 3; accepted structured semantic authoring foundation
  revision 2 and its owner acceptance record; owner clarification on source-based retry
  and migrator-only preservation access; accepted V2 compatibility requirement revision 6;
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

## Inherited foundation and review boundary

This character requirement adopts F1-F14 of the accepted
[structured semantic authoring foundation revision 2](structured-semantic-authoring-foundation-requirements-v2.md),
exact SHA-256 df4536be8bed752c81164687112041286ebfefc7869fb80e6952f5839e0b556a.
Its [acceptance record](structured-semantic-authoring-foundation-requirements-v2-acceptance.md)
establishes authority independently of the candidate's historical header.

The foundation owns common lifecycle, work-item/tool exposure, proposal application,
recovery, reconciliation, and activation contracts. This document adds the character
adapter's meaning protections, semantic checkpoints, lenses, V3 completion conditions,
and evaluation requirements. References incorporate the named foundation clauses;
they do not introduce a second implementation or weaken those clauses.

Revision 3 was a pending candidate. This revision replaces it for review and explicitly
replaces its same-attempt-only continuation and nonterminal technical-failure rules.
Live work reuses valid fragments; after failure, a new attempt may reconstruct all
focused work from source. Intermediate candidate/context/checkpoint persistence is
not mandatory. Existing immutable generations, attempt identities, question/answer
authority, and required provider/failure receipts remain distinct.

The review scope is this complete revision 4 and its difference from revision 3.
The already accepted foundation is a fixed dependency, not reopened for acceptance.
Any future conflict with it requires an explicit authority decision.

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

- The accepted foundation revision 2 specific prior-contract disposition governs
  revision 6 R9/R11/R14 and ADR-0030 D5/D7/D8/D9/D10. Character synthesis is already
  permitted; preserve its provenance, source, disclosure, and runtime limits.
- ADR-0030 operations, preservation, receipts, and owner-review principles are adopted
  through the common foundation, with character-specific constraints below.
- ADR-0030 D8 whole-source/whole-candidate LLM review becomes server-wide validation,
  focused semantic lenses, progressive checkpoints, and final input/output
  reconciliation.
- ADR-0030 D9 whole-candidate re-review becomes affected-scope automatic recovery,
  focused retry, and exceptional persistent human Q&A.
- Existing ADR-0030 ceilings of two repair rounds and six requests remain in force
  for current execution until explicitly replaced by an accepted successor ADR.
  Foundation adoption does not immediately change current implementation or policy.
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

### R5. Claim and obligation accounting

Inherit foundation F3. The character adapter accounts for every required V3 target,
relevant V2 source disposition, material characterization, and requested revision.
Unrelated protected meaning remains accounted for during revision. Absence normally
creates a generation obligation; lack of a direct mapping never silently deletes
source meaning.

### R6. Focused semantic work items

Obligations are grouped by semantic dependency. Each work item includes only relevant
claims and fragments, writable sliced schema, registered references and constraints,
allocated IDs, prior results, and exact in-scope findings. It excludes the complete V3
schema, complete candidate, and exhaustive paths. Oversized closure is decomposed or
technically blocked; it is not silently enlarged.

### R7. Resolver-neutral typed results

Inherit foundation F5. Character proposals include recorded low-importance adjustments
and affected semantic dependants. They cannot invent stable IDs, engine rules, runtime
facts, ownership, or disclosure rights, or escape the server-registered write closure.

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

Inherit foundation F6. Character hard checks include action legality, registered
references, consumer/disclosure policy, source accounting, and V3 fragment validity.
Repair scope may include schema-valid character fields that must change for semantic
consistency. During live repair, invalid proposals retain prior valid fragments.

### R10. Progressive semantic review

Semantic review uses four proportionate stages:

| Stage | Timing and scope | Blocking rule |
| --- | --- | --- |
| Immediate hard checks | After every patch; local structural and authority invariants | Reject only the invalid patch and start automatic recovery |
| Semantic-skeleton checkpoint | Once identity, core goals, essential abilities/limits, and key relationships exist; before dependent prose and behavior fan out | Stop fan-out only for a material protected conflict; soft findings enter automatic repair |
| Affected-cluster checkpoint | At a dependency boundary or after a material change; only changed claims and dependants | Reopen and recheck only affected obligations and lenses |
| Final reconciliation | Complete server candidate against all frozen authority before owner review | Block candidate-ready only for material unresolved defects |

In live execution, unchanged lenses and valid work are reused. New-attempt
reconstruction follows R12/R14 and may repeat focused work. A checkpoint is not added merely because
another review is possible; it must prevent a named failure path with less expected
cost than the rework it avoids.

### R11. Focused semantic lenses

Versioned lenses cover identity/background/disposition/goals/guidance; abilities,
combat parameters, actions and fallback; relationships, self-awareness, speech and
counterpart effects; appearance, public support, disclosure and consumers; and
cross-reference, provenance and authority. Each receives only its projection and
returns bounded findings linked to claims and obligations. A lens may be deterministic,
LLM-assisted, or owner-reviewed; no whole-character LLM call is a correctness oracle.

### R12. Automatic recovery and source-based retry

Inherit foundation F9, including its failed-attempt and new-attempt distinction.
Character repair uses exact errors, cause information, relevant source, valid
fragments still available in the live attempt, and registered semantic dependants.
When a new retry is explicitly requested after failure, reconstruct focused work from
retained source, failure information, and applicable clarifications; recheck source
and current-pointer drift. Reuse of lost intermediate state is not required.

Reconstruction may recompute completed work using focused calls. It does not permit
sending the complete character or schema to an LLM. Infrastructure recovery can
justify retry after conditions change; repeating invalid output requires added
information, narrower work, or a different authorized alternative. Existing budgets
apply and do not reset into unbounded automatic paid retries.

### R13. Exceptional human Q&A threshold

Human Q&A is entered only when all of these are true:

1. the conflict or problem is explicit rather than merely missing detail;
2. it affects a protected anchor, required correctness, or materially defining trait;
3. credible automatic resolutions would create materially different characters or
   violate different protected constraints;
4. focused automatic recovery has been exhausted; and
5. the process cannot safely choose, reconcile, or defer the result without owner
   intent.

If any condition is false, do not ask a semantic owner question. Continue through
generation, reconciliation, repair, or valid deferral while execution remains viable.
A technical failure may end the attempt under R19 and remain eligible for R12 retry. A question shows the minimal source and
candidate projection, why automatic choice is unsafe, bounded effects of choices, a
free-form path, and the exact work resumed. It never asks for raw schema knowledge or
hidden chain-of-thought.

### R14. Answer authority and return to automatic processing

Inherit foundation F10. An answer is append-only, provenance-linked authority scoped
to its question, not final acceptance. If live state is available, reopen affected
obligations and lenses and reuse unrelated valid work. Otherwise, a new attempt may
reconstruct focused work from source and the recorded answer. Intermediate candidate,
context, and checkpoint persistence is not mandatory.

Equivalent questions are deduplicated using applicable recorded answers. Ask again
only for newly distinguished material uncertainty; source-based reconstruction alone
does not invalidate a previously applicable answer.

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
material unresolved meaning. Inherit foundation F11: the server validates the whole
candidate, and no LLM receives the complete candidate or schema.

### R17. Deferral and preservation

Active V3 is structurally complete. Meaning unnecessary to selected consumers may use
accepted typed deferral outside active fields. Required structure and values cannot use
sentinels or fabricated empties. Changed or retired V2 values and retention-required V3
values are preserved under restricted contracts and excluded from ordinary runtime,
public, and authoring consumers. Inherit foundation F12: only an authorized migrator
during migration may read the preservation area, including that migration's own
validation. No independent review-reader permission is added. Preserve ADR-0030 D5's
character-capsule 256 KiB bound, retention with referenced generations, and existing
owner data lifecycle.

### R18. Final owner review and activation

Final review presents the complete safe candidate and a mode-specific semantic diff:
created facts and creative additions; requested and consequential revision changes;
or every migration disposition. It highlights protected-anchor interpretations,
automatic low-importance adjustments, uncertainties, and consequential generated
facts without flooding the owner with routine completions.

Q&A answers do not replace final acceptance. Acceptance binds the exact candidate and
receipts. Append/CAS activation performs no provider work; failure, decline, drift, or
cancellation leaves the current generation unchanged.

### R19. Failed attempts and retry eligibility

Inherit foundation F9/F11. Missing information and minor contradictions normally
enter generation and automatic reconciliation, not semantic rejection of the
character. Provider/infrastructure failure, invalid results, or exhausted authorized
execution budgets may end an attempt as failed.

Retain source, source identity, failure reason, and required request receipts.
A failed attempt leaves the current generation unchanged and permits an explicitly
requested new source-based attempt under R12, once applicable technical conditions
allow it. Intermediate migration context and checkpoint persistence are not required.
Failure, cancellation, deletion, semantic owner questions, and final owner acceptance
remain distinct outcomes; an attempt failure is not proof that the character is
intrinsically invalid.

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
- New-foundation numeric targets, model routes, budgets and exact API/status/receipt
  identities remain successor decisions; existing accepted ceilings still apply.
- Reconstructing after failure reduces persistence requirements but may repeat provider
  work and increase latency/cost. Retained applicable answers avoid repeated questions.
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
11. During live execution, material changes reopen affected obligations and lenses,
    reusing valid work. After failure, source-based reconstruction may recompute work.
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

17. A provider failure or exhausted budget can end the attempt as failed with retained
    source identity and failure information; a new source-based retry is possible
    without mandatory intermediate context or checkpoint persistence.
18. A recorded Q&A answer returns automatic processing through live continuation or
    source reconstruction and is not invalidated solely by restarting.
19. Preservation-area reads are limited to migrators during migration; character
    capsule access, size, retention, and lifecycle restrictions remain applicable.

## Out of scope

- Changing V3 field semantics.
- Selecting numeric thresholds, provider routes, budgets, or production policy.
- Implementing UI, persistence, workers, adapters, compiler, or database changes.
- Running paid/production calls, deploying, migrating production data, accepting a
  candidate, moving a pointer, activating policy, rolling back, or releasing.
- Changing the accepted common foundation or defining other asset-family adapters.

## Revision 3 disposition and self-review

Revision 3 remains an immutable historical candidate. This table accounts for every
R1-R20 section; unchanged character constraints retain their text except the stated
foundation references and retry qualifications.

| Revision 3 scope | Revision 4 disposition |
| --- | --- |
| R1-R4 | Preserve generative default, mode authority, character importance, blueprint and baseline rules; inherit foundation F1/F2. |
| R5 | Reference foundation F3 and retain complete character source/target accounting. |
| R6-R7 | Preserve focused inputs and character restrictions; inherit F4/F5, including scoped capability exposure. |
| R8-R9 | Preserve character reconciliation choices; reference F6 for patch application and explicitly permit necessary valid-field changes. |
| R10-R11 | Preserve skeleton timing and all character semantic lenses; qualify reuse as live-execution behavior. |
| R12-R14 | Adopt foundation F9/F10 source-based retries; permit technical failure without semantic Q&A; retain scoped answers and question deduplication. |
| R15-R16 | Preserve final reconciliation categories and full V3 validation; explicitly prohibit complete LLM inputs. |
| R17-R18 | Preserve typed deferral, semantic owner diff and activation; apply migration-only capsule reads and inherited D5 restrictions. |
| R19 | Replace nonterminal-only technical recovery with failed attempts and explicit new-attempt retries. |
| R20 | Preserve character quality and review-cost measures; distinguish future budgets from currently accepted ceilings. |
| Mode completion and acceptance criteria | Preserve all three mode outcomes; qualify criterion11 for live versus reconstructed work and add retry/access checks17-19. |

Self-review: all R1-R20 scopes and previous acceptance criteria have a disposition.
No V3 field semantics, psyche/conscious/engine responsibilities, source accounting,
or generation/revision/migration completion outcome is changed by this alignment.
The English source and full Japanese translation cover the same revision.
Independent review and owner acceptance remain pending.

Alternatives for recovery are durable checkpoint continuation versus rebuilding a
new attempt from source. The owner selected that checkpoint persistence is not
mandatory. Source reconstruction reduces storage/restoration work but may repeat
paid computation. No new numeric budget or provider route is selected.

## Proposed independent-review input

Review the complete revision4 against the fixed accepted foundation revision2.
Verify that source-based retry and migrator-only preservation replace every relevant
revision3 clause without losing character-specific outcomes. Then review whether
sparse input reliably enters generation rather than owner questioning;
whether importance classes protect defining meaning without freezing adaptable traits;
whether minor contradictions are transparently reconciled; whether R13 makes human
Q&A genuinely exceptional; whether the semantic-skeleton checkpoint prevents fan-out
without becoming a strict early gate; whether affected-scope rechecks and final
reconciliation preserve correctness; and whether unselected numeric or implementation
choices remain outside acceptance.
