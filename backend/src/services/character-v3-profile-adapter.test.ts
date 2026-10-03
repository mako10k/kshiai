import assert from "node:assert/strict";
import { it } from "node:test";
import {
  CharacterDefinitionV2Schema, CharacterGenerationEnvelopeV3Schema,
  CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT, projectCharacterProfileSourceV2,
  projectCharacterProfileSourceV3, type CharacterActionNormV3, type CharacterGenerationEnvelopeV3,
} from "@kshiai/shared";
import { createV3StageTrialCandidate } from "../fixtures/neva-v3.js";
import { v3ToProfileDefinitionV2 } from "./character-v3-profile-adapter.js";
import { assetContentDigest } from "../repositories/asset-generations.js";
import { assertCharacterCandidateReady } from "./character-authoring-candidate.js";

it("preserves restrictive and preference norm values through the V3 profile adapter", () => {
  const definition = createV3StageTrialCandidate().definition;
  const base = definition.actionNorms[0];
  assert.ok(base);
  const norms: CharacterActionNormV3[] = [
    { ...base, force: "constraint", response: { ...base.response, disposition: "forbid" } },
    { ...base, id: "original-preference", force: "commitment", response: { ...base.response, disposition: "avoid" } },
  ];
  const result = v3ToProfileDefinitionV2({ ...definition, actionNorms: norms });
  assert.ok(CharacterDefinitionV2Schema.safeParse(result).success);
  for (const [index, original] of norms.entries()) {
    const projected = result.actionNorms[index];
    assert.ok(projected);
    assert.equal(projected.force, original.force);
    assert.equal(projected.response.disposition, original.response.disposition);
    assert.deepEqual(projected.response.actionRefs, original.response.actionRefs);
    assert.deepEqual(projected.description, original.description);
  }
});

function guidanceCandidate(): CharacterGenerationEnvelopeV3 {
  const envelope = createV3StageTrialCandidate();
  return {
    ...envelope,
    definition: {
      ...envelope.definition,
      consciousGuidance: [{
        id: "keep-distance",
        applicability: { match: "all" as const, clauses: [{ kind: "always" as const, operator: "is" as const, value: "true" }] },
        statement: "見知らぬ相手からは距離を取る",
        priority: 70,
        force: "commitment" as const,
        selfAwareness: "aware" as const,
        exceptions: [],
        description: null,
      }],
    },
  };
}

it("keeps previous profile facts exact when guidance has no explicit public permission", () => {
  const envelope = guidanceCandidate();
  assert.deepEqual(projectCharacterProfileSourceV3(envelope.definition, envelope.disclosurePolicy),
    projectCharacterProfileSourceV2(v3ToProfileDefinitionV2(envelope.definition), envelope.disclosurePolicy));
});

it("projects only explicitly public unconditional guidance statements", () => {
  const envelope = guidanceCandidate();
  const rule = { valuePath: "consciousGuidance.keep-distance.statement", channel: "profile" as const, target: { kind: "public" as const }, prerequisites: [] };
  const publicPolicy = { version: 1 as const, rules: [rule] };
  const projection = projectCharacterProfileSourceV3(envelope.definition, publicPolicy);
  assert.deepEqual(projection.facts.at(-1), { supportRef: rule.valuePath, valuePath: rule.valuePath, text: envelope.definition.consciousGuidance[0]!.statement });
  for (const denied of [
    { ...rule, target: { kind: "owner" as const } },
    { ...rule, channel: "narrator" as const, target: { kind: "narrator" as const, perspective: "omniscient" as const } },
    { ...rule, prerequisites: ["self_aware" as const] },
    { ...rule, valuePath: "consciousGuidance.other.statement" },
  ]) {
    const result = projectCharacterProfileSourceV3(envelope.definition, { version: 1, rules: [denied] });
    assert.equal(result.facts.some((fact) => fact.supportRef === rule.valuePath), false);
  }
});

it("accepts a real V3 candidate with a guidance-backed unchanged public statement", () => {
  const envelope = guidanceCandidate();
  const supportRef = "consciousGuidance.keep-distance.statement";
  const policy = { version: 1 as const, rules: [{ valuePath: supportRef, channel: "profile" as const, target: { kind: "public" as const }, prerequisites: [] }] };
  const projectionDigest = assetContentDigest(projectCharacterProfileSourceV3(envelope.definition, policy));
  const text = envelope.definition.consciousGuidance[0]!.statement;
  const candidate = CharacterGenerationEnvelopeV3Schema.parse({
    ...envelope,
    disclosurePolicy: policy,
    publicPresentation: {
      description: text, projectionContractVersion: 2, projectionDigest,
      descriptionInputDigest: envelope.publicPresentation.descriptionInputDigest,
      segments: [{ id: "preserved-rule", text, kind: "fact", supportRefs: [supportRef] }],
      claimValidation: { contractVersion: 1, validatorContract: CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
        projectionDigest, segments: [{ segmentId: "preserved-rule", verdict: "supported", supportRefs: [supportRef], riskCodes: [] }] },
    },
  });
  assert.doesNotThrow(() => assertCharacterCandidateReady(candidate));
  assert.throws(() => assertCharacterCandidateReady({ ...candidate, disclosurePolicy: { version: 1, rules: [] } }));
});
