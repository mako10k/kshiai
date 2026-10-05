// R: Verify V3 battle compilation and legal mechanical conflict resolution.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CharacterDefinitionV3Schema, compileCharacterActionNormProgramV3,
  compileCharacterBattleCompilerInputsV4, compileCharacterMechanicalConflictFallbacksV1,
  defaultParameters, defaultBasicAttack, legacyCharacterSheetToDefinitionV2,
  projectCharacterConsciousGuidanceV1, compileCharacterConsciousGuidanceV1,
  evaluateCharacterActionNormsV3, type CharacterDefinitionV3, type CharacterSheet,
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

describe("V3 immutable battle compiler", () => {
  it("evaluates V3 norms without converting them to V2 and records a legal fallback", () => {
    const base = definitionV3();
    const basicActionRef = base.capabilities.basicAction.id;
    const definition = CharacterDefinitionV3Schema.parse({
      ...base,
      actionNorms: [
        {
          id: "allow-basic",
          when: {
            match: "all",
            clauses: [{ kind: "always", operator: "is", value: "true" }],
          },
          response: {
            disposition: "allow_only",
            actionRefs: [basicActionRef],
            actionKinds: [],
            tacticTags: [],
          },
          priority: 90,
          force: "constraint",
          exceptions: [],
          description: null,
        },
        {
          id: "forbid-basic",
          when: {
            match: "all",
            clauses: [{ kind: "always", operator: "is", value: "true" }],
          },
          response: {
            disposition: "forbid",
            actionRefs: [basicActionRef],
            actionKinds: [],
            tacticTags: [],
          },
          priority: 80,
          force: "constraint",
          exceptions: [],
          description: null,
        },
      ],
      mechanicalConflictFallbacks: [{
        ...base.mechanicalConflictFallbacks[0]!,
        applicability: {
          match: "all",
          clauses: [{ kind: "always", operator: "is", value: "true" }],
        },
        orderedActionRefs: [basicActionRef],
      }],
    });
    const result = evaluateCharacterActionNormsV3({
      program: compileCharacterActionNormProgramV3(definition),
      mechanicalConflictFallbacks:
        compileCharacterMechanicalConflictFallbacksV1(definition),
      facts: [],
      legalActions: [{
        actionKey: "basic",
        actionRef: basicActionRef,
        actionKind: "basic_action",
        tacticTags: [],
      }],
    });

    assert.deepEqual(result.actions.map((action) => action.actionKey), ["basic"]);
    assert.deepEqual(result.receipt, {
      contractVersion: 3,
      status: "character_norm_conflict",
      applicableNormIds: ["allow-basic", "forbid-basic"],
      exceptedNormIds: [],
      constraintNormIds: ["allow-basic", "forbid-basic"],
      excludedActionKeys: [],
      rankedActionKeys: ["basic"],
      conflict: {
        normIds: ["allow-basic", "forbid-basic"],
        fallbackId: "fallback-basic",
        legalityCheckedActionRefs: [basicActionRef],
        rejectedActionRefs: [],
        selectedActionRef: basicActionRef,
      },
    });
  });

  it("compiles generic V4 inputs from V3 without treating action norms as conscious text", () => {
    const definition = definitionV3();
    const inputs = compileCharacterBattleCompilerInputsV4({
      definition,
      counterpartCharacterAssetId: "opponent-v3",
      relationshipRoles: ["rival"],
    });

    assert.equal(inputs.actionNorms.contractVersion, 3);
    assert.equal(inputs.consciousGuidance.entries.length, 1);
    assert.equal(inputs.mechanicalConflictFallbacks.entries.length, 1);
    assert.deepEqual(inputs.consciousSelf.actionPrinciples, []);
    assert.equal(inputs.relationship?.receipt.counterpartCharacterAssetId, "opponent-v3");
    assert.equal(inputs.narratorViews, undefined);
  });

  it("does not fabricate a legal action when no conflict fallback applies", () => {
    const definition = definitionV3();
    const basic = definition.capabilities.basicAction.id;
    const program = compileCharacterActionNormProgramV3(definition);
    program.norms = [{ ...program.norms[0]!, force: "constraint",
      response: { disposition: "forbid", actionRefs: [basic], actionKinds: [], tacticTags: [] } }];
    const result = evaluateCharacterActionNormsV3({ program,
      mechanicalConflictFallbacks: { contractVersion: 1, entries: [] }, facts: [],
      legalActions: [{ actionKey: "basic", actionRef: basic, actionKind: "basic_action", tacticTags: [] }],
    });
    assert.deepEqual(result.actions, []);
    assert.equal(result.receipt.status, "character_norm_conflict");
    assert.equal(result.receipt.conflict?.fallbackId, null);
    assert.equal(result.receipt.conflict?.selectedActionRef, null);
  });

  it("rejects an unavailable fallback reference before selecting the next legal one", () => {
    const definition = definitionV3();
    const basic = definition.capabilities.basicAction.id;
    const program = compileCharacterActionNormProgramV3(definition);
    program.norms = [{ ...program.norms[0]!, force: "constraint",
      response: { disposition: "forbid", actionRefs: [basic], actionKinds: [], tacticTags: [] } }];
    const fallbacks = compileCharacterMechanicalConflictFallbacksV1(definition);
    fallbacks.entries[0]!.orderedActionRefs = ["unavailable", basic];
    const result = evaluateCharacterActionNormsV3({ program, mechanicalConflictFallbacks: fallbacks,
      facts: [], legalActions: [{ actionKey: "basic", actionRef: basic, actionKind: "basic_action", tacticTags: [] }],
    });
    assert.deepEqual(result.actions.map((action) => action.actionKey), ["basic"]);
    assert.deepEqual(result.receipt.conflict?.rejectedActionRefs, ["unavailable"]);
    assert.equal(result.receipt.conflict?.selectedActionRef, basic);
  });

  it("projects active guidance by priority without modifying the frozen program", () => {
    const program = compileCharacterConsciousGuidanceV1(definitionV3());
    const base = program.entries[0]!;
    program.entries = [
      { ...base, id: "lower", statement: "lower", priority: 10 },
      { ...base, id: "higher", statement: "higher", priority: 90 },
      { ...base, id: "partial", statement: "x".repeat(200), selfAwareness: "partial", priority: 50 },
    ];
    const before = structuredClone(program);
    assert.deepEqual(projectCharacterConsciousGuidanceV1(program, []),
      ["higher", "x".repeat(160), "lower"]);
    assert.deepEqual(program, before);
  });

  it("excludes false applicability, matching exceptions and unaware guidance", () => {
    const program = compileCharacterConsciousGuidanceV1(definitionV3());
    const base = program.entries[0]!;
    program.entries = [
      { ...base, id: "wrong-phase", statement: "wrong phase", applicability: {
        match: "all", clauses: [{ kind: "battle_phase", operator: "is", value: "prologue" }],
      } },
      { ...base, id: "excepted", statement: "excepted", exceptions: [{
        clauses: [{ kind: "battle_phase", operator: "is", value: "turn" }], description: "exclude combat",
      }] },
      { ...base, id: "unaware", statement: "unaware", selfAwareness: "unaware" },
      { ...base, id: "active", statement: "active", applicability: {
        match: "any", clauses: [{ kind: "battle_phase", operator: "is", value: "turn" }],
      } },
    ];
    assert.deepEqual(projectCharacterConsciousGuidanceV1(program,
      [{ kind: "battle_phase", value: "turn" }]), ["active"]);
  });

  it("keeps unaware guidance out of conscious self while preserving the frozen program", () => {
    const definition = definitionV3();
    definition.consciousGuidance[0]!.selfAwareness = "unaware";
    const inputs = compileCharacterBattleCompilerInputsV4({ definition });
    assert.deepEqual(inputs.consciousSelf.actionPrinciples, []);
    assert.equal(inputs.consciousGuidance.entries[0]?.selfAwareness, "unaware");
    assert.equal("deepPsyche" in inputs, false);
    const before = structuredClone(inputs);
    definition.consciousGuidance[0]!.statement = "changed";
    assert.deepEqual(inputs, before);
  });
});
