import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";
import {
  COMBINED_PERCEPTION_RESPONSE_FORMAT,
  COMBINED_PERCEPTION_SYSTEM_PROMPT,
  PERCEPTION_PROMPT_FIXTURES,
  type PerceptionPromptResponseFormat,
} from "./perception-prompt-strategy.js";

describe("XAI perception reconciliation", () => {
  it("keeps a valid world patch when the combined sensory section is invalid", async () => {
    const provider = new OpenAiCompatibleProvider({
      name: "xai",
      apiKey: "test-only",
      baseUrl: "https://example.invalid/v1",
      modelEngine: "grok-4-fast-non-reasoning",
      modelFast: "grok-4-fast-non-reasoning",
    });
    let observedSystem = "";
    let observedResponseFormat: PerceptionPromptResponseFormat | undefined;
    const privateProvider = provider as unknown as {
      chatJson(
        system: string,
        user: string,
        opts: { responseFormat?: PerceptionPromptResponseFormat },
      ): Promise<unknown>;
    };
    privateProvider.chatJson = async (system, _user, opts) => {
      observedSystem = system;
      observedResponseFormat = opts.responseFormat;
      return {
        patch: { operations: [] },
        nextSituation: null,
        sensoryEvidence: [{ invalid: true }],
      };
    };
    const fixture = PERCEPTION_PROMPT_FIXTURES[0]!;
    const result = await provider.reconcileTurnSemanticState({
      ...fixture.input,
      battlefield: undefined,
    });
    assert.equal(observedSystem, COMBINED_PERCEPTION_SYSTEM_PROMPT);
    assert.equal(
      observedResponseFormat,
      COMBINED_PERCEPTION_RESPONSE_FORMAT,
    );
    assert.deepEqual(result.patch?.operations, []);
    assert.equal(result.sensoryEvidenceStatus, "rejected");
    assert.deepEqual(result.sensoryEvidence, []);
  });

  it("keeps valid sensory evidence when the combined world section is invalid", async () => {
    const provider = new OpenAiCompatibleProvider({
      name: "xai",
      apiKey: "test-only",
      baseUrl: "https://example.invalid/v1",
      modelEngine: "grok-4-fast-non-reasoning",
      modelFast: "grok-4-fast-non-reasoning",
    });
    const privateProvider = provider as unknown as {
      chatJson(): Promise<unknown>;
    };
    const fixture = PERCEPTION_PROMPT_FIXTURES[0]!;
    privateProvider.chatJson = async () => ({
      patch: { operations: [{ op: "unsupported" }] },
      nextSituation: null,
      sensoryEvidence: fixture.expectedSensoryEvidence,
    });
    const result = await provider.reconcileTurnSemanticState({
      ...fixture.input,
      battlefield: undefined,
    });
    assert.equal(result.worldPatchStatus, "rejected");
    assert.equal(result.patch, null);
    assert.equal(result.sensoryEvidenceStatus, "valid");
    assert.deepEqual(result.sensoryEvidence, fixture.expectedSensoryEvidence);
  });
});
