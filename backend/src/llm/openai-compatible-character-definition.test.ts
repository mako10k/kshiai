import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultParameters,
  legacyCharacterSheetToDefinitionV2,
} from "@kshiai/shared";
import type { GenerateCharacterDefinitionV2Input } from "./types.js";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";

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
  };
}

function naturalStringFill(): Record<string, unknown> {
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
      statement: "相手の動きを見てから問いかける",
      force: "preference",
      selfAwareness: "aware",
    }],
    expressionNotes: null,
  };
}

function providerWithResponses(responses: unknown[]): {
  provider: OpenAiCompatibleProvider;
  calls: ChatCall[];
} {
  const provider = new OpenAiCompatibleProvider({
    name: "xai",
    apiKey: "test-only",
    baseUrl: "https://example.invalid/v1",
    modelEngine: "grok-4.5",
    modelFast: "grok-4-fast-non-reasoning",
  });
  const calls: ChatCall[] = [];
  const privateProvider = provider as unknown as {
    chatJson(
      system: string,
      user: string,
      opts?: { label?: string; responseFormat?: unknown },
    ): Promise<unknown>;
  };
  privateProvider.chatJson = async (system, user, opts) => {
    calls.push({
      system,
      user,
      label: opts?.label,
      responseFormat: opts?.responseFormat,
    });
    const response = responses[calls.length - 1];
    if (response === undefined) throw new Error("unexpected provider call");
    return structuredClone(response);
  };
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
    const format = calls[0]?.responseFormat as {
      json_schema?: { name?: string; schema?: { properties?: Record<string, unknown> } };
    };
    assert.equal(format.json_schema?.name, "character_definition_fill_v2");
    assert.ok(format.json_schema?.schema?.properties);
    assert.equal(
      "identity" in (format.json_schema?.schema?.properties ?? {}),
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
});
