import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CharacterDefinitionV3Schema, CharacterGenerationEnvelopeV3Schema } from "./character-definition-v3.js";
import { createV3StageTrialCandidate } from "./v3-stage-trial-candidate.js";
import {
  compileV3StageTrialSecondCandidate,
  createV3StageTrialSecondCandidate,
} from "./v3-stage-trial-second-candidate.js";

describe("second original V3 Stage trial candidate", () => {
  it("is a structurally valid, meaningfully distinct V3 envelope", () => {
    const envelope = createV3StageTrialSecondCandidate();
    const first = createV3StageTrialCandidate();
    assert.equal(CharacterGenerationEnvelopeV3Schema.safeParse(envelope).success, true);
    assert.equal(envelope.definition.identity.displayName, "潮騒の記録士・リオ");
    assert.notEqual(envelope.definition.identity.displayName, first.definition.identity.displayName);
    assert.notDeepEqual(envelope.definition.psycheDisposition.dynamics, first.definition.psycheDisposition.dynamics);
    assert.notDeepEqual(envelope.definition.actionNorms[0]?.when, first.definition.actionNorms[0]?.when);
    assert.equal(envelope.definition.actionNorms.length, 2);
    assert.equal(envelope.definition.consciousGuidance.length, 1);
    assert.equal(envelope.definition.mechanicalConflictFallbacks.length, 1);
    assert.equal(envelope.definition.capabilities.skills.length, 2);
    assert.equal(envelope.compilerCompatibility.some((entry) => entry.consumer === "battle-mechanics" && entry.version === 3), true);
    assert.equal(envelope.publicPresentation.claimValidation?.segments.length, 2);
    assert.notEqual(envelope.provenance.sourceDigest, "0".repeat(64));
    assert.notEqual(envelope.publicPresentation.projectionDigest, "1".repeat(64));
    assert.notEqual(envelope.publicPresentation.descriptionInputDigest, "2".repeat(64));
    assert.equal(envelope.publicPresentation.description, envelope.publicPresentation.segments.map((segment) => segment.text).join("\n\n"));
  });

  it("compiles V3 semantics and validates V4 compiler inputs", () => {
    const envelope = createV3StageTrialSecondCandidate();
    const compiled = compileV3StageTrialSecondCandidate(envelope.definition);
    assert.equal(compiled.actionNorms.contractVersion, 3);
    assert.equal(compiled.actionNorms.norms.length, 2);
    assert.deepEqual(compiled.actionNorms.norms[0]?.when.clauses, [
      { kind: "observed_event_kind", operator: "is", value: "situation" },
      { kind: "self_condition", operator: "is", value: "steady" },
    ]);
    assert.deepEqual(compiled.actionNorms.norms[1]?.when.clauses, [
      { kind: "self_condition", operator: "is", value: "critical" },
    ]);
    assert.equal(Object.hasOwn(compiled.actionNorms.norms[0]?.response ?? {}, "statement"), false);
    assert.equal(compiled.consciousGuidance.contractVersion, 1);
    assert.equal(compiled.consciousGuidance.entries[0]?.statement.includes("変わった流れ"), true);
    assert.equal(compiled.mechanicalConflictFallbacks.entries[0]?.orderedActionRefs[0], "skill-current-note");
    assert.equal(compiled.compilerInputsV4.actionNorms.contractVersion, 3);
    assert.equal(compiled.compilerInputsV4.consciousSelf.contractVersion, 2);
    assert.equal(compiled.compilerInputsV4.psycheTraits.expressionRestraint, 460);
  });

  it("rejects selectorless norms and unknown fallback actions", () => {
    const definition = createV3StageTrialSecondCandidate().definition;
    assert.equal(CharacterDefinitionV3Schema.safeParse({
      ...definition,
      actionNorms: [{ ...definition.actionNorms[0], response: { ...definition.actionNorms[0].response, actionRefs: [], actionKinds: [], tacticTags: [] } }],
    }).success, false);
    assert.equal(CharacterDefinitionV3Schema.safeParse({
      ...definition,
      mechanicalConflictFallbacks: [{ ...definition.mechanicalConflictFallbacks[0], orderedActionRefs: ["invented-action"] }],
    }).success, false);
  });
});
