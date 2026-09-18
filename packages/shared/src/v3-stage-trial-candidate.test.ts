import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CharacterDefinitionV3Schema,
  CharacterGenerationEnvelopeV3Schema,
} from "./character-definition-v3.js";
import {
  compileV3StageTrialCandidate,
  createV3StageTrialCandidate,
} from "./v3-stage-trial-candidate.js";

describe("new V3 Stage trial candidate", () => {
  it("is a structurally valid envelope with substantive V3 semantics", () => {
    const envelope = createV3StageTrialCandidate();
    assert.equal(CharacterGenerationEnvelopeV3Schema.safeParse(envelope).success, true);
    assert.equal(envelope.definition.identity.displayName, "夜航の灯守・ネヴァ");
    assert.equal(envelope.definition.actionNorms.length, 2);
    assert.equal(envelope.definition.consciousGuidance.length, 1);
    assert.equal(envelope.definition.mechanicalConflictFallbacks.length, 1);
    assert.ok(envelope.definition.psycheDisposition.tendencies.length > 0);
    assert.ok(envelope.definition.capabilities.skills.length >= 2);
    assert.equal(envelope.compilerCompatibility.some((entry) =>
      entry.consumer === "battle-mechanics" && entry.version === 3), true);
    assert.notEqual(envelope.provenance.sourceDigest, "3".repeat(64));
    assert.notEqual(envelope.publicPresentation.projectionDigest, "1".repeat(64));
    assert.notEqual(envelope.publicPresentation.descriptionInputDigest, "2".repeat(64));
    assert.equal(
      envelope.publicPresentation.description,
      envelope.publicPresentation.segments.map((segment) => segment.text).join("\n\n"),
    );
    assert.equal(envelope.publicPresentation.claimValidation?.segments.length, 2);
  });

  it("compiles each V3 semantic program without adding V2-only fields", () => {
    const envelope = createV3StageTrialCandidate();
    const compiled = compileV3StageTrialCandidate(envelope.definition);
    assert.equal(compiled.actionNorms.contractVersion, 3);
    assert.equal(compiled.actionNorms.norms.length, 2);
    assert.equal(Object.hasOwn(compiled.actionNorms.norms[0]?.response ?? {}, "statement"), false);
    assert.equal(compiled.consciousGuidance.contractVersion, 1);
    assert.equal(compiled.consciousGuidance.entries[0]?.statement.includes("帰る余地"), true);
    assert.equal(compiled.mechanicalConflictFallbacks.entries[0]?.orderedActionRefs[0], "skill-wick-guard");
    assert.equal(compiled.compilerInputsV4.actionNorms.contractVersion, 3);
    assert.equal(compiled.compilerInputsV4.consciousSelf.contractVersion, 2);
    assert.equal(compiled.compilerInputsV4.psycheTraits.expressionRestraint, 700);
  });

  it("rejects a selectorless or unreferenced fallback mutation", () => {
    const definition = createV3StageTrialCandidate().definition;
    assert.equal(CharacterDefinitionV3Schema.safeParse({
      ...definition,
      actionNorms: [{
        ...definition.actionNorms[0],
        response: { ...definition.actionNorms[0].response, actionRefs: [], tacticTags: [] },
      }],
    }).success, false);
    assert.equal(CharacterDefinitionV3Schema.safeParse({
      ...definition,
      mechanicalConflictFallbacks: [{
        ...definition.mechanicalConflictFallbacks[0],
        orderedActionRefs: ["invented-action"],
      }],
    }).success, false);
  });
});
