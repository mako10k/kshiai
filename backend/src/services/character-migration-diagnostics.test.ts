import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  CharacterMigrationJsonSchema, CharacterSemanticMigrationAttemptV1Schema,
  CharacterSemanticMigrationChangeSetV1Schema,
} from "@kshiai/shared";
import {
  CHARACTER_MIGRATION_PROMPT_V3, createCharacterMigrationContext,
  migrationRead, migrationTargetPaths,
} from "./character-migration-context.js";
import { initialCharacterMigrationMerge, mergeCharacterMigrationChangeSet,
  migrationPreservationEntries } from "./character-migration-merge.js";
import { characterMigrationProviderPayload } from "./character-migration-prompts.js";
import { parseCharacterMigrationReview } from "./character-migration-diagnostics.js";
import { carryCharacterMigrationDisclosure, validateCharacterMigrationCandidate } from "./character-migration-validation.js";

// Read-only regression inputs from the actual failed six-call probe. No DB or
// network invocation; historical artifacts are never rewritten by these tests.
const evidence = new URL("../../../docs/evidence/semantic-migration-grok-2026-09-10-v2/", import.meta.url);
function read(name: string): unknown {
  return JSON.parse(readFileSync(new URL(name, evidence), "utf8"));
}
const savedAttempt = z.object({ attempt: CharacterSemanticMigrationAttemptV1Schema })
  .parse(read("prepare-proof.json")).attempt;
const BeforeSchema = z.object({ call: z.object({
  system: z.string(), input: CharacterMigrationJsonSchema,
  responseSchema: CharacterMigrationJsonSchema, providerRequestId: z.string(),
}) });
function response(ordinal: number): unknown {
  const event = z.object({ body: z.string() }).parse(read(`call-${ordinal}-response.json`));
  const body = z.object({ choices: z.array(z.object({
    message: z.object({ content: z.string() }),
  })).min(1) }).parse(JSON.parse(event.body));
  return JSON.parse(body.choices[0].message.content);
}
function context(corrected = true) {
  return createCharacterMigrationContext(corrected
    ? { ...savedAttempt, promptIdentity: CHARACTER_MIGRATION_PROMPT_V3 } : savedAttempt);
}
function review(findings: unknown[], verdict = "repair_required") {
  return { schema: "character_semantic_consistency_review_v1", verdict, findings,
    summary: "Full candidate review", uncertainties: [] };
}
function finding(path: string) {
  return { code: "meaning_mismatch", targetPaths: [path], sourcePaths: [],
    semanticDependants: [], explanation: "Source/candidate mismatch" };
}

describe("semantic migration repair diagnostics", () => {
  it("reconstructs historical v2 initial payload and final draft exactly", () => {
    const ctx = context(false);
    let state = initialCharacterMigrationMerge(ctx);
    const payload = characterMigrationProviderPayload({ context: ctx, state,
      kind: "initial_generation", findings: [], repairClosure: [] });
    const first = BeforeSchema.parse(read("call-1-before.json")).call;
    assert.deepEqual(payload, { system: first.system, input: first.input, responseSchema: first.responseSchema });
    for (const ordinal of [1, 3, 5]) {
      const before = BeforeSchema.parse(read(`call-${ordinal}-before.json`)).call;
      const closure = migrationRead(before.input, "repairClosure");
      state = mergeCharacterMigrationChangeSet({ context: ctx, previous: state,
        changeSet: CharacterSemanticMigrationChangeSetV1Schema.parse(response(ordinal)),
        providerRequestId: before.providerRequestId,
        repairClosure: ordinal === 1 ? null : z.array(z.string()).parse(closure) });
      carryCharacterMigrationDisclosure(ctx, state);
    }
    const live = z.object({ result: z.object({ draft: CharacterMigrationJsonSchema }) })
      .parse(read("live-result.json"));
    assert.deepEqual(state.candidate, live.result.draft);
    assert.equal(state.findings.length, 1, "v2 overlap feedback stays unchanged");
  });

  it("retains all path-valid real findings without endorsing their semantic truth", () => {
    const ctx = context();
    const parsed = parseCharacterMigrationReview(response(2), ctx, ctx.baseline);
    assert.equal(parsed.review?.verdict, "repair_required");
    assert.ok(parsed.findings.some((item) => item.code === "missing_actionNorms_executable"));
    assert.ok(parsed.findings.some((item) => item.code.includes("fallback")));
    assert.ok(parsed.findings.some((item) => item.code === "widened_disclosure"));
    assert.equal(parsed.findings.length, 3);
  });

  it("permits complete-envelope diagnostics without permitting metadata writes", () => {
    const ctx = context();
    const result = parseCharacterMigrationReview(review([
      finding("disclosurePolicy.rules"), finding("compilerCompatibility"),
    ]), ctx, ctx.baseline);
    assert.equal(result.review?.verdict, "repair_required");
    assert.equal(result.findings.length, 2);
    assert.ok(!migrationTargetPaths(ctx.baseline).includes("disclosurePolicy.rules"));
    const sample = CharacterSemanticMigrationChangeSetV1Schema.parse(response(1)).operations[0];
    const state = mergeCharacterMigrationChangeSet({ context: ctx,
      previous: initialCharacterMigrationMerge(ctx), repairClosure: null, providerRequestId: "protected",
      changeSet: { schema: "character_semantic_migration_change_set_v1", uncertainties: [],
        operations: [{ ...sample, operation: "transform", provenance: "source_derived",
          targetPath: "disclosurePolicy.rules", value: [], semanticDependants: [] }] } });
    assert.equal(state.findings[0]?.code, "operation_path_invalid");
    assert.deepEqual(state.candidate, ctx.baseline);
  });

  it("keeps structurally valid findings and never turns malformed review into approval", () => {
    const ctx = context();
    const valid = finding("definition.actionNorms");
    for (const invalid of [{ ...valid, explanation: null }, { ...valid, targetPaths: ["no.such.path"] }]) {
      const result = parseCharacterMigrationReview(review([invalid, valid]), ctx, ctx.baseline);
      assert.equal(result.review, null);
      assert.ok(result.findings.some((entry) => entry.code === valid.code));
      assert.equal(result.findings.length, 2);
    }
    const inconsistent = parseCharacterMigrationReview(review([valid], "consistent"), ctx, ctx.baseline);
    assert.equal(inconsistent.review, null);
    assert.equal(inconsistent.findings.length, 2);
  });

  it("surfaces V2 keys in the rejected real replacement without applying it", () => {
    const ctx = context();
    const state = mergeCharacterMigrationChangeSet({ context: ctx,
      previous: initialCharacterMigrationMerge(ctx), repairClosure: null, providerRequestId: "rejected",
      changeSet: CharacterSemanticMigrationChangeSetV1Schema.parse(response(5)) });
    assert.deepEqual(migrationRead(state.candidate, "definition.actionNorms"), []);
    assert.ok(state.findings.some((entry) => entry.code === "overlapping_operations"));
    const errors = state.findings.filter((entry) => entry.code === "rejected_fragment_schema_invalid");
    assert.equal(errors.length, 2);
    assert.match(errors.map((entry) => entry.explanation).join(" "), /statement.*fallbackActionRef/);
    assert.match(errors.map((entry) => entry.explanation).join(" "), /selfAwareness/);
  });

  it("preserves displaced source without retirement and strictly rejects V2 replacement shape", () => {
    const ctx = context();
    const raw = CharacterSemanticMigrationChangeSetV1Schema.parse(response(5));
    const state = mergeCharacterMigrationChangeSet({ context: ctx,
      previous: initialCharacterMigrationMerge(ctx), repairClosure: null, providerRequestId: "one-replacement",
      changeSet: { ...raw, operations: raw.operations.filter((op) => op.operation !== "retire_to_capsule") } });
    assert.ok(!state.findings.some((entry) => entry.code === "overlapping_operations"));
    assert.deepEqual(migrationPreservationEntries(ctx, state)
      .find((entry) => entry.sourcePath === "definition.actionNorms")?.value,
    ctx.source.definition.actionNorms);
    const validation = validateCharacterMigrationCandidate({ context: ctx, state,
      availableCapabilities: savedAttempt.compilerCapabilities.required });
    assert.equal(validation.candidate, null);
    assert.ok(validation.findings.some((entry) => entry.code === "candidate_schema_invalid"));
  });

  it("supplies separate review scope and explicit unknown availability only on v3", () => {
    const ctx = context();
    const payload = characterMigrationProviderPayload({ context: ctx,
      state: initialCharacterMigrationMerge(ctx), kind: "semantic_review", findings: [], repairClosure: [] });
    assert.ok(z.array(z.string()).parse(migrationRead(payload.input, "registeredReviewPaths"))
      .includes("disclosurePolicy.rules"));
    assert.equal(migrationRead(payload.input, "capabilityAvailability"), "not_supplied_in_frozen_attempt");
    assert.deepEqual(migrationRead(payload.input, "requiredCapabilities"), savedAttempt.compilerCapabilities);
    assert.match(payload.system, /displaced source values are preserved automatically/);
    assert.match(payload.system, /Construct source-supported values independently of runtime readiness/);
  });

  it("accepts a strict source-supported mixed migration with archival and no retirement", () => {
    const ctx = context();
    const [soft, executable] = ctx.source.definition.actionNorms;
    const targets = [
      { path: "definition.consciousGuidance", value: ctx.source.definition.actionNorms.map((norm, index) => ({
        id: ctx.allocatedIds["definition.consciousGuidance"][index],
        applicability: norm.when, statement: norm.response.statement, priority: norm.priority,
        force: norm.force, selfAwareness: norm.selfAwareness, exceptions: norm.exceptions,
        description: norm.description,
      })) },
      { path: "definition.actionNorms", value: [{
        id: ctx.allocatedIds["definition.actionNorms"][0], when: executable.when,
        response: { disposition: executable.response.disposition,
          actionRefs: executable.response.actionRefs, actionKinds: executable.response.actionKinds,
          tacticTags: executable.response.tacticTags },
        priority: executable.priority, force: executable.force,
        exceptions: executable.exceptions, description: executable.description,
      }] },
      { path: "definition.mechanicalConflictFallbacks", value: [{
        id: ctx.allocatedIds["definition.mechanicalConflictFallbacks"][0],
        applicability: soft.when, orderedActionRefs: [soft.response.fallbackActionRef],
        priority: soft.priority, receiptContract: "character-mechanical-conflict-receipt-v1",
      }] },
    ];
    const changeSet = CharacterSemanticMigrationChangeSetV1Schema.parse({
      schema: "character_semantic_migration_change_set_v1", uncertainties: [],
      operations: targets.map(({ path, value }) => ({
        operation: "transform", targetPath: path, value, deferred: null,
        sourcePaths: ["definition.actionNorms"], provenance: "source_derived",
        explanation: "Separate source meanings into strict V3 responsibilities.",
        semanticDependants: [],
      })),
    });
    const state = mergeCharacterMigrationChangeSet({ context: ctx,
      previous: initialCharacterMigrationMerge(ctx), changeSet,
      repairClosure: null, providerRequestId: "strict-mixed" });
    carryCharacterMigrationDisclosure(ctx, state);
    const result = validateCharacterMigrationCandidate({ context: ctx, state,
      availableCapabilities: ctx.attempt.compilerCapabilities.required });
    assert.deepEqual(result.findings, []);
    assert.equal(result.compatibility?.status, "ready");
    assert.equal(result.candidate?.definition.consciousGuidance.length, 2);
    assert.equal(result.candidate?.definition.actionNorms.length, 1);
    assert.equal(result.candidate?.definition.mechanicalConflictFallbacks.length, 1);
    assert.deepEqual(result.candidate?.definition.actionNorms[0].response.actionRefs,
      executable.response.actionRefs);
    assert.deepEqual(migrationPreservationEntries(ctx, state)
      .find((entry) => entry.sourcePath === "definition.actionNorms")?.value,
    ctx.source.definition.actionNorms);
  });
});
