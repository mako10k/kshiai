// R: Verify V3 public projection and claim readiness preserve disclosure and norm authority.
import assert from "node:assert/strict";
import { it } from "node:test";
import { z } from "zod";
import { schemaNotation } from "./semantic-authoring/adapters/schema-notation.js";
import {
  CharacterDefinitionV2Schema, CharacterGenerationEnvelopeV3Schema,
  CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT, projectCharacterProfileSourceV2,
  projectCharacterProfileSourceV3, type CharacterActionNormV3, type CharacterGenerationEnvelopeV3,
} from "@kshiai/shared";
import { createV3StageTrialCandidate } from "../fixtures/neva-v3.js";
import { v3ToProfileDefinitionV2 } from "./character-v3-profile-adapter.js";
import { assetContentDigest } from "../repositories/asset-generations.js";
import { assertCharacterCandidateReady } from "./character-authoring-candidate.js";

it("compacts schema constraints without changing bounds or confusing enum strings with JSON literals", () => {
  assert.equal(schemaNotation(z.string().min(1).max(120)), "str[1,120]");
  assert.equal(schemaNotation(z.number().int().min(0).max(100)), "int[0,100]");
  assert.equal(schemaNotation(z.enum(["supported", "true", "false", "null", "str", "with space"])),
    'supported|"true"|"false"|"null"|"str"|"with space"');
  assert.ok(schemaNotation(z.string().min(1).regex(/^owner-/)).includes("/^owner-/"));
});

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
  const unsupported = structuredClone(candidate);
  const assessment = unsupported.publicPresentation.claimValidation?.segments[0];
  assert.ok(assessment);
  assessment.verdict = "unsupported";
  assessment.supportRefs = [];
  assessment.riskCodes = ["history_event"];
  // Schema-valid receipts still need semantic support before becoming activatable.
  assert.ok(CharacterGenerationEnvelopeV3Schema.safeParse(unsupported).success);
  assert.throws(() => assertCharacterCandidateReady(unsupported), /PROFILE_UNSUPPORTED_CLAIM/);
  assert.throws(() => assertCharacterCandidateReady({ ...candidate, disclosurePolicy: { version: 1, rules: [] } }));
});

import {
  FocusedCharacterProfileCandidateV1Schema,
  FocusedCharacterCompleteReviewV1Schema,
  startFocusedCharacterProfileV1,
  selectFocusedCharacterProfileWorkV1,
  projectFocusedCharacterProfileWorkV1,
  applyFocusedCharacterProfileGenerationV1,
  applyFocusedCharacterProfileClaimsV1,
  replaceFocusedCharacterProfileDefinitionV1,
  completeFocusedCharacterProfileV1,
} from "./semantic-authoring/adapters/character-profile-work.js";

function focusedProfileFixture() {
  const envelope = createV3StageTrialCandidate();
  const pending = startFocusedCharacterProfileV1({ definition: envelope.definition,
    disclosurePolicy: envelope.disclosurePolicy, mode: "create", attemptId: "focused-profile-attempt",
    sourceDigest: assetContentDigest("owner instruction") });
  const text = envelope.definition.identity.displayName;
  const output = { description: text, assistantMessage: "候補を作成しました。",
    segments: [{ id: "name", text, kind: "fact" as const, supportRefs: ["identity.displayName"] }] };
  const generated = applyFocusedCharacterProfileGenerationV1(pending, output);
  const assessment = { segments: [{ segmentId: "name", verdict: "supported" as const,
    supportRefs: ["identity.displayName"], riskCodes: [] }] };
  return { envelope, pending, generated, output, assessment };
}

it("requires generated profile and independent claim receipt before a complete focused result", () => {
  const { envelope, pending, generated, assessment } = focusedProfileFixture();
  const structural = { compilerCompatibility: envelope.compilerCompatibility,
    definitionReceipt: { contract: "character-compiler-v3" as const,
      definitionDigest: assetContentDigest(envelope.definition) } };
  assert.equal(selectFocusedCharacterProfileWorkV1(pending)?.kind, "profile_generation");
  assert.equal(selectFocusedCharacterProfileWorkV1(generated)?.kind, "profile_claim_validation");
  assert.throws(() => completeFocusedCharacterProfileV1(pending, structural), /CLAIM_RECEIPT_MISSING/);
  assert.throws(() => completeFocusedCharacterProfileV1(generated, structural), /CLAIM_RECEIPT_MISSING/);
  const validated = applyFocusedCharacterProfileClaimsV1(generated, assessment);
  assert.equal(selectFocusedCharacterProfileWorkV1(validated), null);
  const complete = completeFocusedCharacterProfileV1(validated, structural);
  assert.equal(complete.kind, "character_complete_review_v1");
  assert.equal(complete.mode, "create");
  assert.equal(complete.envelope.provenance.attemptId, "focused-profile-attempt");
  assert.equal(complete.candidateDigest, assetContentDigest(complete.envelope));
  assert.equal(complete.definitionReceipt.definitionDigest, assetContentDigest(envelope.definition));
  assert.deepEqual(complete.claimReceipt, complete.envelope.publicPresentation.claimValidation);
  assertCharacterCandidateReady(complete.envelope);
  assert.throws(() => completeFocusedCharacterProfileV1(validated, {
    ...structural, definitionReceipt: { ...structural.definitionReceipt, definitionDigest: "0".repeat(64) },
  }), /COMPLETE_REVIEW_BINDING_MISMATCH/);
  const { claimReceipt: _receipt, ...incomplete } = complete;
  assert.equal(FocusedCharacterCompleteReviewV1Schema.safeParse(incomplete).success, false);
});

it("invalidates both profile products when definition or disclosure changes and preserves unchanged state", () => {
  const { generated, assessment } = focusedProfileFixture();
  const validated = applyFocusedCharacterProfileClaimsV1(generated, assessment);
  const changed = replaceFocusedCharacterProfileDefinitionV1(validated, {
    ...validated.definition, appearance: { ...validated.definition.appearance, publicSummary: "別の服装" },
  });
  assert.equal(changed.profile.status, "pending");
  const restricted = replaceFocusedCharacterProfileDefinitionV1(validated, validated.definition,
    { version: 1, rules: [] });
  assert.equal(restricted.profile.status, "pending");
  assert.deepEqual(replaceFocusedCharacterProfileDefinitionV1(validated, validated.definition), validated);
  assert.equal(FocusedCharacterProfileCandidateV1Schema.safeParse({ ...validated,
    definition: changed.definition }).success, false, "old receipt cannot survive direct definition replacement");
});

it("rejects generated facts without public support and description outside its segments", () => {
  const { pending, output } = focusedProfileFixture();
  assert.throws(() => applyFocusedCharacterProfileGenerationV1(pending, {
    ...output, segments: [{ ...output.segments[0], supportRefs: ["psycheDisposition.hiddenNeed"] }],
  }), /PROFILE_UNKNOWN_SUPPORT/);
  assert.throws(() => applyFocusedCharacterProfileGenerationV1(pending, {
    ...output, description: "unsegmented material claim",
  }), /PROFILE_DESCRIPTION_SEGMENT_MISMATCH/);
  assert.throws(() => applyFocusedCharacterProfileGenerationV1(pending, {
    ...output, claimValidation: { fabricated: true },
  }));
});

it("requires exactly one clean independent assessment of every segment", () => {
  const { generated, assessment } = focusedProfileFixture();
  for (const invalid of [
    { segments: [] },
    { segments: [assessment.segments[0], assessment.segments[0]] },
    { segments: [{ ...assessment.segments[0], segmentId: "other" }] },
    { segments: [{ ...assessment.segments[0], verdict: "unsupported" }] },
    { segments: [{ ...assessment.segments[0], riskCodes: ["hidden_cause"] }] },
    { segments: [{ ...assessment.segments[0], supportRefs: ["private-fact"] }] },
  ]) assert.throws(() => applyFocusedCharacterProfileClaimsV1(generated, invalid));
  const validated = applyFocusedCharacterProfileClaimsV1(generated, assessment);
  assert.equal(validated.profile.status, "validated");
  assert.throws(() => applyFocusedCharacterProfileClaimsV1(validated, assessment), /WORK_PHASE_MISMATCH/);
});

it("gives profile work only approved public facts, with no raw owner source", () => {
  const { pending, generated } = focusedProfileFixture();
  const tone = "TONE_ONLY_PRIVATE_SENTINEL";
  const generation = projectFocusedCharacterProfileWorkV1(pending,
    { kind: "profile_generation", workItemId: "generation" });
  assert.equal(generation.context.includes(tone), false);
  const projected = projectCharacterProfileSourceV3(pending.definition, pending.disclosurePolicy);
  assert.deepEqual(JSON.parse(generation.context), { displayName: projected.displayName, approvedFacts: projected.facts });
  const validation = projectFocusedCharacterProfileWorkV1(generated,
    { kind: "profile_claim_validation", workItemId: "validation" });
  assert.equal(validation.context.includes(tone), false);
  assert.deepEqual(Object.keys(JSON.parse(validation.context)), ["approvedProjection", "candidateProfile"]);
  assert.throws(() => projectFocusedCharacterProfileWorkV1(pending,
    { kind: "profile_claim_validation", workItemId: "wrong" }), /WORK_PHASE_MISMATCH/);
});

it("rejects restored progress whose digest or claim validation no longer matches its inputs", () => {
  const { generated, assessment } = focusedProfileFixture();
  assert.equal(FocusedCharacterProfileCandidateV1Schema.safeParse({ ...generated, source: {
    ...generated.source, sourceDigest: assetContentDigest("another source"),
  } }).success, false);
  assert.equal(FocusedCharacterProfileCandidateV1Schema.safeParse({ ...generated,
    source: { ...generated.source, attemptId: "another-attempt" } }).success, false);
  assert.equal(FocusedCharacterProfileCandidateV1Schema.safeParse({ ...generated,
    source: { ...generated.source, mode: "revise" } }).success, false);
  assert.equal(FocusedCharacterProfileCandidateV1Schema.safeParse({ ...generated,
    disclosurePolicy: { ...generated.disclosurePolicy, rules: [...generated.disclosurePolicy.rules].reverse() },
  }).success, false, "policy rebinding is forbidden even if its public projection is unchanged");
  if (generated.profile.status !== "generated") assert.fail("fixture phase");
  assert.equal(FocusedCharacterProfileCandidateV1Schema.safeParse({ ...generated, profile: {
    ...generated.profile, definitionDigest: "0".repeat(64),
  } }).success, false);
  assert.equal(FocusedCharacterProfileCandidateV1Schema.safeParse({ ...generated, profile: {
    ...generated.profile, presentation: { ...generated.profile.presentation,
      claimValidation: { ...assessment, contractVersion: 1,
        validatorContract: CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
        projectionDigest: generated.profile.presentation.projectionDigest } },
  } }).success, false, "a generation output cannot smuggle the independent receipt");
});


it("preserves structural-only correction sources without inventing profile receipts", async () => {
  const { LegacyCharacterStructuralReviewV1Schema, CharacterReviewCorrectionSourceV1Schema,
    correctionPredecessorDefinition, correctionStructuralSource } = await import(
    "./semantic-authoring/character-review-correction-source.js");
  const envelope = createV3StageTrialCandidate();
  const legacy = LegacyCharacterStructuralReviewV1Schema.parse({
    kind: "legacy_character_structural_review_v1", mode: "create", attemptId: "legacy-attempt",
    sourceDigest: "a".repeat(64), definition: envelope.definition,
    definitionDigest: assetContentDigest(envelope.definition), candidateDigest: "b".repeat(64),
    reconciliationReceiptIdentity: "character-reconciliation-v1",
    compilerReceiptIdentity: "character-compiler-v3", disclosureReceiptIdentity: "character-disclosure-v1",
    disclosurePolicy: envelope.disclosurePolicy, compilerCompatibility: envelope.compilerCompatibility,
  });
  assert.deepEqual(correctionPredecessorDefinition(legacy), envelope.definition);
  assert.equal("profileReceipt" in legacy, false);
  assert.equal("envelope" in legacy, false);
  assert.equal(LegacyCharacterStructuralReviewV1Schema.safeParse({ ...legacy,
    definitionDigest: "c".repeat(64) }).success, false);
  assert.equal(LegacyCharacterStructuralReviewV1Schema.safeParse({ ...legacy,
    claimReceipt: {} }).success, false);
  const correction = CharacterReviewCorrectionSourceV1Schema.parse({
    kind: "review_candidate_correction", predecessorAttemptId: "legacy-attempt",
    predecessorCandidate: legacy, naturalText: "外套を青に", requestedCluster: null,
  });
  assert.throws(() => correctionStructuralSource(correction), /CORRECTION_SCOPE_MISSING/);
  assert.equal(CharacterReviewCorrectionSourceV1Schema.safeParse({ ...correction,
    predecessorAttemptId: "different-attempt" }).success, false);
});
