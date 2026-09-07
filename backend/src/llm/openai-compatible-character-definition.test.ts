import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultParameters,
  legacyBattlefieldPresetToDefinitionV2,
  legacyCharacterSheetToDefinitionV2,
  listCharacterDefinitionGapsV2,
} from "@kshiai/shared";
import type { GenerateBattlefieldDefinitionV2Input } from "./types.js";
import type { GenerateCharacterDefinitionV2Input } from "./types.js";
import {
  OpenAiCompatibleProvider,
  type ChatOpts,
} from "./openai-compatible.js";

type ChatCall = {
  system: string;
  user: string;
  label: string | undefined;
  responseFormat: unknown;
};

function definitionInput(): GenerateCharacterDefinitionV2Input {
  const baseDefinition = legacyCharacterSheetToDefinitionV2({
    id: "character-upgrade-repair",
    ownerUserId: "owner-upgrade-repair",
    displayName: "観測士ナギ",
    identity: {
      realName: null,
      nicknames: ["ナギ"],
      selfNames: ["私"],
      epithets: [],
      gender: null,
      age: null,
    },
    tags: ["observer"],
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    appearance: {
      summary: "藍色の外套と記録端末を携えた観測者",
      visualPrompt: "observer in an indigo coat",
      imageUrl: null,
    },
    traits: ["相手の言葉を受けてから問いかける"],
    parameters: defaultParameters(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "動作の理由を読み、相手の言葉には質問で返す観測者。",
  });
  return {
    sourceKind: "upgrade_description",
    sourceText: "動作の理由を読み、相手の言葉には質問で返す観測者。",
    baseDefinition,
    unstructuredActionNormSources: [{
      id: "observe-then-ask",
      statement: "相手を観測してから問いかける",
      priority: 70,
      force: "preference",
    }],
  };
}

function naturalStringFill() {
  return {
    profileBackground: null,
    appearanceDetails: [{
      id: "detail-coat",
      region: "clothing",
      description: "藍色の外套",
    }],
    psycheCoreNeeds: null,
    speech: { register: "落ち着いた丁寧語", cadence: "短く区切る" },
    relationshipSeeds: null,
    actionNorms: [{
      id: "ask-after-observing",
      when: {
        match: "all",
        clauses: [{ kind: "always", operator: "is", value: "true" }],
      },
      response: {
        disposition: "prefer",
        actionRefs: [],
        actionKinds: ["free_action"],
        tacticTags: [],
        statement: "相手の動きを見てから問いかける",
        fallbackActionRef: null,
      },
      priority: 50,
      force: "preference",
      selfAwareness: "aware",
      exceptions: [],
      description: null,
    }],
    expressionNotes: null,
  };
}

function providerWithResponses(
  responses: unknown[],
  fallbackOnError = false,
): {
  provider: OpenAiCompatibleProvider;
  calls: ChatCall[];
} {
  const calls: ChatCall[] = [];
  class StubProvider extends OpenAiCompatibleProvider {
    protected override async chatJson(
      system: string,
      user: string,
      opts?: ChatOpts,
    ): Promise<unknown> {
      calls.push({
        system,
        user,
        label: opts?.label,
        responseFormat: opts?.responseFormat,
      });
      const response = responses[calls.length - 1];
      if (response === undefined) throw new Error("unexpected provider call");
      return structuredClone(response);
    }
  }
  const provider = new StubProvider({
    name: "xai",
    apiKey: "test-only",
    baseUrl: "https://example.invalid/v1",
    modelEngine: "grok-4.5",
    modelFast: "grok-4-fast-non-reasoning",
    fallbackOnError,
  });
  return { provider, calls };
}

describe("OpenAI-compatible character definition repair", () => {
  it("does not issue a repair call for a natural string-description fill", async () => {
    const input = definitionInput();
    const { provider, calls } = providerWithResponses([
      { fill: naturalStringFill() },
    ]);

    const definition = await provider.generateCharacterDefinitionV2(input);

    assert.equal(definition.appearance.details[0]?.description.text, "藍色の外套");
    assert.equal(definition.speechPolicy.register, "落ち着いた丁寧語");
    assert.equal(
      definition.actionNorms[0]?.response.statement,
      "相手の動きを見てから問いかける",
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.label, "fillCharacterDefinitionGapsV2");
    const request = JSON.parse(calls[0]!.user) as {
      unstructuredActionNormSources: unknown[];
    };
    assert.deepEqual(
      request.unstructuredActionNormSources,
      input.unstructuredActionNormSources,
    );
    const format = calls[0]?.responseFormat;
    assert.ok(format && typeof format === "object");
    const jsonSchema = Reflect.get(format, "json_schema");
    assert.ok(jsonSchema && typeof jsonSchema === "object");
    const schema = Reflect.get(jsonSchema, "schema");
    assert.ok(schema && typeof schema === "object");
    const properties = Reflect.get(schema, "properties");
    assert.ok(properties && typeof properties === "object");
    assert.equal(Reflect.get(jsonSchema, "name"), "character_definition_fill_v2");
    assert.equal(
      "identity" in properties,
      false,
    );
  });

  it("repairs a non-object fill with a bounded validation receipt", async () => {
    const input = definitionInput();
    const { provider, calls } = providerWithResponses([
      { fill: "not-an-object" },
      { fill: {} },
    ]);

    const definition = await provider.generateCharacterDefinitionV2(input);

    assert.deepEqual(definition, input.baseDefinition);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.label, "fillCharacterDefinitionGapsV2");
    assert.equal(calls[1]?.label, "fillCharacterDefinitionGapsV2Repair");
    const repair = JSON.parse(calls[1]!.user) as {
      sourceKind: string;
      validationIssues: Array<{ path: Array<string | number>; message: string }>;
    };
    assert.equal(repair.sourceKind, "upgrade_description");
    assert.ok(repair.validationIssues.length > 0);
  });

  it("fails closed after one unsuccessful repair attempt", async () => {
    const input = definitionInput();
    const { provider, calls } = providerWithResponses([
      { fill: "not-an-object" },
      { fill: "not-an-object" },
    ]);

    await assert.rejects(
      provider.generateCharacterDefinitionV2(input),
      /Expected object|invalid_type/,
    );
    assert.equal(calls.length, 2);
  });

  it("does not replace a structure error with mock output", async () => {
    const input = definitionInput();
    const { provider, calls } = providerWithResponses([
      { fill: "not-an-object" },
      { fill: "still-not-an-object" },
    ], true);

    await assert.rejects(
      provider.generateCharacterDefinitionV2(input),
      /Expected object|invalid_type/,
    );
    assert.equal(calls.length, 2);
  });

  it("rejects missing owner source while definition gaps remain", async () => {
    const input = { ...definitionInput(), sourceText: "" };
    const { provider, calls } = providerWithResponses([]);

    await assert.rejects(
      provider.generateCharacterDefinitionV2(input),
      /gaps require a non-empty owner source/,
    );
    assert.equal(calls.length, 0);
  });

  it("returns an already complete upgrade base without calling the provider", async () => {
    const input = definitionInput();
    const completeFill = {
      ...naturalStringFill(),
      profileBackground: [{
        id: "background-observer",
        kind: "role",
        summary: "観測者",
        description: "相手の動作を読む観測者。",
        selfAwareness: "aware",
      }],
      psycheCoreNeeds: [{
        id: "need-understand",
        description: "相手の意図を理解したい",
        selfAwareness: "aware",
      }],
      relationshipSeeds: [{
        id: "relation-counterpart",
        role: "rival",
        relationKinds: ["observer"],
        historySummary: "",
        defaultAddress: "",
        selfAwareness: "aware",
        priority: 10,
      }],
    };
    const initial = providerWithResponses([{ fill: completeFill }]);
    const completed = await initial.provider.generateCharacterDefinitionV2(input);
    const noCall = providerWithResponses([]);
    assert.deepEqual(listCharacterDefinitionGapsV2(completed), []);

    const unchanged = await noCall.provider.generateCharacterDefinitionV2({
      ...input,
      baseDefinition: completed,
    });

    assert.deepEqual(unchanged, completed);
    assert.equal(noCall.calls.length, 0);
  });

  it("routes revisions through complete definition generation", async () => {
    const input = {
      ...definitionInput(),
      sourceKind: "revision_instruction" as const,
    };
    const { provider, calls } = providerWithResponses([{
      definition: input.baseDefinition,
    }]);

    await provider.generateCharacterDefinitionV2(input);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.label, "generateCharacterDefinitionV2");
  });

  it("rejects an invalid review fill instead of treating it as no revision", async () => {
    const input = definitionInput();
    const { provider } = providerWithResponses([{
      verdict: "revise",
      issues: [{ code: "norm", path: "actionNorms", message: "structure required" }],
      fill: {
        actionNorms: [{
          id: "shorthand",
          statement: "待つ",
          force: "constraint",
          selfAwareness: "aware",
        }],
      },
    }]);

    await assert.rejects(
      provider.reviewCharacterDefinitionV2({
        sourceText: input.sourceText,
        sourceKind: input.sourceKind,
        baseDefinition: input.baseDefinition,
        candidate: input.baseDefinition,
        gaps: ["actionNorms"],
        findings: [],
      }),
      /Required|Unrecognized key/,
    );
  });
});

function battlefieldInput(): GenerateBattlefieldDefinitionV2Input {
  return {
    sourceKind: "upgrade_description",
    sourceText: "霧に沈む石造遺跡。中央広場と崩れた回廊がある。",
    baseDefinition: legacyBattlefieldPresetToDefinitionV2({
      id: "field-upgrade",
      ownerUserId: "owner-upgrade",
      isSystem: false,
      displayName: "霧の遺跡",
      category: "ruins",
      tags: ["霧"],
      createdAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:00:00.000Z",
      appearance: {
        summary: "霧に沈む石造遺跡",
        visualPrompt: "misty stone ruins",
        imageUrl: null,
      },
      terrainHints: ["中央広場"],
      obstacleHints: [],
      conditionHints: [],
      baseCoefficients: { damage: 0.9 },
      narrativeBlurb: "霧に閉ざされた遺跡。",
    }),
  };
}

describe("OpenAI-compatible battlefield definition fill", () => {
  it("applies a natural string-description fill without repair", async () => {
    const input = battlefieldInput();
    const { provider, calls } = providerWithResponses([{
      fill: {
        atmosphere: ["濃霧"],
        scale: null,
        genre: null,
        areas: null,
        objects: [{
          id: "pillar",
          label: "石柱",
          description: "倒れた石柱",
          area: "中央広場",
          portable: false,
          usable: false,
          cover: "partial",
          blocking: true,
        }],
        effects: null,
        evolutionAffordances: [{
          id: "fog",
          pressure: "visibility_shift",
          description: "霧だけが濃くなる",
        }],
      },
    }]);

    const definition = await provider.generateBattlefieldDefinitionV2(input);

    assert.deepEqual(definition.identity.atmosphere, ["濃霧"]);
    assert.equal(definition.objects[0]?.label, "石柱");
    assert.equal(definition.evolutionAffordances[0]?.pressure, "visibility_shift");
    assert.equal(definition.baseCoefficients.damage, 0.9);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.label, "fillBattlefieldDefinitionGapsV2");
  });
});
