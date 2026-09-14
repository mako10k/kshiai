# ADR-0031: Focused structured semantic authoring kernel

- Status: Accepted
- Revision: 1
- Date: 2026-09-11
- Decision owner: Product owner
- Authority: same-basename .think; this Markdown is its human-readable projection.
- Related: accepted foundation requirement v3 and character requirement v5; ADR-0010, 0011, 0014, 0024, 0027, 0028, 0030.
- Decision scope: kernel architecture and prior-contract disposition; not runtime rollout.

## Context

Accepted requirements replace whole-object authoring with focused generation, meaningful
reconciliation and bounded automatic recovery. Existing migration and family authoring
entrypoints are separate; their current code is comparison evidence, not the new
contract. WIP commit d879c87 preserves earlier work before this design.

### Evidence and drivers

E1: exact accepted foundation and character snapshots are recorded in their acceptance
documents. E2: ADR0030 D8/D9 specify whole-candidate review and two repairs/six requests;
ADR0010/0011 specify immutable structure/projection authority; ADR0014/0024 specify
queued, fenced execution. The proposal relies on these primary contracts rather than
treating a passing old implementation test as new-design conformance.

Drivers: focused model context, protected meaning, ordinary sparse generation,
reusable process mechanics, bounded execution, simple source-based retry, and existing
owner/activation/privacy boundaries.

## Considered options

1. Retain separate family loops: low extraction cost, duplicated recovery and safety.
2. Universal transformation language: broad reuse but relocates domain meaning and adds
   a new language/schema burden.
3. Thin typed kernel with adapters and ports: explicit integration cost, while domain
   meaning remains local. Chosen, consistent with the accepted foundation direction.

## Decision

### D1. Process boundary

Adopt a thin typed orchestration kernel, domain adapters, and effect ports. The kernel owns scheduling, obligations, proposal transactions, evidence, progress observation and termination. Adapters own schemas, protected meaning, dependency closure, focused projections, semantic lenses and completion. Ports own provider transport, clock/accounting and owner-fenced persistence. No character field paths or battle-runtime cognition policy belong in the kernel.

### D2. Typed internal contracts

Introduce internal SemanticAuthoringRunV1 and SemanticAuthoringAdapterV1 contract families, not public asset/schema version names. A run binds operation mode, immutable input identities, target/policy/adapter versions, expected pointer, owner and execution fence. Keep candidate and fragment types generic but concrete per adapter; decode unknown JSON only at external boundaries. Internal calls pass TypeScript values, not JSON-string round trips or unchecked casts. Separate typed proposals, findings, questions, accepted answers and terminal results.

### D3. Focused capability session

A versioned Skill descriptor names the objective, legal operation roles and how to request a focused capability. A server registry maps these to typed handlers and sliced schemas. Keep discovery metadata small; expose only the current work item's needed tools and revoke exposure at work-item end. Discovery and promotion consume step budget. Visibility never grants authorization. Queries are read-only; update tools only propose patches. The full schema/candidate remains server-side and cannot leak through a query-all or cumulative context assembly.

### D4. Assembly and validation sequence

Freeze source and classify protected anchors, adaptable preferences and creative space; build the deterministic baseline and obligation graph. Resolve focused semantic clusters, first establish the character skeleton before dependent fan-out, then recheck affected clusters. A proposal names base candidate revision, registered write closure, source claims, effects, semantic dependants and provenance. Stage candidate plus ledgers, validate authority, fragment/reference constraints and accounting, then apply atomically. Reject stale or invalid proposals without partial application. Candidate-wide final schema, compiler, disclosure, coverage and input/output reconciliation remain mandatory; lenses see only relevant projections.

### D5. Semantic recovery and Q&A

A repair may change already schema-valid dependent fields. Findings carry inspected claim references, affected scope, observed discrepancy and uncertainty; a resolver cannot manufacture facts or authority through a finding. Semantic discrepancies may need focused model assessment rather than deterministic proof alone, but the server checks references and authority and requires final reconciliation. Use informative repair, decomposition or a pre-authorized alternative within limits. Missing information normally generates values. Only the five accepted Q&A conditions permit an owner semantic question; retain scoped answers and return to automatic work, in a live run or explicit new attempt.

### D6. Persistence and worker recovery

Preserve ADR0014/0024 queued commands, pure reads, durable wake and owner-fenced worker execution. Keep run scratch state, intermediate candidates and bounded monitoring history in memory; persist frozen source, identity, required provider receipts and failure reasons, questions/answers, and final review candidates under existing retention rules. Terminal attempts replay without provider work. On process/lease loss, do not restart a claimed run with empty counters: fail it through fenced recovery using retained receipts and conservatively account unknown in-flight usage. Delivery retries before a run is claimed may requeue normally. Explicit owner retry creates a new attempt and rechecks source/pointer drift; it does not require new source content or full-context checkpoints.

### D7. Mechanical limits

All LLM planning, tools, validation/review, repairs and decomposition share an immutable per-attempt execution policy and cumulative accounting. Require finite LLM-call, step, elapsed-time, input/output, token and cost limits before admitting a run; no unlimited default. Admit work using conservative reservations including outstanding requests and bounded outputs, settle known usage without refunding unknown consumption to zero, and check deadlines at scheduling and application boundaries. Provider/model changes require the frozen policy to permit them. Stop new work at exhaustion, fence out late results and cancel outstanding requests where supported; cancellation is not a guarantee of zero charge.

### D8. Progress and state integrity

Use a bounded phase-aware history of adapter-supplied obligation/claim coverage, material findings and normalized relevant states. Ignore prose-only drift as progress. The adapter defines semantic equivalence; the kernel detects no-progress windows and repeated/alternating states and permits policy-bounded changes of recovery strategy, not unlimited repetition. Useful temporary regressions remain legal. Phase changes may select another observation basis but never reset resource counters or hide a recurring unresolved cluster. Check candidate/ledger/reference and transition consistency at mutation boundaries. An invalid proposal retains trusted state; corrupted trusted control state terminates without model repair.

### D9. Outcome and publication

Return distinct internal results for ready-for-review, needs-owner-answer and failed, with typed receipts; these are not new public status strings. Only fully validated candidates become reviewable. Owner acceptance binds exact candidate and receipts; existing append/CAS activation remains provider-free and preserves historical generations and battle bindings. Stop receipts record category, accounting, relevant findings and source identity, not hidden chain-of-thought. Technical failure alone is not semantic Q&A. Preservation remains outside active semantics, readable only by authorized migrators during migration, with the existing character 256 KiB and owner lifecycle rules.

### D10. Prior authority disposition

For consumers adopting this design after required contract decisions, replace ADR0030 D8 whole-candidate model review and D9 whole-candidate re-review topology with focused lenses and server reconciliation. Preserve D2-D5 schema/consumer/capsule meanings, D6 identity freezing, D7 provenance/authority, D10 durable terminal records, D11 activation and D12 policy/cutover. Refine D10 so durable intermediate run context is not mandatory. Current two-repair/six-request ceilings remain for existing execution; a different numeric policy requires a separately accepted successor decision before new-route execution. ADR0010/0011 structure-before-public-profile and disclosure rules remain; classified synthesis replaces deterministic-only/no-invention restrictions only in the accepted requirement scope. ADR0014/0024 delivery and ADR0027/0028 runtime responsibilities remain. No old ADR is marked Superseded while this is Proposed.

### D11. Adoption and verification

Character V3 create/revise/migrate is the first advanced adapter; character, battlefield and narration-style fixtures must exercise the same kernel without family paths. Preserve existing APIs and generation/compiler identities. Before runtime adoption, specify exact typed DTO/patch schemas, execution-policy numbers and detector/window rules, public retry/Q&A mapping, persistence/fence changes and adapter conformance in a reviewed implementation design. Those decisions cannot relax this ADR or accepted requirements. Test with controlled ports first: sparse synthesis, protected conflicts, dependency repair, cycles with cosmetic drift, valid temporary regressions, late/stale writes, process loss, no read-triggered work, source-based retry, capsule non-leakage and activation drift. Actual model quality/convergence needs separately approved provider evidence.

## Consequences

A shared driver enforces safety and provenance without expanding model context.
Costs include adapter contracts, normalized progress signatures and fenced terminal
state integration. False stall detection can stop useful exploration; missed cycles
may spend the full finite budget. Source-based retry can repeat computation.
Finite reservations can reject a route whose upper usage cannot fit; changing the
route or policy requires its own authority, not an automatic bypass.

## Compatibility and migration

D10 is the accepted clause-level replacement map, not a declaration that current
deployments changed. Do not relabel old request/response identities as the new flow.
Public retry/Q&A compatibility and exact adapters must be settled before wiring routes.
Preserve source generations, old attempts, battle bindings and authoring policy.
Do not supersede all of ADR0030: most schema, preservation and activation decisions
remain applicable. No prior ADR lifecycle status is changed by this acceptance. Any
later lifecycle-link change requires its own exact impact review and decision.

## Verification and implementation references

D11 defines the behavioral verification matrix. No implementation of this kernel,
provider validation or new policy execution occurred in this change.

Current integration seams (not implementation authorization):
- packages/shared/src/structured-assets.ts and character-semantic-migration.ts
- backend/src/services/character-authoring-service.ts
- backend/src/services/character-semantic-migration.ts
- backend/src/services/family-authoring-runners.ts
- backend/src/services/character-authoring-jobs.ts
- backend/src/repositories/family-authoring-jobs.ts

## Review and next design scope

The product owner accepted exact revision 1 on 2026-09-11 after the authoritative
record, Markdown projection, complete Japanese review scope, and independent PASS
review with no P0-P3 findings were presented. The accepted architecture is not a
completed executable specification. The next authorized stage is preparation and
review of the implementation design named in D11, including numeric-policy authority.
Implementation remains separately authorized. Existing PERT execution milestones are
not marked complete or repurposed by this acceptance. No provider call, evaluation,
deployment, production migration, candidate or asset acceptance, pointer or policy
activation, rollback, release, or prior-ADR lifecycle change is authorized.
