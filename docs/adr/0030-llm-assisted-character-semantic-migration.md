# ADR-0030: Use versioned LLM-assisted character semantic migration

- Status: Accepted
- Date: 2026-09-10
- Decision owner: Product owner
- Revision: 1
- Authoritative record: [same-basename think](0030-llm-assisted-character-semantic-migration.think)
- Refines if accepted: ADR-0010 and ADR-0011
- Preserves: ADR-0027 and ADR-0028 runtime responsibility boundaries
- Rejects as implementation direction: ADR-0029 revision 1
- Related: [accepted requirement revision 6](../character-v2-compatibility-requirements-v6-acceptance.md),
  [accepted successor plan](../character-semantic-migration-successor-plan-v1-acceptance.md)

## Context

Eight exact ready V2 character generations are excluded from new matches after
V2 action-norm meaning was tightened. The accepted requirement requires their
migration to strict immutable V3 without a permanent V2 reader, a deterministic-
only eligibility dead end, unrestricted model rewrite, or provider call on reads.

ADR-0010 and ADR-0011 retain immutable generations, persisted attempts,
validation, owner confirmation, CAS pointer movement, and exact battle binding.
ADR-0027 and ADR-0028 retain conscious ownership of goal/action/speech,
reaction-only psyche, deterministic engine validation, and their qualified V3
runtime identities.

## Decision drivers

- Restore the eight characters without changing historical V2 bytes or battles.
- Preserve every removed or role-changed value for future remigration.
- Use LLM judgment for semantic discontinuity without granting runtime,
  disclosure, identifier-allocation, or activation authority.
- Repair only the semantic closure affected by errors while fully revalidating
  each merged candidate.
- Keep optional future gaps from blocking unrelated current consumers.
- Make provider requests, acceptance, activation, replay, drift, and rollback
  independently receipted.

## Considered options

1. Permanent V2 compatibility reader: shortest short-term path, but retains dual
   V2 meaning and conflicts with the accepted objective.
2. Deterministic mapping only: cheap and reproducible, but cannot safely resolve
   added, removed, or role-changed meaning.
3. Unrestricted LLM rewrite and immediate activation: flexible, but hides source
   loss and bypasses deterministic validation and owner review.
4. Versioned hybrid migration: exact deterministic copy where meaning is stable;
   bounded model operations where meaning changes; deterministic enforcement,
   independent semantic review, owner acceptance, and append/CAS activation.

## Decision

Choose option 4. The product owner accepted exact ADR-0030 revision 1 on
2026-09-10 after review of the English authoritative record, its Markdown
projection, and the complete Japanese review scope.

### V3 character and compiler identities

Add `CharacterDefinitionV3` with strict executable `actionNorms` and a separate
bounded `CharacterConsciousGuidanceV1` collection. Every action norm selects at
least one action reference, action kind, or tactic tag. Conscious guidance has
applicability, statement, priority, preference/commitment force, self-awareness,
exceptions, and metadata, but no action selector, restrictive disposition,
tactic, or fallback.

A migrated mechanical fallback uses
`CharacterMechanicalConflictFallbackV1`, with registered action references,
legality revalidation, ordering, and a conflict receipt. V3 definition battle
compilation produces `CharacterBattleCompilerInputsV4`; basic-action provenance
uses `character_generation_v3`. Existing qualified V3 identities keep their
current meanings.

`CharacterCompilerCapabilitySetV1` registers qualified consumer/compiler needs.
Optional unresolved values live in a separate `CharacterDeferredValueV1`
collection, not as sentinel strings in active fields. Compatibility reports
supported, blocked, and deferred capabilities; only an affected required
capability blocks.

### Preservation and migration records

Store `MigrationPreservationCapsuleV1` in dedicated restricted persistence,
content-digested and bound to source and target generations. It is outside
`CharacterDefinitionV3`; ordinary public, battle, psyche, conscious, narration,
image, and authoring compilers cannot load it. It preserves exact displaced paths,
canonical values, and operation provenance, is limited to 256 KiB per character,
and follows the referenced generations' retention/export/deletion lifecycle.
Only a registered future migration consumer may read it.

`CharacterSemanticMigrationContractV1` freezes one `migrationAttemptId` over the
complete source, allowed natural source, target schema, prompt, response schema,
provider/model route, capabilities, and initial request digest. Every physical
call has a distinct `providerRequestId`, parent, digest, accounting entry, and
response/failure receipt. Attempt, request, candidate, generation, and current
pointer are distinct identities.

The response identity `character_semantic_migration_change_set_v1` allows only
`copy`, `move`, `transform`, `synthesize`, `retire_to_capsule`, and `defer`.
Each operation names its target, registered sources, value or marker, bounded
owner explanation, provenance category, and proposed semantic dependants. Server
code allocates stable IDs and rejects invented authority, facts, or rights.

### Semantic review and bounded repair

After structural validation, a stateless
`CharacterSemanticConsistencyReviewV1` request reviews the frozen source,
complete merged candidate, contract, and operations without conversation state
or hidden model reasoning. It is separately receipted and may use the same
accepted provider/model. Repair closure combines server-known dependencies,
model-proposed dependants, and review findings.

Allow at most two repair rounds. Each has one bounded
`CharacterSemanticRepairV1` request and one fresh whole-candidate semantic
review. One attempt therefore has at most six provider requests: initial
generation/review plus two repair/re-review pairs. Execution approval may lower,
but not raise, this ceiling. Every merge receives full structural revalidation.

### Persistence, activation, cutover, and rollback

Persist attempts, requests, candidates, capsules, acceptances, and success
receipts in dedicated append-oriented records. Completed attempt replay performs
no provider call and creates no duplicate generation. A request for a different
semantic result creates a new attempt. Failure, decline, or drift never changes
the current generation.

Per asset, one transaction appends the accepted V3 envelope, capsule binding,
compatibility state, and success receipt, then CAS-moves the pointer from the
frozen source. Assets commit independently. Rollback CAS-moves only an affected
pointer to a prior compatible generation and adds a receipt; it deletes nothing.

Store `characterDefinitionSchemaVersion` in a dedicated revisioned
`CharacterAuthoringPolicyV1` record with value 2 or 3 and CAS activation. It is
not inferred from time, deployment, dialogue schema, or environment variables.
Deploy and verify dual readers before selecting 3. After selection, create and
ordinary revision emit strict V3; restore/import/derived/upgrade input uses the
migration contract. Per-asset rollback does not silently downgrade the policy.

## Consequences

### Positive

- The eight characters have a migration path without permanent V2 semantics.
- Source loss, synthesis, deferral, provider work, and owner decisions are visible.
- Capsule data cannot become ordinary runtime or public input.
- Bounded repairs can include semantically affected valid fields without
  regenerating the whole candidate.
- Partial failure is isolated per character and replay is idempotent.

### Negative and risks

- Six provider requests per failed/repaired attempt can add material cost and latency.
- Semantic review by the same accepted model is request-independent, not an
  independently trained judge; execution review must retain that limitation.
- Capsule retention expands restricted-data lifecycle obligations.
- Dual V2/V3 readers and capability-scoped readiness increase implementation and test scope.
- The 256 KiB bound or two-round ceiling may prove too small; changing either
  requires a reviewed ADR revision rather than silent relaxation.

## Compatibility and migration

- Historical V2 generations and old battles remain byte-readable.
- No selector/search/battle path invokes a provider or migrates a character.
- The frozen production operation contains exactly the refreshed eight eligible
  source generations; sixteen no-state characters remain outside it.
- New V3 generations use new compiler and provenance identities.
- Existing runtime V3 tuples and `consciousAgencyV1` retain their meanings.
- Production provider work, acceptance, append/CAS, and policy activation remain
  separate successor-plan gates.

## Verification

- Trace every accepted requirement criterion to a focused test and B7 integration evidence.
- Cover strict V3 parsing, guidance/mechanics separation, qualified tuple rejection,
  capsule non-consumption and future registered recovery.
- Cover all six operations, split guidance/fallback migration, disclosure
  non-widening, semantic closure expansion, two repair rounds, and the six-call cap.
- Cover completed replay, semantic regeneration, crash, failure, decline,
  source/pointer drift, per-asset CAS, partial success, rollback, and old battles.
- Run full tests, typecheck, build, duplication, Lizard, ADR check, Seal impact,
  stale review, and fsck before any deployment proposal.

## Implementation references

- [Successor plan](../character-semantic-migration-successor-plan-v1.md)
- `packages/shared/src/structured-character.ts`
- `packages/shared/src/character-definition-rules.ts`
- `backend/src/repositories/character-assets-v2.ts`
- New migration persistence and orchestration modules are named during B3-B6.

## Review

The product owner accepted exact ADR-0030 revision 1 on 2026-09-10 by replying
`ACCEPT` to the presented decision. Acceptance authorizes the local B3-B7
successor-plan implementation gates. Provider calls, deployment, production
read/write, candidate acceptance, pointer movement, rollback, and policy
activation remain separate B8-B14 authorization gates.
