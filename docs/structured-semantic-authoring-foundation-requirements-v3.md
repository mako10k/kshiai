# Structured semantic authoring foundation — requirement candidate revision 3

- Status: Step 1 candidate; self-review complete; owner review pending
- Date: 2026-09-11
- Replaces on acceptance: accepted foundation requirement revision 2 (see its acceptance record).
- Revision basis: owner-authorized mechanical safeguards for automated execution.
- Baseline: docs/structured-semantic-authoring-foundation-requirements-v2-acceptance.md
- Decision owner: Product owner
- Scope: reusable authoring for structured selectable assets
- Initial conformance families: character, battlefield preset, narration style
- First advanced consumer: V3 character create, revise, and migrate
- Sources: accepted structured selectable-asset workflow; accepted structured-asset
  envelope and projection decisions; character V3 authoring requirement candidate
  revision 4 (pending); owner direction to establish a reusable foundation

## Objective

Provide one reusable process that can:

1. create structurally complete data from sparse natural-language or structured input;
2. project existing structured data into another structure while preserving material
   meaning; and
3. prove that the result is structurally valid and not materially inconsistent with
   frozen input, authorized changes, or protected domain meaning.

The normal outcome is an automatically recovered, validated candidate ready for owner
review. Missing information normally creates a generation obligation. Minor adaptable
inconsistencies may be coherently interpreted or adjusted. Human Q&A is reserved for
explicit, material, irreducible conflicts whose credible resolutions would change
protected meaning.

The foundation owns process and evidence mechanics. It does not own character,
battlefield, narration-style, battle-engine, disclosure, or other domain semantics.
Those remain in versioned domain adapters and accepted domain requirements.

## Authority disposition

### Preserved authority

- Structured definitions remain authoritative over generated descriptions for runtime
  behavior.
- Natural-language source remains private authoring provenance and does not itself
  grant disclosure or runtime authority.
- Immutable generations, idempotent attempts, owner acceptance, append/CAS activation,
  and battle binding to an exact generation remain unchanged.
- Provider work remains outside submit/read/commit transactions and cannot occur during
  battle selection or battle creation.
- Disclosure ceilings, audience policy, consumer projections, runtime knowledge, and
  domain compiler rules remain server-enforced.
- Each asset family still requires its own accepted schema and domain behavior.

### Authority replaced on acceptance

The accepted structured selectable-asset workflow currently says that an upgrade
converter must not invent facts absent from its source. This blanket prohibition is
replaced by a classified synthesis rule:

- a `protected_anchor` must be preserved unless an explicit authorized change applies;
- an `adaptable_preference` should be preserved when practical but may be interpreted
  or adjusted to produce a coherent result;
- `open_creative_space` may be completed with generated meaning; and
- server-owned facts, mechanics, identifiers, ownership, permissions, disclosure
  grants, and runtime observations may never be invented by an LLM.

Every generated or adjusted material claim records provenance and its relationship to
the frozen source. A domain adapter may narrow generation further, but it may not widen
authority reserved to the server or silently override a protected anchor.

This candidate does not become authority until owner acceptance. Acceptance authorizes
only the requirement baseline; it does not authorize an ADR, implementation, provider
call, evaluation, deployment, data migration, candidate activation, or release.

### Specific prior-contract disposition

The legacy workflow's no-invention wording is not the complete current character
authority: accepted character V2 compatibility requirement revision 6 R11 and
ADR-0030 D7 already permit provenance-tracked synthesis. Preserve that permission
and its source-preservation, disclosure, and runtime-authority limits.

For consumers adopting this foundation after the required successor ADR is accepted:

- Revision 6 R14 and ADR-0030 D8/D9: replace complete-candidate LLM review and
  re-review with focused semantic lenses and complete server reconciliation. Preserve
  structural validation and repair closure covering structural dependencies,
  model-proposed semantic dependants, and review findings.
- ADR-0030 D9: its current two-repair/six-request ceiling remains effective for the
  existing implementation. New-foundation budgets require successor-ADR decisions;
  this candidate does not raise existing execution ceilings.
- Revision 6 R9 and ADR-0030 D10: preserve frozen inputs, distinct request accounting,
  failure receipts, unchanged current generations, and idempotent completed attempts.
  Retryability may be fulfilled by a new explicitly requested attempt reconstructed
  from source; it does not require continued execution of the failed attempt.
- ADR-0030 D5: preserve character-capsule access limited to registered migrators during
  migration, its 256 KiB bound, retention with referenced generations, and existing
  owner data lifecycle. Generic policy delegation does not replace these rules.
- ADR-0010/0014: preserve immutable generations, owner activation, queued execution
  where already adopted, and existing-attempt identity and replay behavior. Exact
  API additions needed to request retry or answer Q&A remain successor-design work.

The pending character V3 authoring candidate revision 4 already aligns source-based
retry and migration-only preservation reads with accepted foundation revision 2.
It still references that exact baseline and does not inherit this candidate automatically.
After foundation revision 3 acceptance, a separately reviewed character successor must
align the dependency and domain progress contract. No historical document or accepted
ADR is rewritten here.

### Changes from accepted foundation revision 2

F15 adds mechanically enforced resource limits, bounded stagnation/cycle detection,
trusted-state integrity checks, and failure handling. F2 adds domain-owned progress
signals; F9 makes recovery subordinate to F15; conformance and acceptance criteria
add operational safety cases. Sparse generation, focused semantic repair, exceptional
human Q&A, source-based retry, preservation access, and compatibility remain unchanged.
This is a requirement-document revision, not a new external product version.

## Required foundation behavior

### F1. Three operation modes

The foundation supports `create`, `revise`, and `migrate` as distinct modes under one
orchestration model.

- `create` freezes sparse source, allowed references, clarifications, target contract,
  and policy.
- `revise` also freezes an immutable source generation, requested change scope, and
  expected current pointer.
- `migrate` freezes exact source data, the accepted source-to-target transition,
  compatibility state, and expected current pointer.

Attempt, work item, question, answer, candidate, immutable generation, and current
pointer remain separate identities.

### F2. Domain-owned semantic policy

Each domain adapter supplies versioned contracts for:

- source and target schemas and focused schema slices;
- dependency closure and legal write scope;
- protected anchors, adaptable preferences, and open creative space;
- accepted copies, moves, splits, synthesis, retirement, and deferral;
- identifiers, deterministic defaults, references, and compiler invariants;
- semantic equivalence, contradiction materiality, and reconciliation lenses;
- disclosure, consumer projections, and owner-facing review projections;
- phase-aware progress indicators, relevant state equivalence, and valid temporary
  regressions for F15 monitoring. The foundation enforces the monitoring mechanism;
  adapters define the domain meaning of these signals.

The foundation must not contain asset-family field paths or infer domain correctness
without such a contract.

### F3. Claim and obligation accounting

The server records material source claims, requested changes, constraints,
clarifications, accepted transformations, generated additions, adjustments, conflicts,
and preservation records with provenance. It tracks every required target and relevant
source disposition as an obligation with dependencies, resolver, attempts, status, and
receipts.

Absence ordinarily produces `generate`, not `needs_owner`. Migration never silently
drops a relevant source value merely because no direct target field exists.

### F4. Focused work and capability exposure

Work is divided by semantic dependency. A work item contains only the relevant source
claims and fragments, writable target fragments and sliced schema, registered
references, constraints, allocated identifiers, prior valid results, and current
findings. It excludes the complete schema, complete candidate, and exhaustive path set.

A stable capability registry describes available operations. The selected Skill or
orchestrator exposes only the request-scoped query, proposal, validation, and review
tools needed for the current work item. Tool visibility never grants data access or
write authority; server authorization is checked independently.

### F5. Resolver-neutral bounded results

Deterministic logic, a focused LLM, an owner answer, or accepted deferral returns a
common bounded proposal or decision contract. It identifies affected obligations,
source and target fragments, provenance, semantic dependants, preservation effect,
uncertainty, and an owner-facing explanation.

An LLM proposes changes only. It cannot directly persist authoritative data, allocate
stable identifiers, change policy, or write outside the registered dependency closure.

### F6. Transactional patch application

The server applies one proposal transactionally to an in-memory candidate and its
ledgers. A minimal patch is preferred, but its legal scope includes schema-valid fields
that must change to restore semantic consistency with the repaired area.

Before replacing valid fragments, the server checks schema, bounds, references,
domain invariants, authority, disclosure, consumer safety, write scope, preservation,
and source accounting. An invalid proposal leaves prior valid fragments intact and
creates a precise repair finding.

### F7. Progressive structural and semantic validation

Validation is proportionate and progressive:

1. immediate hard checks after every patch;
2. a semantic-skeleton checkpoint before meaning fans out into dependent content;
3. affected-cluster checks after material dependency changes; and
4. complete final reconciliation before owner review.

Unchanged valid work is reused. A checkpoint is added only when it prevents a named
failure path with lower expected cost than the rework it avoids. Whole-object LLM
review is never the sole correctness oracle.

### F8. Input/output reconciliation

The final result is compared with frozen input, authorized changes, recorded
interpretations, generated additions, adjustments, retirements, and deferrals.
Material relationships are classified at least as:

- preserved;
- authorized change;
- source-supported synthesis;
- creative completion;
- coherent interpretation;
- low-importance adjustment;
- valid deferral or preserved retirement;
- material contradiction;
- source loss;
- unsupported material addition; or
- unresolved material meaning.

Schema validity cannot override a failed semantic reconciliation. The first seven
classes may be reviewable success states when domain invariants hold. The last four
require focused repair or, when F10 is satisfied, human Q&A.

### F9. Information-gaining automatic recovery

Before asking a human, the foundation exhausts applicable authorized recovery without
repeating an unchanged request: deterministic resolution, focused generation or
classification, cause-classified validation, focused repair with exact errors and
prior valid fragments, decomposition, another pre-authorized resolver, and
consumer-scoped typed deferral.

Every retry must add information, narrow the problem, or test a materially different
alternative. Blind retry, wholesale regeneration, and unapproved provider escalation
are forbidden.

A provider outage, invalid result, or exhausted authorized execution budget may end
an attempt as failed. Retain the source, its identity, and the failure reason.
An explicit retry creates a new attempt, rechecks source/current-pointer drift,
and reconstructs context from retained source and applicable authorized input,
including relevant clarifications and failure information. It must not reinterpret a
completed-attempt replay as a fresh provider execution.

Persisting intermediate candidates, migration context, or checkpoint positions is
not required. A retry may recompute completed work using the same focused work-item
flow, with the resulting token and cost tradeoff. This source-based reconstruction
is permitted; asking an LLM to regenerate the whole object remains prohibited.
Infrastructure recovery can justify repeating a request after conditions
change; repeated invalid output requires the informative repair described above.
Budget exhaustion does not itself authorize further paid execution.
All automatic recovery remains within F15 limits; exhausting applicable recovery does
not require enumerating alternatives after a hard stop. Technical safety failure alone
does not satisfy F10 or force a semantic question to the owner.

### F10. Exceptional human Q&A

Human Q&A occurs only when all of the following hold:

1. an explicit problem exists rather than mere missing detail;
2. it affects a protected anchor, required correctness, or materially defining trait;
3. credible automatic resolutions have materially different protected outcomes;
4. focused automatic recovery has been exhausted; and
5. the result cannot be safely chosen, reconciled, or deferred without owner intent.

A question presents the minimum relevant source and candidate projection, why an
automatic choice is unsafe, bounded effects of the credible choices, a free-form
answer path, and the exact work that will resume. An answer is append-only scoped
authority, not final candidate acceptance. The answer returns work to automatic
processing, either in the live attempt or in a new attempt reconstructed from source
and the recorded answer. Durable intermediate execution context is not required.

### F11. Server-controlled completion and activation

Before owner review, the complete candidate passes its strict target schema and all
registered domain, reference, compiler, disclosure, consumer, preservation,
accounting, coverage, and reconciliation checks. The server validates the whole
candidate without sending the whole candidate or schema to an LLM.

Owner acceptance binds the exact candidate and receipts. Append/CAS activation
performs no provider work. Failure, decline, pointer drift, cancellation, or exhausted
technical recovery leaves the current immutable generation unchanged.

### F12. Preservation outside active semantics

Changed, retired, or currently unused source meaning that must be retained is stored
under a restricted, versioned preservation contract. Only an authorized migrator
during migration may read it, including when that migration performs its own
validation. There is no separate review-reader permission. Ordinary runtime, public,
compiler, and authoring consumers cannot read the preservation area.

Retention, deletion, access, and disclosure rules remain domain and policy decisions;
the foundation does not convert preservation into indefinite retention authority.

### F13. Compatibility-first adoption

Initial adoption preserves existing public APIs, immutable generation identities,
authoring attempt identities, current-pointer behavior, battle bindings, and the
accepted common envelope unless a successor ADR explicitly versions or supersedes
them. The initial change is an internal orchestration and evidence abstraction, not a
new externally visible product version.

Character, battlefield preset, and narration style are conformance families. V3
character authoring is the first advanced consumer. Battle-runtime narration is
outside the initial lifecycle, although separately designed semantic-claim and
provenance primitives may later be reused.

### F14. Evidence and tuning

A representative, owner-reviewed corpus measures:

- automatic candidate completion;
- protected-anchor preservation;
- generated-information quality and semantic consistency;
- unresolved material contradiction and source-loss rates;
- unnecessary human-question rate and questions per recovery;
- recovery convergence and repeated-request rate;
- late-review rework and checkpoint blocking time; and
- provider calls, tokens, latency, and cost.

Existing accepted execution ceilings continue to apply until explicitly superseded.
New-foundation numeric gates, corpus composition, model/provider routes, retry budgets, token and cost
ceilings, and checkpoint budgets require separately reviewed evidence and decisions.
They are not invented by this requirement candidate.

### F15. Mechanical execution safety

The server, not the LLM orchestrator, enforces the following safeguards for every
automated attempt, including deterministic work, LLM planning, tools, review, and repair.

1. **Finite resource ceilings.** Enforce finite limits for LLM calls, tool/work steps,
   execution time, and token/cost consumption. Check the available budget before
   scheduling work and bound individual requests and results so one call cannot
   bypass the attempt limit. When exact usage is not known in advance, use a
   conservative admissible bound rather than treating unknown usage as zero.
   Decomposition, nested review, resolver changes, repair, and phase transitions
   share cumulative attempt accounting and cannot reset it. No new work may be
   scheduled when the required budget is unavailable.
2. **Bounded progress monitoring.** Detect sustained lack of relevant progress and
   repeated or alternating relevant states over a bounded observation window.
   Use server-observed obligations, validation findings, applied changes, and
   adapter-defined phase-aware progress/state-equivalence signals, not LLM
   self-assessment alone. More generated text or more tool calls is not progress.
   Valid investigation and dependency repair may temporarily increase findings;
   neither every-step improvement nor a single universal semantic score is required.
   A detected stall or cycle triggers a bounded, information-gaining F9 recovery
   change within the same ceilings. If it cannot restore progress within the
   permitted window/budget, fail the attempt instead of looping.
3. **Trusted-state consistency.** Check coherence between the candidate, obligation
   and provenance ledgers, references, and legal workflow transitions at mutation
   boundaries and before completion. This does not require an intermediate candidate
   to satisfy the complete target schema. An invalid external proposal is rejected
   transactionally under F6 and can be repaired. In contrast, an inconsistent trusted
   candidate/ledger or illegal internal transition that makes further execution
   untrustworthy stops the attempt; do not ask the LLM to repair corrupt control state.
4. **Safe stop and retry.** A hard limit, unresolved bounded stall/cycle, or untrusted
   internal state ends further automated execution for that attempt. Do not schedule
   further provider work or apply late results after the terminal failure; bound
   outstanding work and cancel it where supported. Keep the current immutable
   generation unchanged. Retain a compact failure receipt identifying the stop
   category, consumed budget, relevant progress/invariant evidence, and source
   identity sufficient for F9 explicit new-attempt retry. Do not automatically start
   a new attempt to evade a stop. Technical failure is not automatic human semantic
   Q&A; F10 still governs that route.

Counters, bounded progress history, and intermediate candidate state may remain
in memory during execution. Full conversation, intermediate migration context, and
checkpoint persistence are not required. A restart must not silently resume the same
attempt with reset counters; source-based retry follows F9 with a new explicit request.

These safeguards constrain runaway execution, not sparse input or permitted synthesis.
They do not prove semantic correctness or replace F7/F8/F11 validation. Numerical
ceilings, observation windows, phase rules, accounting/cancellation details, and
detection algorithms require successor design and representative tests before
runtime adoption; leaving their exact values undecided does not permit unbounded
execution. Existing accepted ceilings remain effective until explicitly superseded.

## Initial conformance contract

The common kernel must demonstrate the same lifecycle contract against character,
battlefield-preset, and narration-style adapters without embedding family-specific
paths. Conformance fixtures must cover at least:

1. sparse creation with safe generated completion;
2. meaning-preserving revision with consequential dependent changes;
3. source-to-target migration with generated target meaning and source disposition;
4. structural failure followed by a focused repair that retains prior valid work;
5. a minor contradiction resolved without human input;
6. a protected contradiction that cannot be silently overwritten;
7. final structural validation and input/output semantic reconciliation;
8. restricted preserved data excluded from ordinary consumers; and
9. unchanged public API and immutable-generation behavior during internal adoption;
10. attempt ceilings remain cumulative across decomposition, review, and repair;
11. no-progress repetition and A/B state oscillation lead to bounded recovery or failure;
12. useful multi-step repair with temporary regression is not mistaken for a mandatory
    every-step improvement requirement;
13. invalid proposals retain trusted state, while internal inconsistency stops execution;
14. timeout/budget exhaustion stops scheduling and prevents late-result application; and
15. failure receipts support explicit source-based retry without mandatory checkpoints
    or automatic budget-reset attempts.

Passing generic conformance does not prove a domain adapter correct. Each family also
requires its own domain fixtures and accepted schema/behavior authority.

## Alternatives and tradeoffs

### Keep every family-specific workflow

This minimizes immediate abstraction work but preserves duplicated recovery,
provenance, patch, review, and Q&A behavior. It is not selected.

### Build one universal semantic transformation engine

This maximizes nominal reuse but would move domain meaning into a generic language,
hide asset-specific correctness, and expand the current delivery scope. It is not
selected.

### Thin foundation with domain adapters

This adds explicit adapter and conformance contracts but reuses stable process
mechanics while leaving semantic authority in each domain. It is selected.

### Mechanical safety alternatives

Prompt-only warnings impose little machinery but cannot enforce finite execution.
Hard ceilings alone bound exposure but can spend the entire budget on detectable
cycles. Per-step monotonic progress gates reject legitimate dependency repair.
The selected bounded-window approach adds small in-memory accounting and adapter
signal contracts; false-positive and false-negative detection remains a tuning risk.
A persistent checkpoint engine is not required for these safeguards.

## Risks and unknowns

- Existing services may differ in ways not represented by the current shared envelope;
  extraction must preserve those differences rather than force false uniformity.
- Importance classification and semantic lenses may under-protect defining meaning or
  over-protect adaptable material; domain evaluation must measure both errors.
- Excess capability promotion or checkpoints could recreate prompt and control bloat;
  successor design must define bounded exposure and removal conditions.
- Preservation storage can create privacy and retention risk; exact retention and
  access policy remains unresolved.
- Numeric quality thresholds and provider-specific behavior remain unresolved pending
  baseline evidence.
- Progress signals can miss cycles or stop useful exploration; representative tests
  must cover both. Hard ceilings remain independent of detector accuracy.
- A provider may finish or charge for an already dispatched request after cancellation;
  request bounds and conservative accounting must constrain exposure, without claiming
  that cancellation guarantees zero further provider cost.

## Acceptance criteria

1. The accepted no-invention upgrade rule is explicitly replaced by classified,
   provenance-tracked synthesis without permitting invention of protected or
   server-owned facts.
2. The foundation owns process/evidence mechanics, while domain adapters own schemas,
   semantic policy, invariants, and projections.
3. Create, revise, and migrate use one lifecycle with distinct frozen authority.
4. Sparse input normally enters generation rather than human Q&A.
5. LLM work is focused and receives neither the complete schema nor complete candidate.
6. LLMs produce bounded proposals and cannot directly persist authoritative state.
7. A repair may update valid fields required for semantic consistency but cannot escape
   its registered dependency closure.
8. Structural validation and final input/output semantic reconciliation are both
   mandatory.
9. Automatic recovery adds information or tests a different alternative on every
   retry; blind retry and whole-object regeneration are prohibited.
10. Human Q&A requires all five F10 conditions and does not imply final acceptance.
11. Preserved retired information is restricted and excluded from ordinary consumers.
12. Initial adoption preserves existing public APIs, immutable generations, attempt
    identities, current pointers, and battle bindings.
13. Character, battlefield preset, and narration style satisfy common conformance;
    character V3 remains the first advanced consumer.
14. Battle-runtime narration is not made part of the initial authoring lifecycle.
15. Evaluation reports semantic quality, recovery, human intervention, rework, calls,
    tokens, latency, and cost without inventing numeric gates.
16. Requirement acceptance remains separate from ADR, implementation, provider,
    deployment, migration, activation, and release authority.

17. A failed attempt retains source identity and failure reason and permits explicit
    source-based retry without mandatory intermediate candidate/context persistence.
18. A Q&A answer returns processing to the automatic flow, with source-based
    reconstruction permitted.
19. Preservation reads are limited to authorized migrators during migration;
    existing character-capsule retention and access restrictions remain applicable.

20. Server-enforced finite resource ceilings aggregate all work within an attempt and
    cannot be reset by repair, decomposition, or a phase/resolver change.
21. Bounded stagnation and oscillation detection uses observed, domain-informed signals,
    allows useful temporary regression, and ends unsuccessful bounded recovery.
22. Trusted-state consistency checks distinguish repairable external proposals from
    corrupt internal state; terminal failures cannot apply late results or activate data.
23. Safety failures retain compact diagnostic receipts and support explicit source-based
    retry without mandatory full context/checkpoint persistence or automatic restart.

## Out of scope

- Defining or changing any asset-family field semantics.
- Generalizing battle-runtime narration into the initial lifecycle.
- Selecting exact APIs, persistence tables, module paths, patch schemas, status names,
  Skill format, Tool schemas, provider adapters, or promotion protocol.
- Selecting numeric thresholds, provider routes, retry budgets, or production policy.
- Implementing, evaluating with paid/live providers, deploying, migrating production
  data, activating candidates, moving pointers, rolling back, or releasing.

## Proposed independent-review input

Review whether the candidate correctly maps existing synthesis permissions and
whole-candidate review and retry-budget contracts; permits failed attempts and
source-based retry without mandatory checkpoint persistence; confines preservation
reads to migrators during migration;
keeps semantic authority in domain adapters; supports sparse generation and
meaning-preserving transformation without unsafe invention; requires both structural
and semantic correctness; makes automatic recovery information-gaining and human Q&A
exceptional; preserves existing external behavior during initial adoption; avoids
pulling battle-runtime narration or implementation details into the requirement; and
leaves numeric gates and provider policy explicitly unresolved.

Additional revision 3 review questions: Do F15 controls mechanically bound execution
without imposing every-step semantic improvement or unnecessary durable state?
Are normal proposal rejection and trusted-state corruption distinct? Are domain
signals, existing ceilings, late results, technical failure, and human Q&A kept
within their respective authority? Can all safety criteria be verified without paid
provider calls using controlled adapters? Character revision 4 remains pending
against v2; acceptance of this candidate alone must not rewrite that dependency.
