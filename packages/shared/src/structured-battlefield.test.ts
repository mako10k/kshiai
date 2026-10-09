import { prepareStructuredBattlefieldCreationV2, type BattlefieldCreation } from "./battlefield-creation.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BATTLEFIELD_INSTANCE_COMPILER_V2,
  BattlefieldDefinitionV2Schema,
  BattlefieldGenerationEnvelopeV2Schema,
  REQUIRED_BATTLEFIELD_COMPILERS_V2,
  assertBattlefieldGenerationReadyV2,
  compileBattlefieldInstanceV2,
  createBattleState,
  defaultParameters,
  defaultBattlefieldDisclosurePolicyV2,
  legacyBattlefieldPresetToDefinitionV2,
  projectBattlefieldImageBriefV2,
  projectBattlefieldSceneSourceV2,
  selectBattlefieldEvolutionAffordanceV2,
  type BattlefieldDefinitionV2,
  type BattlefieldPreset,
  type CharacterSheet,
} from "./index.js";

function legacy(): BattlefieldPreset {
  return {
    id: "field-legacy",
    ownerUserId: "owner",
    isSystem: false,
    displayName: "霧の遺跡",
    category: "ruins",
    tags: ["霧", "石造"],
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    appearance: {
      summary: "霧に沈む石造遺跡",
      visualPrompt: "misty stone ruins",
      imageUrl: "/field.jpg",
    },
    terrainHints: ["中央広場", "崩れた回廊"],
    obstacleHints: ["倒れた石柱", "瓦礫"],
    conditionHints: ["濃霧"],
    baseCoefficients: { damage: 0.9, fire: 0.7, invented: 2 },
    narrativeBlurb: "霧に閉ざされた遺跡。",
  };
}

function definition(): BattlefieldDefinitionV2 {
  const base = legacyBattlefieldPresetToDefinitionV2(legacy());
  return BattlefieldDefinitionV2Schema.parse({
    ...base,
    objects: [
      ...base.objects,
      {
        id: "object.hidden-switch",
        label: "隠された仕掛け",
        description: {
          text: "壁の奥にある仕掛け",
          sourceSupportRefs: ["fixture.hidden-switch"],
        },
        areaId: base.areas[0]!.id,
        presence: "present",
        exposure: "hidden",
        portable: false,
        usable: true,
        cover: "none",
        blocking: false,
        durability: "stable",
      },
    ],
    evolutionAffordances: [{
      id: "evolution.fog",
      pressure: "visibility_shift",
      areaRefs: base.areas.map((area) => area.id),
      objectRefs: [],
      description: {
        text: "霧の濃さだけが変化できる",
        sourceSupportRefs: ["fixture.fog"],
      },
    }],
  });
}

function character(id: string): CharacterSheet {
  return {
    id,
    ownerUserId: id,
    displayName: id,
    tags: [],
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    appearance: { summary: id, visualPrompt: id, imageUrl: null },
    traits: [],
    parameters: defaultParameters(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: id,
    visibility: "public",
  };
}

describe("BattlefieldDefinitionV2", () => {
  it("maps legacy fields deterministically and drops unknown coefficient keys", () => {
    const first = legacyBattlefieldPresetToDefinitionV2(legacy());
    const second = legacyBattlefieldPresetToDefinitionV2(legacy());
    assert.deepEqual(first, second);
    assert.deepEqual(first.baseCoefficients, { damage: 0.9, fire: 0.7 });
    assert.equal(first.areas.length, 2);
    assert.equal(first.topology.length, 2);
    assert.equal(first.objects.length, 2);
    assert.equal(first.effects.length, 1);
  });

  it("rejects dangling references, reserved ids, and cross-section duplicates", () => {
    const base = definition();
    assert.equal(BattlefieldDefinitionV2Schema.safeParse({
      ...base,
      entryAreas: { ...base.entryAreas, a: "area.missing" },
    }).success, false);
    assert.equal(BattlefieldDefinitionV2Schema.safeParse({
      ...base,
      objects: [{ ...base.objects[0]!, id: base.areas[0]!.id }],
    }).success, false);
    assert.equal(BattlefieldDefinitionV2Schema.safeParse({
      ...base,
      areas: [{ ...base.areas[0]!, id: "character.a" }],
    }).success, false);
  });

  it("compiles byte-equivalent instances without provider or public prose input", () => {
    const first = compileBattlefieldInstanceV2(definition(), "field-ready");
    const second = compileBattlefieldInstanceV2(
      structuredClone(definition()),
      "field-ready",
    );
    assert.deepEqual(first, second);
    assert.equal(first.compilerContract, BATTLEFIELD_INSTANCE_COMPILER_V2);
    assert.equal(first.semanticSeed?.entities["object.hidden-switch"]?.active, true);
    assert.deepEqual(
      first.semanticSeed?.entities[definition().effects[0]!.id]?.facts
        .coefficient_modifiers,
      definition().effects[0]!.coefficientModifiers,
    );
    assert.equal(first.obstacles.includes("隠された仕掛け"), false);
    assert.equal(first.topology?.length, 2);
    assert.deepEqual(first.areas, definition().areas.map((area) => ({
      id: area.id,
      name: area.name,
    })));
    assert.deepEqual(first.entryAreas, definition().entryAreas);
  });

  it("selects only authored evolution affordances deterministically", () => {
    const instance = compileBattlefieldInstanceV2(definition(), "field-ready");
    assert.equal(
      selectBattlefieldEvolutionAffordanceV2(instance, 3, 0)?.id,
      "evolution.fog",
    );
    assert.equal(
      selectBattlefieldEvolutionAffordanceV2(instance, 3, 0)?.id,
      selectBattlefieldEvolutionAffordanceV2(instance, 3, 0)?.id,
    );
    assert.equal(selectBattlefieldEvolutionAffordanceV2({
      ...instance,
      evolutionAffordances: [],
    }, 3, 0), null);
    assert.equal(selectBattlefieldEvolutionAffordanceV2({
      ...instance,
      compilerContract: "legacy-compiler",
    }, 3, 0), null);
  });

  it("places both semantic character roots at their exact authored entry areas", () => {
    const value = definition();
    const state = createBattleState({
      id: "battle-entry-areas",
      sideA: character("entry-a"),
      sideB: character("entry-b"),
      turnLimit: 20,
      battlefield: prepareStructuredBattlefieldCreationV2(value, "field-ready"),
      prologuePending: false,
    });
    const areaNames = new Map(value.areas.map((area) => [area.id, area.name]));
    assert.deepEqual(state.semanticState?.entities["character.a"]?.location, {
      type: "scene",
      area: areaNames.get(value.entryAreas.a),
    });
    assert.deepEqual(state.semanticState?.entities["character.b"]?.location, {
      type: "scene",
      area: areaNames.get(value.entryAreas.b),
    });
    assert.deepEqual(Object.keys(state.worldState!.areas).sort(), value.areas.map((area) => area.id).sort());
    assert.deepEqual(state.worldState?.entities["character.a"]?.placement,
      { type: "scene", areaId: value.entryAreas.a });
    assert.deepEqual(state.worldState?.entities["character.b"]?.placement,
      { type: "scene", areaId: value.entryAreas.b });
    assert.deepEqual(state.battlefield, compileBattlefieldInstanceV2(value, "field-ready"));
  });

  it("preserves distinct area and entity placements when display names are identical", () => {
    const original = definition();
    const lastAreaId = original.areas.at(-1)!.id;
    const areaEffect = { ...original.effects[0]!, target: { kind: "area" as const, areaId: lastAreaId } };
    const value = BattlefieldDefinitionV2Schema.parse({
      ...original,
      areas: original.areas.map((area) => ({ ...area, name: "同じ名前の場" })),
      effects: [areaEffect],
      objects: original.objects.map((object) => ({ ...object, areaId: lastAreaId })),
    });
    const creation = prepareStructuredBattlefieldCreationV2(value, "duplicate-area-names");
    const state = createBattleState({
      id: "duplicate-area-world", sideA: character("duplicate-a"), sideB: character("duplicate-b"),
      turnLimit: 12, battlefield: creation, prologuePending: false,
    });
    assert.deepEqual(Object.keys(state.worldState!.areas).sort(), value.areas.map((area) => area.id).sort());
    assert.deepEqual(state.worldState?.entities["character.a"]?.placement,
      { type: "scene", areaId: value.entryAreas.a });
    assert.deepEqual(state.worldState?.entities["character.b"]?.placement,
      { type: "scene", areaId: value.entryAreas.b });
    for (const object of value.objects.filter((entry) => entry.presence === "present")) {
      assert.deepEqual(state.worldState?.entities[object.id]?.placement,
        { type: "scene", areaId: lastAreaId });
    }
    assert.deepEqual(state.worldState?.entities[areaEffect.id]?.placement,
      { type: "scene", areaId: lastAreaId });
    assert.deepEqual(state.worldState?.pairRelations[0]?.distance, "separate_area");
    assert.equal("worldLayout" in state.battlefield!, false);
  });

  it("rejects missing or dangling initial scene placement references", () => {
    const creation = prepareStructuredBattlefieldCreationV2(definition(), "invalid-layout");
    const missing = structuredClone(creation);
    delete missing.worldLayout.sceneAreaIds["character.b"];
    assert.throws(() => createBattleState({
      id: "missing-placement", sideA: character("reference-a"), sideB: character("reference-b"),
      turnLimit: 12, battlefield: missing,
    }), /BATTLE_WORLD_INITIAL_LAYOUT_PLACEMENT_REQUIRED/);
    const dangling = structuredClone(creation);
    dangling.worldLayout.sceneAreaIds["character.b"] = "area.not-defined";
    assert.throws(() => createBattleState({
      id: "dangling-placement", sideA: character("reference-a"), sideB: character("reference-b"),
      turnLimit: 12, battlefield: dangling,
    }), /BATTLE_WORLD_INITIAL_LAYOUT_REFERENCE_INVALID/);
    dangling.worldLayout.sceneAreaIds["character.b"] = "toString";
    assert.throws(() => createBattleState({
      id: "inherited-area-reference", sideA: character("reference-a"), sideB: character("reference-b"),
      turnLimit: 12, battlefield: dangling,
    }), /BATTLE_WORLD_INITIAL_LAYOUT_REFERENCE_INVALID/);
  });

  it("rejects using a structured instance without its required creation layout", () => {
    assert.throws(() => createBattleState({
      id: "missing-structured-world", sideA: character("missing-a"), sideB: character("missing-b"),
      turnLimit: 12, battlefield: { kind: "legacy", instance: compileBattlefieldInstanceV2(definition(), "missing-layout") },
    }), /STRUCTURED_BATTLEFIELD_INITIAL_LAYOUT_REQUIRED/);
  });

  it("keeps mechanics, hidden objects, and evolution controls out of public projections", () => {
    const value = definition();
    const policy = defaultBattlefieldDisclosurePolicyV2(value);
    const projection = projectBattlefieldSceneSourceV2(value, policy);
    const publicText = JSON.stringify(projection);
    assert.equal(publicText.includes("object.hidden-switch"), false);
    assert.equal(publicText.includes("baseCoefficients"), false);
    assert.equal(publicText.includes("evolution.fog"), false);

    const image = JSON.stringify(projectBattlefieldImageBriefV2(value));
    assert.equal(image.includes("隠された仕掛け"), false);
    assert.equal(image.includes("damage"), false);
    assert.equal(image.includes("visibility_shift"), false);
  });

  it("requires every compiler and an exact claim-validation receipt", () => {
    const value = definition();
    const disclosurePolicy = defaultBattlefieldDisclosurePolicyV2(value);
    const projection = projectBattlefieldSceneSourceV2(value, disclosurePolicy);
    const projectionDigest = "1".repeat(64);
    const segment = {
      id: "scene-main",
      text: projection.facts.map((fact) => fact.text).join("。").slice(0, 1200),
      kind: "fact" as const,
      supportRefs: projection.facts.slice(0, 12).map((fact) => fact.supportRef),
    };
    const envelope = BattlefieldGenerationEnvelopeV2Schema.parse({
      envelopeVersion: 2,
      definitionSchema: { family: "battlefield-preset", version: 2 },
      definition: value,
      disclosurePolicy,
      publicPresentation: {
        description: segment.text,
        projectionContractVersion: 2,
        projectionDigest,
        descriptionInputDigest: "2".repeat(64),
        segments: [segment],
        claimValidation: {
          contractVersion: 1,
          validatorContract: "battlefield-scene-claim-validator-v1",
          projectionDigest,
          segments: [{
            segmentId: segment.id,
            verdict: "supported",
            supportRefs: segment.supportRefs,
            riskCodes: [],
          }],
        },
      },
      provenance: {
        sourceKind: "import",
        sourceDigest: "3".repeat(64),
        attemptId: "fixture-import",
        structureGeneratorContract: "fixture",
        descriptionGeneratorContract: "fixture",
      },
      compilerCompatibility: REQUIRED_BATTLEFIELD_COMPILERS_V2,
    });
    assert.deepEqual(assertBattlefieldGenerationReadyV2(envelope), envelope);
    assert.throws(
      () => assertBattlefieldGenerationReadyV2({
        ...envelope,
        compilerCompatibility: envelope.compilerCompatibility.slice(1),
      }),
      /BATTLEFIELD_REQUIRED_COMPILER_MISSING/,
    );
  });
});

type IsBattlefieldCreation<T> = T extends BattlefieldCreation ? true : false;
const missingCreationLayout: IsBattlefieldCreation<{
  kind: "structured";
  instance: ReturnType<typeof compileBattlefieldInstanceV2>;
}> = false;
it("requires structured placement handoff at compile time", () => {
  assert.equal(missingCreationLayout, false);
});
