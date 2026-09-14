import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BattleCharacterAssetBindingV4Schema,
  CharacterBattleCompilerInputsV4Schema,
  CharacterCompilerCapabilityV1Schema,
  CharacterCompilerCapabilitySetV1Schema,
  CharacterDefinitionV2Schema,
  CharacterDefinitionV3Schema,
  CharacterGenerationEnvelopeV3Schema,
  compileCharacterActionNormProgramV3,
  compileCharacterConsciousGuidanceV1,
  compileCharacterMechanicalConflictFallbacksV1,
  compileCharacterPsycheTraitsV1,
  createCharacterGenerationV3BasicAttackSource,
  defaultBasicAttack,
  defaultParameters,
  legacyCharacterSheetToDefinitionV2,
  projectCharacterCompilerCompatibilityV1,
  projectCharacterConsciousSelfV2,
  requireCombatReadyCharacterSheet,
  resolveCharacterMechanicalConflictFallbackV1,
  type CharacterDefinitionV3,
  type CharacterSheet,
} from "./index.js";

function legacySheet(): CharacterSheet {
  return {
    id: "character-v3",
    ownerUserId: "owner",
    displayName: "灯",
    tags: [],
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    appearance: { summary: "赤い外套をまとう", visualPrompt: "red cloak" },
    traits: [],
    parameters: defaultParameters(),
    skills: [],
    basicAttack: defaultBasicAttack(),
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "火を守る旅人。",
  };
}

function definitionV3(): CharacterDefinitionV3 {
  const v2 = legacyCharacterSheetToDefinitionV2(legacySheet());
  const { schemaVersion: _schemaVersion, actionNorms: _actionNorms, ...stable } = v2;
  return CharacterDefinitionV3Schema.parse({
    ...stable,
    schemaVersion: 3,
    actionNorms: [{
      id: "prefer-basic",
      when: {
        match: "all",
        clauses: [{ kind: "always", operator: "is", value: "true" }],
      },
      response: {
        disposition: "prefer",
        actionRefs: [v2.capabilities.basicAction.id],
        actionKinds: [],
        tacticTags: [],
      },
      priority: 50,
      force: "preference",
      exceptions: [],
      description: null,
    }],
    consciousGuidance: [{
      id: "enjoy-battle",
      applicability: {
        match: "all",
        clauses: [{ kind: "always", operator: "is", value: "true" }],
      },
      statement: "勝敗だけでなく、相手との攻防を楽しむ",
      priority: 60,
      force: "preference",
      selfAwareness: "aware",
      exceptions: [],
      description: null,
    }],
    mechanicalConflictFallbacks: [{
      id: "fallback-basic",
      applicability: {
        match: "all",
        clauses: [{ kind: "always", operator: "is", value: "true" }],
      },
      orderedActionRefs: [v2.capabilities.basicAction.id],
      priority: 50,
      receiptContract: "character-mechanical-conflict-receipt-v1",
    }],
  });
}

describe("ADR-0030 V3 character semantic boundaries", () => {
  it("keeps V2 readable but rejects selectorless V3 action norms", () => {
    const v2 = legacyCharacterSheetToDefinitionV2(legacySheet());
    assert.equal(CharacterDefinitionV2Schema.safeParse({
      ...v2,
      actionNorms: [{
        id: "soft-v2",
        when: {
          match: "all",
          clauses: [{ kind: "always", operator: "is", value: "true" }],
        },
        response: {
          disposition: "prefer",
          actionRefs: [],
          actionKinds: [],
          tacticTags: [],
          statement: "戦いを楽しむ",
          fallbackActionRef: null,
        },
        priority: 50,
        force: "preference",
        selfAwareness: "aware",
        exceptions: [],
        description: null,
      }],
    }).success, true);

    const definition = definitionV3();
    assert.equal(CharacterDefinitionV3Schema.safeParse({
      ...definition,
      actionNorms: [{
        ...definition.actionNorms[0],
        response: {
          disposition: "prefer",
          actionRefs: [],
          actionKinds: [],
          tacticTags: [],
        },
      }],
    }).success, false);
  });

  it("separates conscious guidance, executable norms, and mechanical fallback", () => {
    const definition = definitionV3();
    const norms = compileCharacterActionNormProgramV3(definition);
    const guidance = compileCharacterConsciousGuidanceV1(definition);
    const fallbacks = compileCharacterMechanicalConflictFallbacksV1(definition);

    assert.equal(norms.contractVersion, 3);
    assert.equal(Object.hasOwn(norms.norms[0]?.response ?? {}, "statement"), false);
    assert.equal(Object.hasOwn(norms.norms[0]?.response ?? {}, "fallbackActionRef"), false);
    assert.equal(guidance.entries[0]?.statement, "勝敗だけでなく、相手との攻防を楽しむ");
    assert.equal(Object.hasOwn(guidance.entries[0] ?? {}, "actionRefs"), false);
    assert.equal(CharacterDefinitionV3Schema.safeParse({
      ...definition,
      consciousGuidance: [{
        ...definition.consciousGuidance[0],
        actionRefs: [definition.capabilities.basicAction.id],
      }],
    }).success, false);
    assert.deepEqual(
      fallbacks.entries[0]?.orderedActionRefs,
      [definition.capabilities.basicAction.id],
    );
    const receipt = resolveCharacterMechanicalConflictFallbackV1({
      fallback: {
        ...definition.mechanicalConflictFallbacks[0],
        orderedActionRefs: ["unavailable-action", definition.capabilities.basicAction.id],
      },
      legalActionRefs: [definition.capabilities.basicAction.id],
    });
    assert.equal(receipt.selectedActionRef, definition.capabilities.basicAction.id);
    assert.deepEqual(receipt.rejectedActionRefs, ["unavailable-action"]);
    assert.equal(CharacterDefinitionV3Schema.safeParse({
      ...definition,
      mechanicalConflictFallbacks: [{
        ...definition.mechanicalConflictFallbacks[0],
        orderedActionRefs: ["invented-action"],
      }],
    }).success, false);
  });

  it("reports optional deferral without blocking an unrelated required capability", () => {
    const battleMechanics = CharacterCompilerCapabilityV1Schema.parse({
      consumer: "battle-mechanics",
      version: 3,
    });
    const futureGuidance = CharacterCompilerCapabilityV1Schema.parse({
      consumer: "character-conscious-self",
      version: 3,
    });
    const required = CharacterCompilerCapabilitySetV1Schema.parse({
      contractVersion: 1,
      required: [battleMechanics],
    });
    const ready = projectCharacterCompilerCompatibilityV1({
      required,
      available: [battleMechanics],
      deferredValues: [{
        targetPath: "consciousGuidance.0.description",
        reason: "Not required by current battle mechanics",
        candidateSourcePaths: ["actionNorms.0.response.statement"],
        requiringCapability: futureGuidance,
      }],
      blocked: [],
    });
    assert.equal(ready.status, "ready");
    assert.equal(ready.deferred[0]?.capability.consumer, "character-conscious-self");

    const optionalBlock = projectCharacterCompilerCompatibilityV1({
      required,
      available: [battleMechanics],
      deferredValues: [],
      blocked: [{
        capability: futureGuidance,
        reasonCode: "future_capability_unavailable",
      }],
    });
    assert.equal(optionalBlock.status, "ready");
    assert.equal(optionalBlock.blocked[0]?.capability.consumer, "character-conscious-self");

    const blocked = projectCharacterCompilerCompatibilityV1({
      required: CharacterCompilerCapabilitySetV1Schema.parse({
        contractVersion: 1,
        required: [futureGuidance],
      }),
      available: [futureGuidance],
      deferredValues: [{
        targetPath: "consciousGuidance.0.description",
        reason: "Required conscious value is unresolved",
        candidateSourcePaths: [],
        requiringCapability: futureGuidance,
      }],
      blocked: [],
    });
    assert.equal(blocked.status, "blocked");
  });

  it("keeps deferred values outside active V3 definition fields", () => {
    const definition = definitionV3();
    assert.equal(CharacterDefinitionV3Schema.safeParse({
      ...definition,
      deferredValues: { contractVersion: 1, values: [] },
    }).success, false);

    const envelope = CharacterGenerationEnvelopeV3Schema.safeParse({
      envelopeVersion: 2,
      definitionSchema: { family: "character", version: 3 },
      definition,
      disclosurePolicy: { version: 1, rules: [] },
      publicPresentation: {
        description: "灯",
        projectionContractVersion: 2,
        projectionDigest: "0".repeat(64),
        descriptionInputDigest: "0".repeat(64),
        segments: [{
          id: "summary",
          text: "灯",
          kind: "fact",
          supportRefs: ["identity.displayName"],
        }],
      },
      provenance: {
        sourceKind: "upgrade_description",
        sourceDigest: "0".repeat(64),
        attemptId: "attempt-v3",
        structureGeneratorContract: "character-semantic-migration-v1",
        descriptionGeneratorContract: "character-profile-v2",
      },
      compilerCompatibility: [{ consumer: "battle-mechanics", version: 3 }],
      deferredValues: { contractVersion: 1, values: [] },
    });
    assert.equal(envelope.success, true);
  });

  it("uses qualified V4 inputs and V3 provenance without changing V3 tuple meaning", () => {
    const definition = definitionV3();
    const v2 = legacyCharacterSheetToDefinitionV2(legacySheet());
    const compilerInputs = CharacterBattleCompilerInputsV4Schema.parse({
      psycheTraits: compileCharacterPsycheTraitsV1(v2),
      consciousSelf: projectCharacterConsciousSelfV2(v2),
      actionNorms: compileCharacterActionNormProgramV3(definition),
      consciousGuidance: compileCharacterConsciousGuidanceV1(definition),
      mechanicalConflictFallbacks:
        compileCharacterMechanicalConflictFallbacksV1(definition),
    });
    const generationId = "generation-v3";
    const binding = {
      assetId: legacySheet().id,
      generationId,
      contentDigest: "0".repeat(64),
      snapshot: requireCombatReadyCharacterSheet(legacySheet()),
      basicAttackSource: createCharacterGenerationV3BasicAttackSource({
        generationId,
      }),
      compilerInputsV4: compilerInputs,
    };
    assert.equal(BattleCharacterAssetBindingV4Schema.safeParse(binding).success, true);
    assert.equal(BattleCharacterAssetBindingV4Schema.safeParse({
      ...binding,
      compilerInputsV3: compilerInputs,
    }).success, false);
    assert.equal(BattleCharacterAssetBindingV4Schema.safeParse({
      ...binding,
      basicAttackSource: {
        kind: "character_generation_v2",
        generationId,
        definitionPath: "capabilities.basicAction",
      },
    }).success, false);
  });
});
