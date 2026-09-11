import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHARACTER_SEMANTIC_MIGRATION_CONTRACT_V1,
  CHARACTER_SEMANTIC_MIGRATION_RESPONSE_SCHEMA_V1,
  CharacterGenerationEnvelopeV2Schema, CharacterMigrationJsonSchema,
  CharacterSemanticConsistencyReviewV1Schema,
  CharacterSemanticMigrationAttemptV1Schema,
  CharacterSemanticMigrationChangeSetV1Schema,
  CharacterSemanticMigrationProviderReceiptV1Schema,
  defaultBasicAttack, defaultParameters,
  type CharacterMigrationJson,
  type CharacterSemanticMigrationAttemptV1,
  type CharacterSemanticMigrationOperationV1,
  type CharacterSheet,
} from "@kshiai/shared";
import { z } from "zod";
import type { CharacterMigrationProvider, CharacterMigrationProviderCall } from "./character-migration-requests.js";
import { assertXaiResponseSchema } from "../llm/provider-response-schema.js";

const directory = mkdtempSync(join(tmpdir(), "kshiai-b5-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "migration.db");
const { closeDatabase, query } = await import("../db.js");
const { assetContentDigest, createAssetGeneration, getCurrentAssetGeneration } =
  await import("../repositories/asset-generations.js");
const { characterSemanticMigrationInitialRequestDigest, loadCharacterSemanticMigrationWork } =
  await import("../repositories/character-semantic-migration.js");
const { buildImportedCharacterEnvelopeV2 } = await import("./character-authoring-service.js");
const { generateCharacterSemanticMigration } = await import("./character-semantic-migration.js");
const {
  CHARACTER_MIGRATION_PROMPT_V3, CHARACTER_MIGRATION_PROMPT_V4,
  createCharacterMigrationContext, migrationRead, migrationWrite,
} =
  await import("./character-migration-context.js");
const { initialCharacterMigrationMerge, mergeCharacterMigrationChangeSet } =
  await import("./character-migration-merge.js");
const { validateCharacterMigrationCandidate, carryCharacterMigrationDisclosure } =
  await import("./character-migration-validation.js");
const { characterMigrationProviderPayload } = await import("./character-migration-prompts.js");

const now = "2026-09-10T09:00:00.000Z";
const paidProbeEvidence = resolve(dirname(fileURLToPath(import.meta.url)),
  "../../../docs/evidence/semantic-migration-grok-2026-09-11-v3");
const PaidProbeProofSchema = z.object({ attempt: CharacterSemanticMigrationAttemptV1Schema });
const PaidProbeReceiptSchema = z.object({
  ordinal: z.number().int().min(1).max(6),
  phase: z.literal("receipt"),
  receipt: CharacterSemanticMigrationProviderReceiptV1Schema,
});
const PaidProbeBeforeSchema = z.object({
  ordinal: z.number().int().min(1).max(6),
  phase: z.literal("before"),
  call: z.object({
    providerRequestId: z.string().min(1),
    input: z.object({ repairClosure: z.array(z.string()).optional() }).passthrough(),
  }).passthrough(),
});

function readPaidProbeJson(name: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(join(paidProbeEvidence, name), "utf8"));
  return parsed;
}

const sheet: CharacterSheet = {
  id: "b5-character", ownerUserId: "b5-owner", displayName: "灯",
  tags: [], createdAt: now, updatedAt: now,
  appearance: { summary: "赤い外套をまとう", visualPrompt: "red cloak" },
  traits: [], parameters: defaultParameters(), skills: [],
  basicAttack: defaultBasicAttack(), weapon: null, armor: null,
  combatFlags: { canFight: true, irreversibleIncapacitated: false },
  narrativeBlurb: "火を守る旅人。",
};
const imported = buildImportedCharacterEnvelopeV2({ sheet, attemptId: "source-import" });
const source = CharacterGenerationEnvelopeV2Schema.parse({
  ...imported,
  definition: {
    ...imported.definition,
    actionNorms: [{
      id: "soft-principle", when: {
        match: "all", clauses: [{ kind: "always", operator: "is", value: "true" }],
      },
      response: { disposition: "prefer", actionRefs: [], actionKinds: [], tacticTags: [],
        statement: "勝敗だけでなく相手との攻防を楽しむ",
        fallbackActionRef: imported.definition.capabilities.basicAction.id },
      priority: 60, force: "preference", selfAwareness: "aware",
      exceptions: [], description: null,
    }],
  },
});
let sourceGenerationId = "";

before(async () => {
  await query("INSERT INTO users (id, username, password_hash, created_at) VALUES ($1,$1,'x',$2)",
    [sheet.ownerUserId, now]);
  await query(`INSERT INTO characters (id,owner_user_id,sheet_json,created_at,updated_at)
    VALUES ($1,$2,'{}',$3,$3)`, [sheet.id, sheet.ownerUserId, now]);
  const generation = await createAssetGeneration({
    assetType: "character", assetId: sheet.id, schemaVersion: 2, content: source, createdAt: now,
  });
  sourceGenerationId = generation.generationId;
  await query(`INSERT INTO character_asset_states
    (character_id,compatibility_status,current_generation_id,updated_at)
    VALUES ($1,'ready',$2,$3)`, [sheet.id, sourceGenerationId, now]);
});
after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

function attempt(id: string): CharacterSemanticMigrationAttemptV1 {
  const base = CharacterSemanticMigrationAttemptV1Schema.omit({ initialRequestDigest: true }).parse({
    migrationAttemptId: id, ownerUserId: sheet.ownerUserId, characterId: sheet.id,
    sourceGenerationId, sourceSchemaVersion: 2, sourceContentDigest: assetContentDigest(source),
    sourceContent: source, naturalSource: null, targetSchemaVersion: 3,
    migrationContractId: CHARACTER_SEMANTIC_MIGRATION_CONTRACT_V1,
    promptIdentity: "character-semantic-migration-prompt-v2",
    responseSchemaIdentity: CHARACTER_SEMANTIC_MIGRATION_RESPONSE_SCHEMA_V1,
    providerRoute: "local-test-double", modelIdentity: "scripted-fixture",
    compilerCapabilities: { contractVersion: 1, required: [
      { consumer: "character-action-norms", version: 3 },
      { consumer: "character-mechanical-conflict-fallback", version: 1 },
    ] },
    createdAt: now,
  });
  return { ...base, initialRequestDigest: characterSemanticMigrationInitialRequestDigest(base) };
}

function versionedAttempt(id: string, promptIdentity: string): CharacterSemanticMigrationAttemptV1 {
  const base = { ...attempt(id), promptIdentity };
  return { ...base, initialRequestDigest: characterSemanticMigrationInitialRequestDigest(base) };
}

function operation(
  targetPath: string, value: unknown,
  overrides: Partial<CharacterSemanticMigrationOperationV1> = {},
): CharacterSemanticMigrationOperationV1 {
  return {
    operation: "transform", targetPath, sourcePaths: ["definition.actionNorms"],
    value: CharacterMigrationJsonSchema.parse(value), deferred: null,
    explanation: "旧規範の意味を顕在意識と機械的fallbackに分離する。",
    provenance: "source_derived", semanticDependants: [], ...overrides,
  };
}
function changeSet(operations: CharacterSemanticMigrationOperationV1[]) {
  return CharacterSemanticMigrationChangeSetV1Schema.parse({
    schema: CHARACTER_SEMANTIC_MIGRATION_RESPONSE_SCHEMA_V1, operations, uncertainties: [],
  });
}
function migratedOperations(input: CharacterSemanticMigrationAttemptV1) {
  const context = createCharacterMigrationContext(input);
  const norm = source.definition.actionNorms[0];
  return [
    operation("definition.consciousGuidance", [{
      id: context.allocatedIds["definition.consciousGuidance"][0],
      applicability: norm.when, statement: norm.response.statement, priority: norm.priority,
      force: norm.force, selfAwareness: norm.selfAwareness,
      exceptions: norm.exceptions, description: norm.description,
    }]),
    operation("definition.mechanicalConflictFallbacks", [{
      id: context.allocatedIds["definition.mechanicalConflictFallbacks"][0],
      applicability: norm.when, orderedActionRefs: [norm.response.fallbackActionRef],
      priority: norm.priority, receiptContract: "character-mechanical-conflict-receipt-v1",
    }]),
  ];
}
function consistentReview() {
  return { schema: "character_semantic_consistency_review_v1", verdict: "consistent",
    findings: [], summary: "元の意味と整合。", uncertainties: [] };
}
function scriptedProvider(
  reply: (call: CharacterMigrationProviderCall, index: number) => unknown,
) {
  const calls: CharacterMigrationProviderCall[] = [];
  const provider: CharacterMigrationProvider = async (call) => {
    assertXaiResponseSchema(call.responseSchema);
    assertXaiResponseSchema(migrationRead(call.input, "targetDefinitionSchema"));
    const index = calls.push(call) - 1;
    const response = reply(call, index);
    return CharacterSemanticMigrationProviderReceiptV1Schema.parse({
      outcome: "succeeded", response, responseDigest: assetContentDigest(response),
      accounting: { inputTokens: 10, outputTokens: 5, totalTokens: 15,
        estimatedCostUsd: null, elapsedMs: 1 },
      finishedAt: new Date(Date.parse(now) + (index + 1) * 1000).toISOString(),
    });
  };
  return { provider, calls };
}
async function run(id: string, reply: (call: CharacterMigrationProviderCall, index: number) => unknown) {
  const input = attempt(id);
  const script = scriptedProvider(reply);
  const result = await generateCharacterSemanticMigration({
    attempt: input, provider: script.provider, availableCapabilities: input.compilerCapabilities.required,
  });
  return { input, ...script, result };
}

describe("B5 bounded semantic migration", () => {
  it("turns every retained paid V3 response into an executable V4 failure corpus", () => {
    const proof = PaidProbeProofSchema.parse(readPaidProbeJson("prepare-proof.json"));
    const receipts = Array.from({ length: 6 }, (_, index) =>
      PaidProbeReceiptSchema.parse(readPaidProbeJson(`call-${index + 1}-receipt.json`)));
    const succeeded = receipts.map((entry) => {
      assert.equal(entry.receipt.outcome, "succeeded", `call ${entry.ordinal} must remain succeeded`);
      if (entry.receipt.outcome !== "succeeded") assert.fail(`call ${entry.ordinal} failed`);
      return entry.receipt;
    });
    assert.deepEqual(succeeded.map((receipt) =>
      migrationRead(CharacterMigrationJsonSchema.parse(receipt.response), "schema")), [
      "character_semantic_migration_change_set_v1",
      "character_semantic_consistency_review_v1",
      "character_semantic_migration_change_set_v1",
      "character_semantic_consistency_review_v1",
      "character_semantic_migration_change_set_v1",
      "character_semantic_consistency_review_v1",
    ]);
    assert.equal(succeeded.reduce((total, receipt) =>
      total + receipt.accounting.totalTokens, 0), 188_276);

    const reviewCodes = succeeded.filter((_, index) => index % 2 === 1).map((receipt) => {
      const parsed = CharacterSemanticConsistencyReviewV1Schema.parse(receipt.response);
      return parsed.findings.map((finding) => finding.code);
    });
    assert.deepEqual(reviewCodes, [
      ["missing_actionNorms_executable", "disclosure_rule_removed", "fallbackActionRef_lost"],
      ["missing_fallbackActionRef_migration", "lost_actionNorms_priority",
        "missing_selfAwareness_in_actionNorms"],
      ["missing_fallbackActionRef_migration", "actionNorms_priority_mismatch",
        "disclosurePolicy_actionNorms_removal", "missing_consciousGuidance_disclosure"],
    ]);

    function replayGeneration(promptIdentity: string) {
      const { initialRequestDigest: _storedDigest, ...storedAttempt } = proof.attempt;
      const base = CharacterSemanticMigrationAttemptV1Schema.omit({ initialRequestDigest: true }).parse({
        ...storedAttempt, promptIdentity,
      });
      const input = { ...base,
        initialRequestDigest: characterSemanticMigrationInitialRequestDigest(base) };
      const context = createCharacterMigrationContext(input);
      let state = initialCharacterMigrationMerge(context);
      const snapshots: CharacterMigrationJson[] = [];
      for (const ordinal of [1, 3, 5]) {
        const receipt = succeeded[ordinal - 1];
        const changeSet = CharacterSemanticMigrationChangeSetV1Schema.parse(receipt.response);
        const before = PaidProbeBeforeSchema.parse(readPaidProbeJson(`call-${ordinal}-before.json`));
        const repairClosure = before.call.input.repairClosure;
        if (ordinal !== 1) assert.ok(repairClosure, `call ${ordinal} repair closure must be retained`);
        state = mergeCharacterMigrationChangeSet({
          context, previous: state, changeSet,
          providerRequestId: before.call.providerRequestId,
          repairClosure: ordinal === 1 ? null : repairClosure ?? null,
        });
        carryCharacterMigrationDisclosure(context, state);
        snapshots.push(structuredClone(state.candidate));
      }
      return { context, state, snapshots };
    }

    const v3 = replayGeneration(CHARACTER_MIGRATION_PROMPT_V3);
    assert.deepEqual(migrationRead(v3.snapshots[0],
      "definition.mechanicalConflictFallbacks.0.orderedActionRefs"), ["basic-action"]);
    assert.equal(migrationRead(v3.snapshots[1],
      "definition.mechanicalConflictFallbacks.0.orderedActionRefs"), null);
    assert.deepEqual(migrationRead(v3.snapshots[2],
      "definition.mechanicalConflictFallbacks.0.orderedActionRefs"), []);
    assert.equal(migrationRead(v3.snapshots[2], "definition.actionNorms.0.priority"), 60);

    const v4 = replayGeneration(CHARACTER_MIGRATION_PROMPT_V4);
    assert.deepEqual(migrationRead(v4.snapshots[0],
      "definition.mechanicalConflictFallbacks.0.orderedActionRefs"), ["basic-action"]);
    assert.deepEqual(migrationRead(v4.snapshots[1],
      "definition.mechanicalConflictFallbacks.0.orderedActionRefs"), ["basic-action"]);
    assert.deepEqual(migrationRead(v4.snapshots[2],
      "definition.mechanicalConflictFallbacks.0.orderedActionRefs"), ["basic-action"]);
    const v4Validation = validateCharacterMigrationCandidate({
      context: v4.context, state: v4.state,
      availableCapabilities: v4.context.attempt.compilerCapabilities.required,
    });
    assert.ok(v4Validation.findings.some((finding) =>
      finding.code === "executable_action_norm_source_mismatch" &&
      finding.targetPaths.includes("definition.actionNorms.0.priority")));
    assert.equal(v4Validation.findings.some((finding) =>
      finding.code === "candidate_schema_invalid"), false);
  });

  it("v3 carries valid review feedback through bounded repair and replays without calls", async () => {
    const input = versionedAttempt("v3-review-repair", CHARACTER_MIGRATION_PROMPT_V3);
    const ops = migratedOperations(input);
    const script = scriptedProvider((call, index) => {
      if (index === 0) return changeSet([ops[0]]);
      if (index === 1) return { ...consistentReview(), verdict: "repair_required", findings: [
        { code: "missing_fallback", targetPaths: ["definition.mechanicalConflictFallbacks"],
          sourcePaths: ["definition.actionNorms.0.response.fallbackActionRef"],
          semanticDependants: ["definition.consciousGuidance"],
          explanation: "Source fallback must be migrated." },
        { code: "bad_location", targetPaths: ["disclosurePolicy.noSuchField"], sourcePaths: [],
          semanticDependants: [], explanation: "Invalid reviewer location." },
      ] };
      if (index === 2) {
        const errors = migrationRead(call.input, "errors");
        assert.ok(Array.isArray(errors));
        assert.ok(errors.some((item) => migrationRead(item, "code") === "missing_fallback"));
        assert.ok(errors.some((item) => migrationRead(item, "code") === "review_path_invalid"));
        const closure = migrationRead(call.input, "repairClosure");
        assert.ok(Array.isArray(closure));
        assert.ok(closure.includes("definition.consciousGuidance"));
        assert.ok(!closure.some((path) => typeof path === "string" && path.startsWith("disclosurePolicy")));
        assert.equal(migrationRead(call.input, "completeMergedCandidate.definition.consciousGuidance.0.statement"),
          source.definition.actionNorms[0].response.statement);
        return changeSet([ops[1]]);
      }
      return consistentReview();
    });
    const result = await generateCharacterSemanticMigration({
      attempt: input, provider: script.provider, availableCapabilities: input.compilerCapabilities.required,
    });
    assert.equal(result.status, "awaiting_owner_acceptance", JSON.stringify(result.findings));
    assert.equal(script.calls.length, 4);
    assert.equal(result.activated, false);
    const replay = await generateCharacterSemanticMigration({
      attempt: input, provider: async () => { throw new Error("No replay call"); },
      availableCapabilities: input.compilerCapabilities.required,
    });
    assert.deepEqual(replay.candidate, result.candidate);
    assert.ok(replay.requests.every((entry) => entry.status === "received" && entry.replayed));
  });

  it("v4 preserves an uncorroborated review claim without letting it drive repair", async () => {
    const input = versionedAttempt("v4-unverified-review", CHARACTER_MIGRATION_PROMPT_V4);
    const operations = migratedOperations(input);
    const script = scriptedProvider((_, index) => {
      if (index === 0) return changeSet(operations);
      return { ...consistentReview(), verdict: "repair_required", findings: [{
        code: "fallback_missing", targetPaths: ["definition.mechanicalConflictFallbacks"],
        sourcePaths: ["definition.actionNorms.0.response.fallbackActionRef"],
        semanticDependants: [], explanation: "The fallback is missing.",
      }] };
    });
    const result = await generateCharacterSemanticMigration({
      attempt: input, provider: script.provider, availableCapabilities: input.compilerCapabilities.required,
    });
    assert.equal(result.status, "review_required");
    assert.equal(script.calls.length, 2, "an unverified claim must not trigger semantic_repair");
    assert.deepEqual(result.candidate?.definition.mechanicalConflictFallbacks[0].orderedActionRefs,
      [source.definition.capabilities.basicAction.id]);
    assert.ok(result.findings.some((finding) => finding.code === "review_claim_unverified"));
    assert.ok(result.uncertainties.some((entry) => entry.includes("did not authorize repair")));
    assert.ok(result.repairClosure.includes("definition.mechanicalConflictFallbacks"));
  });

  it("v4 keeps review-expanded closure while a server finding drives repair", async () => {
    const input = versionedAttempt("v4-grounded-review", CHARACTER_MIGRATION_PROMPT_V4);
    const operations = migratedOperations(input);
    const script = scriptedProvider((call, index) => {
      if (index === 0) return changeSet([operations[0]]);
      if (index === 1) return { ...consistentReview(), verdict: "repair_required", findings: [{
        code: "fallback_missing", targetPaths: ["definition.mechanicalConflictFallbacks"],
        sourcePaths: ["definition.actionNorms.0.response.fallbackActionRef"],
        semanticDependants: ["definition.consciousGuidance"],
        explanation: "The source fallback is not represented.",
      }] };
      if (index === 2) {
        assert.equal(call.kind, "semantic_repair");
        const errors = migrationRead(call.input, "errors");
        assert.ok(Array.isArray(errors));
        assert.ok(errors.some((finding) => migrationRead(finding, "code") === "fallback_not_accounted"));
        const closure = migrationRead(call.input, "repairClosure");
        assert.ok(Array.isArray(closure));
        assert.ok(closure.includes("definition.consciousGuidance"));
        return changeSet([operations[1]]);
      }
      return consistentReview();
    });
    const result = await generateCharacterSemanticMigration({
      attempt: input, provider: script.provider, availableCapabilities: input.compilerCapabilities.required,
    });
    assert.equal(result.status, "awaiting_owner_acceptance", JSON.stringify(result.findings));
    assert.equal(script.calls.length, 4);
  });

  it("versions corrected grammar without changing historical v1 payload construction", () => {
    const current = attempt("versioned-schema");
    const payload = (input: CharacterSemanticMigrationAttemptV1) => {
      const context = createCharacterMigrationContext(input);
      return characterMigrationProviderPayload({ context, state: initialCharacterMigrationMerge(context),
        kind: "initial_generation", findings: [], repairClosure: [] });
    };
    const old = { ...current, promptIdentity: "character-semantic-migration-prompt-v1" };
    assert.throws(() => assertXaiResponseSchema(payload(old).responseSchema), /circular reference/);
    assert.doesNotThrow(() => assertXaiResponseSchema(payload(current).responseSchema));
    assert.notDeepEqual(payload(old).responseSchema, payload(current).responseSchema);
    assert.throws(() => assertXaiResponseSchema(migrationRead(payload(old).input, "targetDefinitionSchema")),
      /circular reference/);
    assert.doesNotThrow(() => assertXaiResponseSchema(migrationRead(payload(current).input, "targetDefinitionSchema")));
  });
  it("splits a selectorless principle and fallback, preserves history and replays without calls", async () => {
    const input = attempt("b5-success");
    const script = scriptedProvider((_, index) =>
      index === 0 ? changeSet(migratedOperations(input)) : consistentReview());
    const before = await getCurrentAssetGeneration("character", sheet.id);
    const result = await generateCharacterSemanticMigration({
      attempt: input, provider: script.provider, availableCapabilities: input.compilerCapabilities.required,
    });
    assert.equal(result.status, "awaiting_owner_acceptance", JSON.stringify(result.findings));
    assert.equal(result.activated, false);
    assert.equal(script.calls.length, 2);
    assert.equal(result.candidate?.definition.actionNorms.length, 0);
    assert.equal(result.candidate?.definition.consciousGuidance.length, 1);
    assert.equal(result.candidate?.definition.mechanicalConflictFallbacks.length, 1);
    assert.deepEqual(result.preservationEntries[0]?.value, source.definition.actionNorms);
    assert.ok(result.ownerDiff.some((entry) => entry.category === "unchanged"));
    assert.deepEqual(result.candidate?.publicPresentation, source.publicPresentation);
    assert.deepEqual(await getCurrentAssetGeneration("character", sheet.id), before);
    const stored = await loadCharacterSemanticMigrationWork(input);
    assert.equal(stored?.requests[0].receipt?.outcome, "succeeded");
    const saved = stored?.requests[0].receipt;
    assert.ok(saved?.outcome === "succeeded");
    const context = createCharacterMigrationContext(input);
    const merged = mergeCharacterMigrationChangeSet({
      context, previous: initialCharacterMigrationMerge(context),
      changeSet: CharacterSemanticMigrationChangeSetV1Schema.parse(saved.response),
      providerRequestId: script.calls[0].providerRequestId, repairClosure: null,
    });
    carryCharacterMigrationDisclosure(context, merged);
    const payload = characterMigrationProviderPayload({
      context, state: merged, kind: "semantic_review", findings: [], repairClosure: [],
    });
    assert.deepEqual(payload.input, script.calls[1].input, "stored response must reconstruct exact review input");
    assert.equal(assetContentDigest({ providerRoute: input.providerRoute,
      modelIdentity: input.modelIdentity, kind: "semantic_review", payload }),
    stored?.requests[1].request.requestDigest, "review digest round trip");
    const replay = await generateCharacterSemanticMigration({
      attempt: input, provider: async () => { throw new Error("must not call"); },
      availableCapabilities: input.compilerCapabilities.required,
    });
    assert.deepEqual(replay.candidate, result.candidate);
    assert.equal(replay.status, result.status);
    assert.equal(replay.requests.length, 2);
    assert.ok(replay.requests.every((request) => request.status === "received" && request.replayed));
  });

  it("repairs schema-valid semantic dependants and reruns the complete independent review", async () => {
    const input = attempt("b5-semantic-repair");
    const initial = migratedOperations(input);
    const script = scriptedProvider((call, index) => {
      if (index === 0) return changeSet(initial);
      if (index === 1) return { ...consistentReview(), verdict: "repair_required", findings: [{
        code: "priority_mismatch", targetPaths: ["definition.consciousGuidance.0.priority"],
        sourcePaths: ["definition.actionNorms.0.priority"],
        explanation: "方針を調整するとfallbackの優先順位も合わせる必要がある。",
        semanticDependants: ["definition.mechanicalConflictFallbacks.0.priority"],
      }] };
      if (index === 2) {
        assert.equal(call.kind, "semantic_repair");
        const data = CharacterMigrationJsonSchema.parse(call.input);
        assert.ok(migrationRead(data, "errors"));
        assert.ok(migrationRead(data, "causes"));
        return changeSet([
          operation("definition.consciousGuidance.0.priority", 55),
          operation("definition.mechanicalConflictFallbacks.0.priority", 55),
        ]);
      }
      assert.equal(call.kind, "semantic_rereview");
      assert.equal(migrationRead(call.input, "completeMergedCandidate.definition.consciousGuidance.0.priority"), 55);
      assert.equal(migrationRead(call.input, "errors"), undefined);
      assert.equal(migrationRead(call.input, "causes"), undefined);
      assert.ok(migrationRead(call.input, "frozenSource"));
      return consistentReview();
    });
    const result = await generateCharacterSemanticMigration({
      attempt: input, provider: script.provider, availableCapabilities: input.compilerCapabilities.required,
    });
    assert.equal(result.status, "awaiting_owner_acceptance", JSON.stringify(result.findings));
    assert.equal(result.candidate?.definition.mechanicalConflictFallbacks[0].priority, 55);
    assert.equal(script.calls.length, 4);
  });

  it("repairs a structural error even when the reviewer incorrectly says consistent", async () => {
    const input = attempt("b5-structural");
    const ops = migratedOperations(input);
    const script = scriptedProvider((_, index) => {
      if (index === 0) return changeSet([ops[0]]);
      if (index === 2) return changeSet([ops[1]]);
      return consistentReview();
    });
    const result = await generateCharacterSemanticMigration({
      attempt: input, provider: script.provider, availableCapabilities: input.compilerCapabilities.required,
    });
    assert.equal(result.status, "awaiting_owner_acceptance", JSON.stringify(result.findings));
    assert.equal(script.calls.length, 4);
  });

  it("keeps valid operations when a sibling violates the response schema", async () => {
    const input = attempt("b5-partial-response");
    const ops = migratedOperations(input);
    const script = scriptedProvider((call, index) => {
      if (index === 0) return {
        schema: CHARACTER_SEMANTIC_MIGRATION_RESPONSE_SCHEMA_V1,
        operations: [ops[0], { ...ops[1], explanation: null }], uncertainties: [],
      };
      if (index === 2) {
        assert.equal(migrationRead(call.input, "completeMergedCandidate.definition.consciousGuidance.0.statement"),
          source.definition.actionNorms[0].response.statement);
        return changeSet([ops[1]]);
      }
      return consistentReview();
    });
    const result = await generateCharacterSemanticMigration({
      attempt: input, provider: script.provider, availableCapabilities: input.compilerCapabilities.required,
    });
    assert.equal(result.status, "awaiting_owner_acceptance", JSON.stringify(result.findings));
    assert.equal(script.calls.length, 4);
    const replay = await generateCharacterSemanticMigration({
      attempt: input, provider: async () => { throw new Error("replay must not call"); },
      availableCapabilities: input.compilerCapabilities.required,
    });
    assert.deepEqual(replay.candidate, result.candidate);
    assert.equal(replay.requests.length, 4);
  });

  it("rejects non-ready/missing-state input before requesting the provider", async () => {
    await query("UPDATE character_asset_states SET compatibility_status = 'unsupported' WHERE character_id=$1",
      [sheet.id]);
    try {
      let calls = 0;
      const input = attempt("b5-not-ready");
      await assert.rejects(generateCharacterSemanticMigration({
        attempt: input, availableCapabilities: input.compilerCapabilities.required,
        provider: async () => { calls += 1; throw new Error("not allowed"); },
      }), /SOURCE_NOT_READY/);
      assert.equal(calls, 0);
      assert.equal((await loadCharacterSemanticMigrationWork(input))?.requests.length, 0);
    } finally {
      await query("UPDATE character_asset_states SET compatibility_status = 'ready' WHERE character_id=$1", [sheet.id]);
    }
  });

  it("stops after two failed repairs and exactly six distinct receipted requests", async () => {
    const result = await run("b5-limit", (_, index) =>
      index % 2 === 0 ? changeSet([]) : consistentReview());
    assert.equal(result.result.status, "review_required");
    assert.equal(result.calls.length, 6);
    assert.equal(new Set(result.calls.map((call) => call.providerRequestId)).size, 6);
    const work = await loadCharacterSemanticMigrationWork(result.input);
    assert.equal(work?.requests.length, 6);
    assert.ok(work?.requests.every((entry) => entry.receipt?.outcome === "succeeded"));
  });

  it("does not resend a request with an ambiguous transport outcome", async () => {
    const input = attempt("b5-pending");
    let calls = 0;
    const provider: CharacterMigrationProvider = async () => {
      calls += 1; throw new Error("transport interrupted after possible acceptance");
    };
    for (let index = 0; index < 2; index += 1) {
      const result = await generateCharacterSemanticMigration({
        attempt: input, provider, availableCapabilities: input.compilerCapabilities.required,
      });
      assert.equal(result.status, "pending");
    }
    assert.equal(calls, 1);
  });

  it("records explicit provider failure/accounting and does not retry it automatically", async () => {
    const input = attempt("b5-provider-failed");
    const result = await generateCharacterSemanticMigration({
      attempt: input, availableCapabilities: input.compilerCapabilities.required,
      provider: async () => CharacterSemanticMigrationProviderReceiptV1Schema.parse({
        outcome: "failed", failureCode: "PROVIDER_REFUSED", failureDetail: null,
        accounting: { inputTokens: 12, outputTokens: 0, totalTokens: 12,
          estimatedCostUsd: null, elapsedMs: 3 },
        finishedAt: "2026-09-10T09:00:01.000Z",
      }),
    });
    assert.equal(result.status, "provider_failed");
    const work = await loadCharacterSemanticMigrationWork(input);
    assert.equal(work?.requests[0].receipt?.accounting.inputTokens, 12);
    assert.equal(work?.requests.length, 1);
  });

  it("routes malformed review output into bounded repair rather than treating it as approval", async () => {
    const input = attempt("b5-review-invalid");
    const result = await run(input.migrationAttemptId, (_, index) =>
      index % 2 === 0 ? changeSet(migratedOperations(input)) : { verdict: "consistent" });
    assert.equal(result.result.status, "review_required");
    assert.ok(result.result.findings.some((finding) => finding.code === "review_schema_invalid"));
    assert.equal(result.calls.length, 6);
  });

  it("reports unavailable required compilers without inventing support or paying for repairs", async () => {
    const input = attempt("b5-capability");
    const script = scriptedProvider((_, index) =>
      index === 0 ? changeSet(migratedOperations(input)) : consistentReview());
    const result = await generateCharacterSemanticMigration({
      attempt: input, provider: script.provider, availableCapabilities: [],
    });
    assert.equal(result.status, "review_required");
    assert.equal(result.compatibility?.status, "blocked");
    assert.equal(script.calls.length, 2);
  });
});

describe("B5 structural operation boundary", () => {
  function merge(id: string, extra: CharacterSemanticMigrationOperationV1[]) {
    const context = createCharacterMigrationContext(attempt(id));
    const state = mergeCharacterMigrationChangeSet({
      context, previous: initialCharacterMigrationMerge(context),
      changeSet: changeSet([...migratedOperations(context.attempt), ...extra]),
      providerRequestId: "local-request", repairClosure: null,
    });
    return { context, state, validation: validateCharacterMigrationCandidate({
      context, state, availableCapabilities: context.attempt.compilerCapabilities.required,
    }) };
  }

  it("rejects invented IDs, mechanics, unsafe targets and concealed source removal", () => {
    const id = merge("ids", [operation("definition.identity.names", [{
      id: "invented", kind: "nickname", value: "炎", description: null,
    }], { sourcePaths: ["definition.identity.names"] })]);
    assert.ok(id.validation.findings.some((finding) => finding.code === "unregistered_stable_id"));
    const mechanics = merge("mechanics", [operation("definition.capabilities.basicAction.mechanics.power", 3,
      { sourcePaths: ["definition.capabilities.basicAction.mechanics.power"] })]);
    assert.ok(mechanics.validation.findings.some((finding) => finding.code === "mechanics_not_authorized"));
    const paths = merge("unsafe", [operation("definition.runtimeFacts", [],
      { sourcePaths: ["not.registered"] })]);
    assert.ok(paths.validation.findings.some((finding) => finding.code === "operation_path_invalid"));
    const context = createCharacterMigrationContext(attempt("coverage"));
    const state = initialCharacterMigrationMerge(context);
    const validation = validateCharacterMigrationCandidate({
      context, state, availableCapabilities: context.attempt.compilerCapabilities.required,
    });
    assert.ok(validation.findings.some((finding) => finding.code === "source_not_accounted"));
  });

  it("versions pre-apply fragment rejection without changing consumed V3 merge semantics", () => {
    function repairedState(id: string, promptIdentity: string) {
      const input = versionedAttempt(id, promptIdentity);
      const context = createCharacterMigrationContext(input);
      const previous = mergeCharacterMigrationChangeSet({
        context, previous: initialCharacterMigrationMerge(context),
        changeSet: changeSet(migratedOperations(input)),
        providerRequestId: `${id}-initial`, repairClosure: null,
      });
      const next = mergeCharacterMigrationChangeSet({
        context, previous, providerRequestId: `${id}-repair`, repairClosure: null,
        changeSet: changeSet([
          operation("definition.mechanicalConflictFallbacks.0.orderedActionRefs", null, {
            sourcePaths: ["definition.actionNorms.0.response.fallbackActionRef"],
            semanticDependants: ["definition.mechanicalConflictFallbacks.0"],
          }),
          operation("definition.consciousGuidance.0.priority", 55, {
            sourcePaths: ["definition.actionNorms.0.priority"],
          }),
        ]),
      });
      return { context, next };
    }

    const legacy = repairedState("v3-fragment-replay", CHARACTER_MIGRATION_PROMPT_V3);
    assert.equal(migrationRead(legacy.next.candidate,
      "definition.mechanicalConflictFallbacks.0.orderedActionRefs"), null);
    assert.equal(validateCharacterMigrationCandidate({
      context: legacy.context, state: legacy.next,
      availableCapabilities: legacy.context.attempt.compilerCapabilities.required,
    }).candidate, null);

    const guarded = repairedState("v4-fragment-guard", CHARACTER_MIGRATION_PROMPT_V4);
    assert.deepEqual(migrationRead(guarded.next.candidate,
      "definition.mechanicalConflictFallbacks.0.orderedActionRefs"),
    [source.definition.capabilities.basicAction.id]);
    assert.equal(migrationRead(guarded.next.candidate,
      "definition.consciousGuidance.0.priority"), 55);
    assert.ok(guarded.next.findings.some((finding) =>
      finding.code === "operation_fragment_schema_invalid" &&
      finding.targetPaths.includes("definition.mechanicalConflictFallbacks.0.orderedActionRefs")));
    assert.equal(guarded.next.operations.some((entry) =>
      entry.targetPath === "definition.mechanicalConflictFallbacks.0.orderedActionRefs" &&
      entry.value === null), false);
    const repairPayload = characterMigrationProviderPayload({
      context: guarded.context, state: guarded.next, kind: "semantic_repair",
      findings: guarded.next.findings,
      repairClosure: ["definition.mechanicalConflictFallbacks"],
    });
    const errors = migrationRead(repairPayload.input, "errors");
    assert.ok(Array.isArray(errors));
    assert.ok(errors.some((finding) =>
      migrationRead(finding, "code") === "operation_fragment_schema_invalid"));
    assert.deepEqual(migrationRead(repairPayload.input,
      "completeMergedCandidate.definition.mechanicalConflictFallbacks.0.orderedActionRefs"),
    [source.definition.capabilities.basicAction.id]);
    assert.match(repairPayload.system, /invalid operation is rejected without replacing the prior valid fragment/i);

    const legacyPayload = characterMigrationProviderPayload({
      context: legacy.context, state: legacy.next, kind: "semantic_repair",
      findings: legacy.next.findings,
      repairClosure: ["definition.mechanicalConflictFallbacks"],
    });
    assert.doesNotMatch(legacyPayload.system,
      /invalid operation is rejected without replacing the prior valid fragment/i);
  });

  it("supports verbatim copy/move, explicit retirement and optional deferred values", () => {
    const result = merge("operations", [
      operation("definition.identity.displayName", null, { operation: "copy",
        sourcePaths: ["definition.identity.displayName"], provenance: "unchanged" }),
      operation("definition.speechPolicy.register", null, { operation: "move",
        sourcePaths: ["definition.actionNorms.0.response.statement"] }),
      operation("definition.actionNorms.0.response.fallbackActionRef", null, { operation: "retire_to_capsule",
        sourcePaths: ["definition.actionNorms.0.response.fallbackActionRef"], provenance: "retired" }),
    ]);
    assert.equal(migrationRead(result.state.candidate, "definition.speechPolicy.register"),
      source.definition.actionNorms[0].response.statement);
    const context = result.context;
    const deferred = mergeCharacterMigrationChangeSet({
      context, previous: result.state, providerRequestId: "defer", repairClosure: null,
      changeSet: changeSet([operation("definition.expressionNotes", null, {
        operation: "defer", sourcePaths: ["definition.expressionNotes"], provenance: "deferred",
        deferred: { targetPath: "definition.expressionNotes", reason: "次の表現生成で検討",
          candidateSourcePaths: ["definition.expressionNotes"],
          requiringCapability: { consumer: "character-image-brief", version: 2 } },
      })]),
    });
    const validation = validateCharacterMigrationCandidate({
      context, state: deferred, availableCapabilities: context.attempt.compilerCapabilities.required,
    });
    assert.equal(validation.compatibility?.status, "ready");
    assert.ok(validation.compatibility?.deferred.some((entry) =>
      entry.capability.consumer === "character-image-brief"));
  });

  it("does not allow private input to widen public text or consumer access", () => {
    const result = merge("disclosure", [operation("definition.appearance.publicSummary", "秘密の過去",
      { sourcePaths: ["definition.psycheDisposition"] })]);
    assert.ok(result.validation.findings.some((finding) => finding.code === "disclosure_ceiling_exceeded"));
    const context = createCharacterMigrationContext(attempt("tags"));
    const state = initialCharacterMigrationMerge(context);
    migrationWrite(state.candidate, "definition.expressionNotes",
      { text: "秘密", consumerTags: ["narrator-external"], sourceSupportRefs: [] });
    const validation = validateCharacterMigrationCandidate({
      context, state, availableCapabilities: context.attempt.compilerCapabilities.required,
    });
    assert.ok(validation.findings.some((finding) => finding.code === "consumer_access_widened"));
  });

  it("v4 carries exact public text per leaf without treating private awareness as a grant", () => {
    function migratedRules(promptIdentity: string) {
      const input = versionedAttempt(`disclosure-${promptIdentity}`, promptIdentity);
      const context = createCharacterMigrationContext(input);
      const state = mergeCharacterMigrationChangeSet({
        context, previous: initialCharacterMigrationMerge(context),
        changeSet: changeSet(migratedOperations(input)), providerRequestId: "disclosure-request",
        repairClosure: null,
      });
      carryCharacterMigrationDisclosure(context, state);
      return migrationRead(state.candidate, "disclosurePolicy.rules");
    }
    const legacy = migratedRules(CHARACTER_MIGRATION_PROMPT_V3);
    const guarded = migratedRules(CHARACTER_MIGRATION_PROMPT_V4);
    assert.ok(Array.isArray(legacy));
    assert.ok(Array.isArray(guarded));
    assert.equal(legacy.some((rule) =>
      migrationRead(rule, "valuePath") === "consciousGuidance.0.statement"), false);
    assert.equal(guarded.filter((rule) =>
      migrationRead(rule, "valuePath") === "consciousGuidance.0.statement").length, 3);
    assert.equal(guarded.some((rule) => {
      const valuePath = migrationRead(rule, "valuePath");
      return typeof valuePath === "string" && valuePath.includes("selfAwareness");
    }), false);
  });

  it("v4 detects missing executable norms and cross-norm repair provenance", () => {
    const base = attempt("executable-lineage");
    const content = CharacterGenerationEnvelopeV2Schema.parse({
      ...source,
      definition: {
        ...source.definition,
        actionNorms: [
          { ...source.definition.actionNorms[0], id: "attack-norm", priority: 60,
            response: { ...source.definition.actionNorms[0].response,
              actionRefs: [source.definition.capabilities.basicAction.id], fallbackActionRef: null } },
          { ...source.definition.actionNorms[0], id: "defend-norm", priority: 40,
            response: { ...source.definition.actionNorms[0].response,
              actionKinds: ["defend"], fallbackActionRef: null } },
        ],
      },
    });
    const updated = {
      ...base, sourceContent: content, sourceContentDigest: assetContentDigest(content),
      promptIdentity: CHARACTER_MIGRATION_PROMPT_V4,
    };
    const input = { ...updated,
      initialRequestDigest: characterSemanticMigrationInitialRequestDigest(updated) };
    const context = createCharacterMigrationContext(input);
    const empty = initialCharacterMigrationMerge(context);
    const emptyValidation = validateCharacterMigrationCandidate({
      context, state: empty, availableCapabilities: input.compilerCapabilities.required,
    });
    assert.ok(emptyValidation.findings.some((finding) =>
      finding.code === "executable_action_norm_missing"));

    const norms = content.definition.actionNorms.map((norm, index) => ({
      id: context.allocatedIds["definition.actionNorms"][index],
      when: norm.when,
      response: { disposition: norm.response.disposition, actionRefs: norm.response.actionRefs,
        actionKinds: norm.response.actionKinds, tacticTags: norm.response.tacticTags },
      priority: norm.priority, force: norm.force, exceptions: norm.exceptions,
      description: norm.description,
    }));
    const migrated = mergeCharacterMigrationChangeSet({
      context, previous: empty, providerRequestId: "lineage-initial", repairClosure: null,
      changeSet: changeSet([operation("definition.actionNorms", norms, {
        sourcePaths: ["definition.actionNorms"],
      })]),
    });
    const rebased = mergeCharacterMigrationChangeSet({
      context, previous: migrated, providerRequestId: "lineage-repair", repairClosure: null,
      changeSet: changeSet([operation("definition.actionNorms.1.priority", 60, {
        sourcePaths: ["definition.actionNorms.0.priority"],
      })]),
    });
    const validation = validateCharacterMigrationCandidate({
      context, state: rebased, availableCapabilities: input.compilerCapabilities.required,
    });
    assert.ok(validation.findings.some((finding) =>
      finding.code === "executable_action_norm_source_mismatch" &&
      finding.targetPaths.includes("definition.actionNorms.1.priority")));
  });

  it("synthesizes new private structured content with server IDs and explicit model-created provenance", () => {
    const input = attempt("new-content");
    const context = createCharacterMigrationContext(input);
    const result = merge(input.migrationAttemptId, [operation("definition.profileBackground", [{
      id: context.allocatedIds["definition.profileBackground"][0],
      kind: "other", summary: "新たな背景案", selfAwareness: "aware",
      description: { text: "灯火を守る使命を新しい背景として提案する。",
        consumerTags: [], sourceSupportRefs: [] },
    }], { operation: "synthesize", sourcePaths: [], provenance: "model_created" })]);
    assert.deepEqual(result.validation.findings, []);
    assert.equal(result.validation.candidate?.definition.profileBackground.length, 1);
  });

  it("does not let a deferred field evade its required consumers", () => {
    const result = merge("defer-scope", []);
    const context = result.context;
    const deferred = mergeCharacterMigrationChangeSet({
      context, previous: result.state, providerRequestId: "defer-scope", repairClosure: null,
      changeSet: changeSet([operation("definition.actionNorms", null, {
        operation: "defer", provenance: "deferred",
        deferred: { targetPath: "definition.actionNorms", reason: "後で補完",
          candidateSourcePaths: [], requiringCapability: { consumer: "character-image-brief", version: 2 } },
      })]),
    });
    const validation = validateCharacterMigrationCandidate({
      context, state: deferred, availableCapabilities: context.attempt.compilerCapabilities.required,
    });
    assert.ok(validation.findings.some((finding) => finding.code === "deferred_capability_mismatch"));
    assert.equal(validation.compatibility?.status, "blocked");
  });

  it("supports move/retire at nullable slots without retaining an active duplicate", () => {
    const input = attempt("nullable");
    const content = CharacterGenerationEnvelopeV2Schema.parse({
      ...source, definition: { ...source.definition, expressionNotes: {
        text: "短い発話を好む", consumerTags: [], sourceSupportRefs: [],
      } },
    });
    const context = createCharacterMigrationContext({ ...input, sourceContent: content });
    const initial = initialCharacterMigrationMerge(context);
    const moved = mergeCharacterMigrationChangeSet({
      context, previous: initial, providerRequestId: "move-nullable", repairClosure: null,
      changeSet: changeSet([operation("definition.speechPolicy.description", null, {
        operation: "move", sourcePaths: ["definition.expressionNotes"],
      })]),
    });
    assert.equal(migrationRead(moved.candidate, "definition.expressionNotes"), null);
    assert.deepEqual(migrationRead(moved.candidate, "definition.speechPolicy.description"), content.definition.expressionNotes);
    const retired = mergeCharacterMigrationChangeSet({
      context, previous: initial, providerRequestId: "retire-nullable", repairClosure: null,
      changeSet: changeSet([operation("definition.expressionNotes", null, {
        operation: "retire_to_capsule", sourcePaths: ["definition.expressionNotes"], provenance: "retired",
      })]),
    });
    assert.equal(migrationRead(retired.candidate, "definition.expressionNotes"), null);
  });

  it("resolves name/support references instead of treating arbitrary strings as proof", () => {
    const result = merge("refs", [
      operation("definition.speechPolicy.selfReferenceNameId", "invented-name", {
        sourcePaths: ["definition.speechPolicy.selfReferenceNameId"],
      }),
      operation("definition.expressionNotes", {
        text: "根拠付きという申告", consumerTags: [], sourceSupportRefs: ["invented-evidence"],
      }, { sourcePaths: ["definition.expressionNotes"] }),
    ]);
    assert.ok(result.validation.findings.some((finding) => finding.code === "unknown_name_reference"));
    assert.ok(result.validation.findings.some((finding) => finding.code === "unregistered_support_reference"));
  });
});
