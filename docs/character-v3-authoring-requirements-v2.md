# Recoverable focused V3 character authoring — requirement candidate revision 2

- Status: Step 1 candidate; self-review complete; first owner review pending
- Date: 2026-09-11
- Decision owner: Product owner
- Replaces for review: `character-v3-authoring-requirements-v1.md`
- Scope: V3 character creation, V3 character revision, and V2-to-V3 character migration
- Sources: revision 1 and owner review corrections on final input/output consistency,
  automatic success, and human Q&A recovery; accepted structured-asset authoring
  workflow; ADR-0010; ADR-0011; ADR-0014; ADR-0027; ADR-0028; accepted character
  semantic migration requirement revision 6; accepted ADR-0030

## Objective

Use one recoverable V3 character-authoring process for three entry modes:

1. create a new complete strict V3 character from owner-provided natural source;
2. create a new immutable V3 revision from an existing V3 generation and an
   owner-requested change; and
3. migrate a V2-conformant character whose information is incomplete or has
   different roles under V3 into a complete strict V3 generation.

For sufficient input and available configured services, the normal outcome is
automatic production of a validated owner-review candidate. The system does not
finish semantic uncertainty as a generic rejection. It first performs bounded
automatic recovery. If required meaning remains unresolved, it produces minimal,
answerable, provenance-linked questions, persists a recoverable state, freezes the
owner answers as authoritative input addenda, and resumes the same attempt at the
affected work items.

The server owns complete assembly, validation, source/output reconciliation, and
recovery routing. Mechanical rules, focused LLM calls, or owner answers may resolve
an obligation, but they share the same typed patch, receipt, and validation boundary.
No model invocation understands, validates, or regenerates the whole character.

## Authority disposition

### Preserved authority

- ADR-0010 retains immutable generations, persisted idempotent attempts,
  compatibility, owner acceptance, append/CAS activation, and read-only battle
  binding. Provider work never runs inside activation.
- ADR-0014 retains queued authoring execution. Submit and read routes do not run
  provider work; a worker advances persisted attempts.
- ADR-0011 retains structured truth, derived public presentation, disclosure gates,
  owner confirmation, and separation from battle state. Its V2-only authoring
  details require a V3 successor ADR.
- ADR-0027 and ADR-0028 retain runtime responsibility boundaries among authored
  input, conscious judgment, reaction-only psyche, and deterministic engine rules.
- Accepted migration requirement revision 6 retains exact V2 preservation, typed
  deferral, drift handling, production manifest scope, and production authority
  gates.

### Generalized or replaced authority

- ADR-0030's migration operations, preservation, receipts, bounded repair, and
  owner-review principles are generalized into a common authoring core.
- ADR-0030 D8's complete-source and complete-candidate LLM review is replaced by
  complete server validation plus focused semantic lenses and explicit final
  input/output reconciliation.
- ADR-0030 D9's whole-candidate LLM re-review sequence is replaced by bounded
  automatic recovery, focused retry, and persistent human Q&A resumption.
- Exact public API, persistence, lifecycle status, prompt, response-schema, and
  contract identities remain successor-ADR decisions. That ADR must preserve or
  supersede every existing qualified identity explicitly.

Acceptance of this requirement authorizes only a normative requirement baseline.
It does not authorize an ADR, implementation, provider use, deployment, policy
activation, production migration, candidate acceptance, pointer movement,
rollback, or release.

## Required outcome semantics

### R1. Success-first, not validation-light

The process is designed so that cases with sufficient authoritative input normally
reach a complete validated candidate without human intervention before final owner
review. Automatic success must never be increased by dropping source meaning,
inventing unsupported values, widening disclosure, overusing deferral, relaxing
schema or semantic validation, or marking unresolved obligations complete.

When automatic completion is impossible, the process must still produce an
actionable recovery state. Semantic ambiguity and missing author intent are not by
themselves terminal character rejection.

### R2. Mode-specific frozen authority

Every attempt declares exactly one mode and freezes its authoritative input:

- `create`: owner natural source, allowed referenced material, accepted
  clarifications, selected V3 contract, and current authoring policy;
- `revise`: exact immutable V3 source, owner change request and clarifications,
  allowed referenced material, selected V3 contract, and expected pointer; or
- `migrate`: exact V2 source, accepted V2-to-V3 transition rules, allowed natural
  source and clarifications, selected V3 contract, compatibility state, and
  expected pointer.

For revision, the owner change request outranks the old V3 only inside its resolved
scope. For migration, an accepted transition may authorize an explicit semantic
change. Consistency means absence of unauthorized contradiction, not byte equality
with every historical value.

Attempt, provider request, work item, question, answer, candidate, generation, and
current pointer are distinct identities. Replay and regeneration do not collapse
them.

### R3. Reusable schema-transition blueprint

Schema facts are compiled once per accepted source/target contract pair rather than
rediscovered in every character request. The versioned blueprint identifies exact
copy, rename/move, split, changed-role, added, retired, reference, disclosure,
consumer, and semantic-dependency rules. It contains no character-specific inferred
facts and cannot reinterpret an existing attempt.

### R4. Server-owned baseline

The server creates an initial candidate without unrestricted model rewriting:

- create starts with a typed V3 scaffold containing server constants, safe bounded
  defaults, and unresolved target obligations;
- revise starts from an exact clone of the immutable V3 source;
- migrate starts from blueprint-authorized deterministic copies and moves.

Defaults cannot invent character facts, relationships, abilities, knowledge,
mechanics, disclosure rights, or owner intent.

### R5. Provenance-linked input claim ledger

The server records material input claims, constraints, requested changes,
clarifications, accepted transformations, and unresolved conflicts with exact source
provenance. Long natural source may be segmented, but every material segment must be
covered and cross-segment contradictions must remain visible.

An owner answer appends a new authority record; it never rewrites prior input. The
resolved authority order and scope are reviewable.

### R6. Obligation ledger

The server maintains one typed obligation ledger as completeness authority. Every
obligation has provenance, dependency scope, status, resolver, attempt history, and
receipt.

- Create covers every required V3 target and every material input claim that must
  be represented, intentionally omitted, or clarified.
- Revision covers the requested change, affected semantic dependants, and proof that
  unrelated V3 meaning is preserved.
- Migration covers every relevant V2 source disposition and every required V3
  target. No source value disappears because a fixed map is absent.

An obligation ends only as resolved, validly deferred, intentionally retired with
required preservation, needs owner input, technically blocked, failed due to a
recorded non-semantic system defect, or explicitly cancelled. Only resolved states
allowed for the selected consumer set may enter final owner review.

### R7. Focused semantic work items

Unresolved obligations are grouped by declared semantic dependency, not arbitrary
bytes or top-level fields. A work item includes only relevant source claims and
fragments, current target/dependency values, sliced writable schema, registered
references and constraints, required allocated IDs, relevant prior results, and
exact errors or questions in scope.

A work item must not include the complete CharacterDefinitionV3 schema, complete
candidate, or exhaustive global paths for convenience. If its closure exceeds an
accepted provider/model budget, orchestration decomposes it, asks for owner input,
or records a technical block rather than silently enlarging the request.

### R8. Resolver-neutral focused output

An obligation may use a deterministic resolver, configured focused LLM resolver,
owner answer, or valid typed deferral. Every resolver returns the same bounded typed
patch or decision with affected obligations, target/source fragments, provenance,
preservation effect, semantic dependants, explanation, and uncertainty.

LLM output never contains the complete character or writes outside its registered
closure. The server owns stable IDs, references, runtime facts, engine rules,
disclosure, ownership, validation, and activation.

### R9. Local apply and validation

The server applies one accepted work-item result transactionally to the in-memory
candidate and ledgers, then validates local schema, bounds, references, disclosure,
consumers, preservation, source accounting, and conflicts. Invalid output does not
replace prior valid fragments.

Server dependencies, model-declared dependants, and semantic findings may expand the
closure. Only affected obligations are reopened; a local failure never authorizes
whole-character regeneration.

### R10. Bounded automatic recovery cascade

Before requesting human input, orchestration exhausts applicable, configured, and
authorized automatic recovery steps without repeating an unchanged request:

1. deterministic exact or rule-complete resolution;
2. focused generation or classification for unresolved semantic work;
3. local validation and cause classification;
4. focused repair using the exact error, cause, prior valid fragments, and affected
   dependency closure;
5. decomposition of an over-broad or conflicting work item into smaller semantic
   obligations;
6. another already-configured resolver or model only when its route, budget, and
   data use are independently authorized; and
7. typed deferral only for meaning not required by the selected consumer set.

Each step must add information or change the tested alternative. Blind retries,
whole-output regeneration, and unauthorized paid/provider escalation are forbidden.

### R11. Human Q&A recovery

If required obligations remain after automatic recovery, the attempt enters a
persistent recoverable owner-input state rather than semantic rejection. Each
question is linked to exact obligations and shows:

- the unresolved claim or contradiction in owner-understandable language;
- why automatic recovery could not decide safely;
- the smallest relevant source and candidate projection;
- bounded choices and their behavioral, disclosure, or preservation effects;
- a free-form answer path when listed choices are insufficient; and
- which work resumes after the answer.

Questions are deduplicated and grouped only when one answer can resolve them
together. The system must not ask the owner to understand raw schema paths, internal
IDs, provider errors, or hidden chain-of-thought.

### R12. Answer authority and resumption

Each owner answer is append-only, provenance-linked, scoped to the question and
frozen into the same attempt as an authoritative input addendum. It is not final
candidate acceptance and does not activate anything.

The answer resolves or changes only its stated claims and obligations. The system
reopens affected dependants, rebuilds their focused work items, resumes automatic
processing, and reruns relevant lenses and final gates. Prior valid unrelated work
is reused. Multiple Q&A rounds are permitted when each round exposes a newly
distinguished missing decision; repeated equivalent questions are a defect.

### R13. Focused semantic lenses

Semantic consistency is reviewed through versioned, machine-checkable dependency
lenses covering at least:

- identity, background, disposition, goals, guidance, and action norms;
- abilities, combat parameters, action references, loadout, and fallback;
- relationships, self-awareness, speech policy, and counterpart effects;
- appearance, public presentation support, disclosure, and consumers; and
- cross-reference, provenance, and authority consistency.

Each lens receives only its projection and returns bounded findings linked to input
claims and obligations. A lens may be deterministic, LLM-assisted, or owner-reviewed.
No whole-character LLM request is a correctness oracle.

### R14. Final input/output semantic reconciliation

After assembly, each semantic lens compares the mode-specific authoritative input
claims, authorized changes, transformation records, and final V3 output projection.
It classifies every material relation as:

- preserved;
- authorized change;
- source-supported synthesis;
- explicitly creative addition;
- valid deferral;
- retired with required preservation;
- contradiction;
- source loss;
- unsupported addition; or
- unresolved.

The server aggregates lens verdicts mechanically. Contradiction, source loss,
unsupported addition, or unresolved required meaning blocks candidate-ready status
and creates focused repair or owner-question obligations. Schema validity cannot
override this gate.

### R15. Complete server validation

Before final owner review, the assembled candidate passes the complete strict V3
schema and all server invariants: references, action legality, compiler
compatibility, disclosure, consumers, ledger closure, preservation, source
accounting, lens coverage, final reconciliation, and absence of unresolved required
meaning.

The whole candidate is processed by server validation but need not be sent to an
LLM. A structurally valid but semantically unresolved candidate cannot activate.

### R16. Deferral and preservation

Active CharacterDefinitionV3 is structurally complete. Optional meaning not required
by the selected consumers may use the accepted typed deferred collection outside
active fields. Required values cannot use sentinels, fabricated empties, or defer.

Migration preserves changed or retired V2 values under the restricted capsule
contract. Revision preserves displaced V3 values when accepted retention requires
reversibility. Creation retains permitted source and decision provenance. Preserved
data is excluded from ordinary runtime, public, and authoring consumers.

### R17. Owner review and activation

Final owner review presents the complete candidate through safe projections and a
mode-specific semantic diff:

- create: input intent, created facts, and creative additions;
- revise: old/new V3, requested and consequential changes, and unexpected changes;
- migrate: every V2 disposition into preserved, moved, split, transformed,
  synthesized, retired, or deferred outcomes.

Q&A answers do not substitute for this final acceptance. Acceptance binds the exact
candidate and receipts. Public presentation generation then remains derived from
validated truth, and append/CAS activation performs no provider work. Failure,
decline, drift, or cancellation leaves the current generation unchanged.

### R18. Recoverable and terminal conditions

Semantic ambiguity, insufficient authoring detail, focused model failure, and
repair exhaustion lead to Q&A or retryable recovery, not a terminal invalid
character label.

Transient provider or infrastructure failures remain retryable from recorded state.
Integrity conflicts, unsupported schema/compiler defects, and implementation faults
enter a technical/operator recovery state. Only explicit owner cancellation,
authorized deletion, or a separately governed unrecoverable integrity/security
condition may close an attempt without a candidate. None mutates the current
generation or asserts that the character concept itself is invalid.

### R19. Automatic-completion evidence

Before rollout, a representative, owner-reviewed corpus for create, revise, and
migrate measures automatic candidate completion, automatic repair, question rate,
questions per recovered character, repeated-question defects, latency, provider
calls, token/cost use, and final semantic correctness. Cases cannot count as
automatic success if required meaning was dropped, fabricated, improperly deferred,
or left for final owner review to discover.

The numeric definition of “most cases,” corpus composition, and release threshold
require a separate owner decision backed by local and accepted live-model evidence.
This candidate does not invent those values.

## Mode-specific completion contracts

### Create

Produce one complete strict V3 candidate that represents allowed owner input,
distinguishes supported derivation from creative addition, has no unresolved
required target or source claim, and has passed final semantic reconciliation.

### Revise

Produce one complete strict V3 candidate derived from an exact immutable V3 source.
Requested changes and consequences are explicit; unrelated meaning is preserved or
accounted. The source generation is never mutated in place.

### Migrate

Produce one complete strict V3 candidate plus required preservation and source-
disposition records. Every relevant V2 value and required V3 target is accounted,
and unauthorized contradiction, silent loss, fabrication, and unresolved required
meaning are absent.

## Alternatives and tradeoffs

### Terminal failure after bounded repair

This is operationally simple but converts answerable information gaps into rejected
characters and does not meet the recovery objective.

### Automatic relaxation or broad model regeneration

This can raise apparent success rate but hides meaning loss and unsupported
invention. It is not success.

### Automatic-first focused recovery with persistent Q&A

This adds question, answer, and resumption state plus evaluation work, but preserves
strict correctness while returning answerable cases to a successful route. This is
the selected candidate direction.

## Assumptions and unknowns

- The numeric automatic-completion threshold and representative corpus are not yet
  owner-selected.
- Work-item token limits, repair count, question batching, and total attempt budgets
  remain successor-ADR/provider-policy decisions.
- Semantic-lens coverage requires empirical validation; optional future lenses do
  not become blockers without a requirement revision.
- The exact generalized patch, question, answer, lifecycle-status, and receipt
  identities are unresolved and cannot silently reuse existing names.
- Local Ollama and xAI quality, latency, cost, and recovery-rate evidence remains
  separate from this requirement candidate.

## Acceptance criteria

1. Create, revise, and migrate fixtures use one common orchestration with distinct
   frozen authority and obligation rules.
2. Sufficient-input fixtures automatically reach a complete candidate without
   human intervention before final owner acceptance.
3. Automatic-success accounting rejects dropped, fabricated, improperly deferred,
   or semantically unresolved outputs.
4. No LLM fixture receives the complete V3 schema, complete candidate, or exhaustive
   global path list.
5. Automatic recovery demonstrates cause-informed focused repair, useful
   decomposition, valid-work reuse, and no unchanged blind retry.
6. Exhausted semantic recovery creates minimal, deduplicated, owner-readable
   questions rather than a terminal character rejection.
7. Answers are append-only scoped authority, resume the same attempt, reopen only
   affected obligations, and do not imply final acceptance.
8. Repeated Q&A can progress on newly distinguished uncertainty without repeating an
   equivalent question or losing prior valid work.
9. Final reconciliation detects unauthorized contradiction, source loss,
   unsupported addition, and unresolved required meaning for all three modes.
10. Complete server validation rejects structural, reference, legality, capability,
    disclosure, preservation, accounting, coverage, and reconciliation failures.
11. Technical failures remain retryable or operator-recoverable and never mutate the
    current generation.
12. Mode-specific final diffs and exact owner acceptance precede append/CAS
    activation, which performs no provider work.
13. Existing V2/V3 generations, battle bindings, queued authoring, and public
    projection authority remain compatible.
14. Representative-corpus reporting exposes automatic completion and human recovery
    without gaming the metric.
15. Provider selection, live evaluation, deployment, production execution, policy
    activation, rollback, and release remain separately gated.

## Out of scope

- Changing CharacterDefinitionV3 field semantics.
- Selecting numeric success targets, provider/model routes, token/cost ceilings, or
  fallback policy.
- Implementing UI, persistence, worker, adapter, compiler, or database changes.
- Running paid or production calls, deploying, migrating production data, accepting
  a candidate, moving a pointer, activating policy, rolling back, or releasing.
- Generalizing this character-specific process to other asset families.

## Proposed independent-review input

The independent reviewer should test whether automatic success remains strict;
whether every answerable semantic failure reaches Q&A and can resume; whether final
input/output reconciliation distinguishes authorized change from contradiction;
whether human answers are scoped authority rather than implicit acceptance; whether
technical recovery remains separate; whether existing authority and qualified names
are preserved; and whether unselected numeric thresholds or optional future work
have been promoted into acceptance blockers.

