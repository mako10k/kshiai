import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CharacterMigrationPathSchema, CharacterSemanticMigrationOperationV1Schema,
  CharacterSemanticMigrationChangeSetV1Schema, CharacterSemanticConsistencyReviewV1Schema,
} from "./character-semantic-change-set.js";

const base = {
  operation: "synthesize", targetPath: "definition.consciousGuidance",
  sourcePaths: [], value: [], deferred: null, explanation: "明示した新規内容",
  provenance: "model_created", semanticDependants: [],
};

describe("semantic migration response contracts", () => {
  it("requires explicit provenance and does not accept invented operation/control fields", () => {
    assert.ok(CharacterSemanticMigrationOperationV1Schema.safeParse(base).success);
    assert.equal(CharacterSemanticMigrationOperationV1Schema.safeParse({
      ...base, provenance: "source_derived",
    }).success, false);
    assert.equal(CharacterSemanticMigrationOperationV1Schema.safeParse({
      ...base, operationId: "invented-control",
    }).success, false);
    assert.equal(CharacterSemanticMigrationOperationV1Schema.safeParse({
      ...base, operation: "patch_anything",
    }).success, false);
  });
  it("rejects prototype traversal and JSON pointers outside the registered path grammar", () => {
    for (const path of ["definition.__proto__.secret", "definition.constructor",
      "../definition", "/definition/actionNorms", "definition[0]"]) {
      assert.equal(CharacterMigrationPathSchema.safeParse(path).success, false);
    }
    assert.ok(CharacterMigrationPathSchema.safeParse("definition.consciousGuidance.0.statement").success);
  });
  it("requires copy/move values to come from source instead of trusting an echoed value", () => {
    const copy = { ...base, operation: "copy", provenance: "unchanged",
      targetPath: "definition.identity.displayName",
      sourcePaths: ["definition.identity.displayName"], value: null };
    assert.ok(CharacterSemanticMigrationOperationV1Schema.safeParse(copy).success);
    assert.equal(CharacterSemanticMigrationOperationV1Schema.safeParse({ ...copy, value: "replacement" }).success, false);
  });
  it("can defer a genuinely new field without inventing a source", () => {
    assert.ok(CharacterSemanticMigrationOperationV1Schema.safeParse({
      ...base, operation: "defer", value: null, provenance: "deferred",
      deferred: { targetPath: base.targetPath, reason: "利用時に補完",
        candidateSourcePaths: [], requiringCapability: { consumer: "character-conscious-self", version: 3 } },
    }).success);
  });
  it("bounds the number of operations and requires an honest consistent verdict", () => {
    assert.equal(CharacterSemanticMigrationChangeSetV1Schema.safeParse({
      schema: "character_semantic_migration_change_set_v1",
      operations: Array.from({ length: 129 }, () => base), uncertainties: [],
    }).success, false);
    assert.equal(CharacterSemanticConsistencyReviewV1Schema.safeParse({
      schema: "character_semantic_consistency_review_v1", verdict: "repair_required",
      findings: [], summary: "修正", uncertainties: [],
    }).success, false);
    assert.equal(CharacterSemanticConsistencyReviewV1Schema.safeParse({
      schema: "character_semantic_consistency_review_v1", verdict: "consistent", findings: [],
      summary: "整合", uncertainties: [], chainOfThought: "not permitted",
    }).success, false);
  });
});
