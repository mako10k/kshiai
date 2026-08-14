import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CharacterDefinitionV2Schema,
  compileCharacterActionNormProgramV2,
  compileCharacterRelationshipProgramV2,
  evaluateCharacterActionNormsV2,
  legacyCharacterSheetToDefinitionV2,
  projectCharacterRelationshipDescriptionV2,
  resolveCharacterRelationshipV2,
  type CharacterDefinitionV2,
  type CharacterNormActionCandidateV2,
  type CharacterSheet,
} from "./index.js";

function legacySheet(id = "character-self"): CharacterSheet {
  return {
    id,
    ownerUserId: "owner",
    displayName: "灯",
    tags: [],
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    appearance: { summary: "赤い外套をまとう", visualPrompt: "red cloak" },
    traits: [],
    parameters: {
      hp: 100,
      maxHp: 100,
      mp: 50,
      maxMp: 50,
      stamina: 50,
      maxStamina: 50,
      atk: 10,
      def: 10,
      spd: 10,
      mag: 10,
      res: 10,
      focus: 10,
      luck: 10,
    },
    skills: [{
      id: "skill-flame",
      name: "火花",
      description: "火花を放つ",
      costMp: 1,
      costStamina: 0,
      power: 1,
      kind: "magic",
    }, {
      id: "skill-shield",
      name: "火の盾",
      description: "火の盾を張る",
      costMp: 1,
      costStamina: 0,
      power: 0.5,
      kind: "defend",
    }],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "火を守る旅人。",
  };
}

function alwaysNorm(input: {
  id: string;
  disposition: "prefer" | "avoid" | "allow_only" | "forbid";
  force: "preference" | "commitment" | "constraint";
  priority: number;
  actionRefs?: string[];
  actionKinds?: Array<"basic_action" | "skill" | "defend" | "wait" | "free_action">;
  fallbackActionRef?: string | null;
  awareness?: "unaware" | "partial" | "aware";
  exceptions?: CharacterDefinitionV2["actionNorms"][number]["exceptions"];
}): CharacterDefinitionV2["actionNorms"][number] {
  return {
    id: input.id,
    when: {
      match: "all",
      clauses: [{ kind: "always", operator: "is", value: "true" }],
    },
    response: {
      disposition: input.disposition,
      actionRefs: input.actionRefs ?? [],
      actionKinds: input.actionKinds ?? [],
      tacticTags: [],
      statement: `principle:${input.id}`,
      fallbackActionRef: input.fallbackActionRef ?? null,
    },
    priority: input.priority,
    force: input.force,
    selfAwareness: input.awareness ?? "aware",
    exceptions: input.exceptions ?? [],
    description: null,
  };
}

function definitionWith(input: {
  norms?: CharacterDefinitionV2["actionNorms"];
  relationships?: CharacterDefinitionV2["relationshipSeeds"];
  id?: string;
}): CharacterDefinitionV2 {
  const base = legacyCharacterSheetToDefinitionV2(legacySheet(input.id));
  return CharacterDefinitionV2Schema.parse({
    ...base,
    actionNorms: input.norms ?? [],
    relationshipSeeds: input.relationships ?? [],
  });
}

const legalActions: CharacterNormActionCandidateV2[] = [{
  actionKey: "skill:skill-flame",
  actionRef: "skill-flame",
  actionKind: "skill",
  tacticTags: [],
}, {
  actionKey: "skill:skill-shield",
  actionRef: "skill-shield",
  actionKind: "skill",
  tacticTags: [],
}, {
  actionKey: "wait",
  actionRef: null,
  actionKind: "wait",
  tacticTags: [],
}];

describe("CharacterDefinitionV2 deterministic rule compilers", () => {
  it("rejects statically contradictory equal-rank constraints", () => {
    const base = legacyCharacterSheetToDefinitionV2(legacySheet());
    assert.equal(CharacterDefinitionV2Schema.safeParse({
      ...base,
      actionNorms: [
        alwaysNorm({
          id: "allow-flame",
          disposition: "allow_only",
          force: "constraint",
          priority: 80,
          actionRefs: ["skill-flame"],
        }),
        alwaysNorm({
          id: "forbid-flame",
          disposition: "forbid",
          force: "constraint",
          priority: 80,
          actionRefs: ["skill-flame"],
        }),
      ],
    }).success, false);
  });

  it("records a conflicting constraint and selects the highest legal declared fallback", () => {
    const definition = definitionWith({
      norms: [
        alwaysNorm({
          id: "allow-flame",
          disposition: "allow_only",
          force: "constraint",
          priority: 90,
          actionRefs: ["skill-flame"],
          fallbackActionRef: "skill-shield",
        }),
        alwaysNorm({
          id: "forbid-flame",
          disposition: "forbid",
          force: "constraint",
          priority: 80,
          actionRefs: ["skill-flame"],
        }),
      ],
    });
    const result = evaluateCharacterActionNormsV2({
      program: compileCharacterActionNormProgramV2(definition),
      facts: [{ kind: "always", value: "true" }],
      legalActions,
    });

    assert.deepEqual(
      result.actions.map((action) => action.actionKey),
      ["skill:skill-shield"],
    );
    assert.equal(result.receipt.status, "character_norm_conflict");
    assert.deepEqual(result.receipt.fallback, {
      actionKey: "skill:skill-shield",
      actionRef: "skill-shield",
      sourceNormId: "allow-flame",
    });
    assert.deepEqual(result.consciousActionPrinciples, [
      "principle:allow-flame",
      "principle:forbid-flame",
    ]);
  });

  it("never invents an illegal fallback and uses the legal wait action", () => {
    const definition = definitionWith({
      norms: [
        alwaysNorm({
          id: "allow-flame",
          disposition: "allow_only",
          force: "constraint",
          priority: 90,
          actionRefs: ["skill-flame"],
          fallbackActionRef: "skill-shield",
        }),
        alwaysNorm({
          id: "forbid-flame",
          disposition: "forbid",
          force: "constraint",
          priority: 80,
          actionRefs: ["skill-flame"],
        }),
      ],
    });
    const result = evaluateCharacterActionNormsV2({
      program: compileCharacterActionNormProgramV2(definition),
      facts: [{ kind: "always", value: "true" }],
      legalActions: legalActions.filter((action) =>
        action.actionRef !== "skill-shield"
      ),
    });

    assert.deepEqual(result.actions.map((action) => action.actionKey), ["wait"]);
    assert.deepEqual(result.receipt.fallback, {
      actionKey: "wait",
      actionRef: null,
      sourceNormId: null,
    });
  });

  it("orders soft norms by force, priority, specificity, and stable ID", () => {
    const definition = definitionWith({
      norms: [
        alwaysNorm({
          id: "prefer-shield",
          disposition: "prefer",
          force: "commitment",
          priority: 10,
          actionRefs: ["skill-shield"],
        }),
        alwaysNorm({
          id: "prefer-flame",
          disposition: "prefer",
          force: "preference",
          priority: 100,
          actionRefs: ["skill-flame"],
          awareness: "unaware",
        }),
      ],
    });
    const result = evaluateCharacterActionNormsV2({
      program: compileCharacterActionNormProgramV2(definition),
      facts: [{ kind: "always", value: "true" }],
      legalActions,
    });

    assert.deepEqual(
      result.actions.map((action) => action.actionKey),
      ["skill:skill-shield", "skill:skill-flame", "wait"],
    );
    assert.deepEqual(result.receipt.applicableNormIds, [
      "prefer-shield",
      "prefer-flame",
    ]);
    assert.deepEqual(result.consciousActionPrinciples, [
      "principle:prefer-shield",
    ]);
  });

  it("rejects unknown predicate values and records applicable exceptions", () => {
    const norm = alwaysNorm({
      id: "except-critical",
      disposition: "prefer",
      force: "preference",
      priority: 50,
      actionRefs: ["skill-flame"],
      exceptions: [{
        clauses: [{
          kind: "self_condition",
          operator: "at_least",
          value: "critical",
        }],
        description: "危機時は例外",
      }],
    });
    const definition = definitionWith({ norms: [norm] });
    const critical = evaluateCharacterActionNormsV2({
      program: compileCharacterActionNormProgramV2(definition),
      facts: [
        { kind: "always", value: "true" },
        { kind: "self_condition", value: "critical" },
      ],
      legalActions,
    });
    assert.deepEqual(critical.receipt.exceptedNormIds, ["except-critical"]);
    assert.equal(critical.receipt.status, "no_applicable_norm");

    assert.equal(CharacterDefinitionV2Schema.safeParse({
      ...definition,
      actionNorms: [{
        ...norm,
        id: "unknown-band",
        when: {
          match: "all",
          clauses: [{
            kind: "relationship_band",
            operator: "is",
            value: "display-name-text",
          }],
        },
        exceptions: [],
      }],
    }).success, false);
  });

  it("resolves exact logical targets before roles, then priority and stable ID", () => {
    const dynamics = { trust: 10, affiliation: 20, fear: 30, competition: 40 };
    const definition = definitionWith({
      relationships: [{
        id: "role-high",
        target: { kind: "role", role: "rival" },
        relationKinds: ["rival"],
        historySummary: null,
        defaultAddress: "好敵手",
        selfAwareness: "aware",
        dynamics,
        priority: 100,
      }, {
        id: "exact-lower-b",
        target: { kind: "character", characterAssetId: "character-peer" },
        relationKinds: ["ally"],
        historySummary: null,
        defaultAddress: "相棒B",
        selfAwareness: "aware",
        dynamics,
        priority: 40,
      }, {
        id: "exact-lower-a",
        target: { kind: "character", characterAssetId: "character-peer" },
        relationKinds: ["ally"],
        historySummary: null,
        defaultAddress: "相棒A",
        selfAwareness: "aware",
        dynamics,
        priority: 40,
      }],
    });
    const resolved = resolveCharacterRelationshipV2({
      program: compileCharacterRelationshipProgramV2(definition),
      counterpartCharacterAssetId: "character-peer",
      relationshipRoles: ["rival"],
    });

    assert.equal(resolved.selected?.id, "exact-lower-a");
    assert.equal(resolved.receipt.selectedTargetKind, "character");
    assert.deepEqual(resolved.receipt.matchedSeedIds, [
      "exact-lower-a",
      "exact-lower-b",
      "role-high",
    ]);
    const noDisplayNameMatch = resolveCharacterRelationshipV2({
      program: compileCharacterRelationshipProgramV2(definition),
      counterpartCharacterAssetId: "灯",
    });
    assert.equal(noDisplayNameMatch.selected, null);
    assert.deepEqual(projectCharacterRelationshipDescriptionV2({
      resolution: resolved,
      consumer: "deep-psyche",
    }), {
      contractVersion: 2,
      relationKinds: ["ally"],
      history: null,
      defaultAddress: "相棒A",
    });
    assert.equal(
      JSON.stringify(projectCharacterRelationshipDescriptionV2({
        resolution: resolved,
        consumer: "deep-psyche",
      })).includes("character-peer"),
      false,
    );
  });

  it("preserves the same rule outcome under an A/B swap", () => {
    const norm = alwaysNorm({
      id: "prefer-shield",
      disposition: "prefer",
      force: "commitment",
      priority: 80,
      actionRefs: ["skill-shield"],
    });
    const run = (id: string, counterpartId: string) => {
      const definition = definitionWith({
        id,
        norms: [norm],
        relationships: [{
          id: "exact-peer",
          target: { kind: "character", characterAssetId: counterpartId },
          relationKinds: ["rival"],
          historySummary: null,
          defaultAddress: "好敵手",
          selfAwareness: "aware",
          dynamics: { trust: 0, affiliation: 0, fear: 0, competition: 700 },
          priority: 80,
        }],
      });
      return {
        action: evaluateCharacterActionNormsV2({
          program: compileCharacterActionNormProgramV2(definition),
          facts: [{ kind: "always", value: "true" }],
          legalActions,
        }),
        relationship: resolveCharacterRelationshipV2({
          program: compileCharacterRelationshipProgramV2(definition),
          counterpartCharacterAssetId: counterpartId,
        }),
      };
    };
    const sideA = run("character-a", "character-b");
    const sideB = run("character-b", "character-a");

    assert.deepEqual(sideA.action, sideB.action);
    assert.deepEqual(sideA.relationship.selected?.relationKinds, ["rival"]);
    assert.deepEqual(sideB.relationship.selected?.relationKinds, ["rival"]);
    assert.equal(
      sideA.relationship.receipt.selectedTargetKind,
      sideB.relationship.receipt.selectedTargetKind,
    );
  });
});
