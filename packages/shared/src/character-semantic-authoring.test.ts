import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CharacterProposalPayloadV1Schema,
  bridgeCharacterMigrationOperationV1,
} from "./character-semantic-authoring.js";
import type { CharacterSemanticMigrationOperationV1 } from "./character-semantic-change-set.js";

describe("character authoring proposal payload", () => {
  it("rejects set_portrait and whole-candidate replacement", () => {
    assert.equal(
      CharacterProposalPayloadV1Schema.safeParse({
        kind: "set_portrait",
        value: { mediaId: "m", revisionId: "r" },
      }).success,
      false,
    );
    assert.equal(
      CharacterProposalPayloadV1Schema.safeParse({
        kind: "replace_character",
        value: {},
      }).success,
      false,
    );
  });

  it("admits a focused set_skeleton identity replacement", () => {
    const parsed = CharacterProposalPayloadV1Schema.safeParse({
      kind: "set_skeleton",
      operations: [{
        op: "replace_identity",
        value: {
          displayName: "灯",
          names: [],
          presentation: { form: null, gender: null, ageDescription: null, pronouns: [] },
          tags: [],
        },
      }],
    });
    assert.equal(parsed.success, true);
  });

  it("bridges lossless migration operations and rejects synthesize", () => {
    const copy: CharacterSemanticMigrationOperationV1 = {
      operation: "copy",
      targetPath: "identity.displayName",
      sourcePaths: ["identity.displayName"],
      value: null,
      deferred: null,
      explanation: "Keep the source name.",
      provenance: "unchanged",
      semanticDependants: [],
    };
    const bridged = bridgeCharacterMigrationOperationV1(copy);
    assert.equal(bridged?.kind, "classify_source_disposition");
    if (bridged?.kind !== "classify_source_disposition") {
      assert.fail("copy did not bridge to disposition");
    }
    assert.equal(bridged.decisions[0]?.disposition, "preserve");

    const synthesize: CharacterSemanticMigrationOperationV1 = {
      operation: "synthesize",
      targetPath: "identity.displayName",
      sourcePaths: [],
      value: "新しい名前",
      deferred: null,
      explanation: "Invent a name.",
      provenance: "model_created",
      semanticDependants: [],
    };
    assert.equal(bridgeCharacterMigrationOperationV1(synthesize), null);
  });

  it("rejects duplicate lens finding ids", () => {
    assert.equal(
      CharacterProposalPayloadV1Schema.safeParse({
        kind: "submit_lens_review",
        lens: "compiler",
        findingIds: ["compiler", "compiler"],
        verdict: "pass",
      }).success,
      false,
    );
  });
});
