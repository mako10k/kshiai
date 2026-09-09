# ADR-0026: Repair rejected Compact psyche output by semantic closure

- Status: Accepted
- Date: 2026-09-09
- Decision owner: Product owner
- Related: ADR-0025; `docs/evidence/compact-v2-provider-replay-rca-2026-09-09.md`;
  `docs/dialogue-expression-realization-design.md`
- Authority: `0026-compact-psyche-semantic-closure-repair.think`

## Context

The first real Compact V2 deep-psyche response was complete JSON, but six
required appraisal strings were empty and the application schema rejected it.
The producer prompt's JSON example showed those fields as empty even though the
consumer schema requires non-empty values.

Correcting only the reported paths is also insufficient. A changed appraisal
can require corresponding changes to values that already passed field-level
validation, including its continuity basis, expression decision, focus,
relationship move, and public aim.

## Decision drivers

- Correct the prompt/schema mismatch rather than weakening the schema.
- Preserve valid unrelated output instead of regenerating the whole stage.
- Repair the smallest complete semantic dependency group, not only error paths.
- Keep eligibility, mutation scope, merge, validation, and retry limits under
  server control.
- Preserve ADR-0025's state, history, repetition, and commit boundaries.

## Considered options

1. Fail every invalid first response. Safe but discards repairable work.
2. Regenerate the complete deep-psyche output. Coherent but needlessly large and
   able to change unrelated valid state.
3. Patch only validator error paths. Small but can create semantic contradictions.
4. Let the model choose arbitrary dependent paths. Flexible but does not bound
   authority or preserve unrelated state reliably.
5. Replace a server-defined semantic closure and validate the merged full result.
   Proposed.

## Decision

OWNER_ACCEPTANCE: on 2026-09-09, after the ADR overview, repair flow,
semantic closure, boundaries, and tradeoffs were explained, the product owner
replied, "OKです。承認します。" The approved pre-acceptance `.think` snapshot
had SHA-256
`5a6297a8cf3dbb44422c3a09d0aa27615edbdaff359f0c7c91fc77bb2da90c93`.

During integration on 2026-09-09, current main was found to already own
ADR-0024, while the prerequisite expression-state decision was allocated
ADR-0025. This dependent repair record was therefore allocated ADR-0026. The
approved decision content and acceptance digest are unchanged.

First, align the initial prompt with the schema: explicitly require all six
appraisal strings to be non-empty immediately before the return contract and
replace copyable empty-string exemplars with semantic value markers.

If the first decoded Compact V2 psyche candidate fails inside the defined
appraisal/expression group, allow one repair request. The mandatory replacement
unit contains complete `speechAppraisal` and `expressionBrief` values. The model
may also return complete replacements for `dialogueThread`,
`observableManifestations`, or `narrativeCues` when the repaired meaning affects
them. No other `delta` field is writable.

The repair request contains:

- the rejected semantic slice;
- machine-readable validation issues;
- a deterministic explanation of the violated contract;
- relevant immutable observation and dialogue context; and
- the exact writable roots.

The server rejects unexpected roots, merges only allowed replacements into the
preserved decoded candidate, and runs the normal decoder and full Compact schema
including cross-field refinements. There is at most one application repair per
logical result. A non-object root, an error outside the declared group, or a
failed repair fails closed.

Use a separate provider-operation label, lower temperature, normal physical-call
accounting, and retained evidence for both attempts. Provider transport retry is
separate and does not reset the one-repair limit.

## Consequences

### Positive

- Repairs may update fields that passed validation when semantic consistency
  requires it.
- Unrelated valid deep-psyche state remains byte-for-byte preserved by the
  server merge.
- Repair output and context are smaller than complete-stage regeneration.
- The first and repaired candidates remain distinguishable and auditable.

### Negative and risks

- A second physical provider request is possible after an invalid first result.
- Stage-specific dependency groups must be maintained as semantics evolve.
- Passing the schema after repair does not prove subjective dialogue quality.
- Optional affected roots require tests proving omission preserves their prior
  value and explicit empty arrays can intentionally clear prior cues.

## Compatibility and migration

- ADR-0025 remains Accepted and is not superseded.
- The normal valid Compact path still uses one provider call.
- Existing battle contract bindings and stored state need no migration.
- Provider-operation taxonomy v2 adds the repair label to `deepPsyche`, and
  observation projection reserves one possible repair for each projected
  Compact psyche call. An existing run remains bound to its recorded taxonomy
  revision and must not be reinterpreted or resumed under v2.
- This is not a repetition critic, output fallback, additional commit boundary,
  or authorization for provider replay, deployment, or release.
- The implementation design is updated to distinguish the unchanged successful
  one-call path from this conditional application repair.

## Verification

- Valid first output produces no repair request.
- Repair input contains exact issues, relevant context, and only declared roots.
- Previously valid dependent fields can change inside the closure.
- Unexpected roots and root-level malformed output fail closed.
- Unrelated delta fields survive the server merge unchanged.
- The merged full candidate passes the complete schema and refinements.
- A failed repair is not repaired again.
- Initial and repair attempts have separate accounting labels.
- Existing Compact, legacy, privacy, and stale-revision tests remain green.
- Run focused tests, full tests, typecheck, build, `npm run adr:check`, and
  command-line LLMThink audit.

## Implementation references

- `packages/shared/src/battle.ts`: non-blank appraisal contract and
  appraisal/expression continuity refinement.
- `backend/src/llm/openai-compatible.ts`: aligned initial contract, closed
  repair envelope, server merge, and full revalidation.
- `backend/src/llm/openai-compatible-psyche-repair.test.ts`: repair boundary,
  semantic-closure, preservation, and fail-closed regression tests.
- `backend/src/llm/provider-operation-taxonomy.ts`: separately accounted repair
  operation under taxonomy v2.
- Local validation completed with focused tests, full tests, typecheck, build,
  duplicate detection, and the pinned Lizard complexity gate. `npm run
  adr:check` is unavailable because the script is not defined; the authoritative
  `.think` audit and pair/index readback are used instead.
