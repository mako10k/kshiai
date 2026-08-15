import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultParameters,
  legacyCharacterSheetToDefinitionV2,
  type CharacterDefinitionV2,
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

function definitionMissingActionNormResponse(
  _base: CharacterDefinitionV2,
): Record<string, unknown> {
  return {
    actionNorms: [{
      id: "ask-after-observing",
      when: {
        match: "all",
        clauses: [{ kind: "always", operator: "is", value: "true" }],
      },
      priority: 50,
      force: "preference",
      selfAwareness: "aware",
      exceptions: [],
      description: null,
    }],
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
  it("does not issue a repair call for an initially valid definition", async () => {
    const input = definitionInput();
    const { provider, calls } = providerWithResponses([
      { fill: {} },
    ]);

    const definition = await provider.generateCharacterDefinitionV2(input);

    assert.deepEqual(definition, input.baseDefinition);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.label, "fillCharacterDefinitionGapsV2");
  });

  it("repairs one strict-schema failure with its bounded validation receipt", async () => {
    const input = definitionInput();
    const invalid = definitionMissingActionNormResponse(input.baseDefinition);
    const { provider, calls } = providerWithResponses([
      { fill: invalid },
      { fill: {} },
    ]);

    const definition = await provider.generateCharacterDefinitionV2(input);

    assert.deepEqual(definition, input.baseDefinition);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.label, "fillCharacterDefinitionGapsV2");
    assert.equal(calls[1]?.label, "fillCharacterDefinitionGapsV2Repair");
    const repair = JSON.parse(calls[1]!.user) as {
      sourceKind: string;
      validationIssues: Array<{ path: Array<string | number> }>;
    };
    assert.equal(repair.sourceKind, "upgrade_description");
    const responseIssue = repair.validationIssues.find(
      (issue) => issue.path[0] === "actionNorms",
    );
    assert.deepEqual(responseIssue?.path, ["actionNorms", 0, "response"]);
  });

  it("fails closed after one unsuccessful repair attempt", async () => {
    const input = definitionInput();
    const invalid = definitionMissingActionNormResponse(input.baseDefinition);
    const { provider, calls } = providerWithResponses([
      { fill: invalid },
      { fill: invalid },
    ]);

    await assert.rejects(
      provider.generateCharacterDefinitionV2(input),
      /actionNorms/,
    );
    assert.equal(calls.length, 2);
  });
});
