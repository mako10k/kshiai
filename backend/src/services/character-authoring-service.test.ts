// R: Verify the retired legacy authoring entry rejects before work and retains adjustment parsing.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultParameters, defaultBasicAttack } from "@kshiai/shared";
import { MockLlmProvider } from "../llm/mock.js";
import type { GenerateCharacterResult } from "../llm/types.js";
import { buildCharacterGenerationCandidate, lastAuthoringAdjustment } from "./character-authoring-service.js";

function generatedCharacter(): GenerateCharacterResult {
  return {
    assistantMessage: "構造化しました。",
    sheet: {
      displayName: "灯",
      identity: {
        realName: null,
        nicknames: [],
        selfNames: ["私"],
        epithets: [],
        gender: null,
        age: null,
      },
      visibility: "public",
      tags: [],
      deletedAt: null,
      appearance: {
        summary: "赤い外套をまとう",
        visualPrompt: "adult traveler in a red cloak",
        imageUrl: null,
      },
      traits: ["慎重"],
      parameters: defaultParameters(),
      basicAttack: defaultBasicAttack(),
      skills: [],
      weapon: null,
      armor: null,
      combatFlags: { canFight: true, irreversibleIncapacitated: false },
      narrativeBlurb: "この第一段階の文章は捨てられる。",
    },
  };
}

class RejectWorkProvider extends MockLlmProvider {
  calls = 0;
  override async generateCharacterDefinitionV2(): Promise<never> { this.calls++; throw new Error("UNEXPECTED_PROVIDER_WORK"); }
  override async reviewCharacterDefinitionV2(): Promise<never> { this.calls++; throw new Error("UNEXPECTED_PROVIDER_WORK"); }
  override async generateCharacterProfile(): Promise<never> { this.calls++; throw new Error("UNEXPECTED_PROVIDER_WORK"); }
  override async validateCharacterProfileClaims(): Promise<never> { this.calls++; throw new Error("UNEXPECTED_PROVIDER_WORK"); }
}

describe("retired legacy character authoring boundary", () => {
  // ADR0043 retains migration/historical import readers, not this former V2 writer.
  for (const sourceKind of ["create_instruction", "revision_instruction", "upgrade_description", "import"] as const) {
    it(`rejects ${sourceKind} before provider work or progress publication`, async () => {
      const provider = new RejectWorkProvider();
      const statuses: string[] = [];
      const generated = generatedCharacter();
      const before = structuredClone(generated);
      await assert.rejects(buildCharacterGenerationCandidate({
        llm: provider, attemptId: `retired-${sourceKind}`, characterId: "retired-character",
        ownerUserId: "retired-owner", sourceText: "火を守る旅人。", sourceKind, generated,
        reportStatus: async (status) => { statuses.push(status); },
      }), { message: "LEGACY_CHARACTER_AUTHORING_RETIRED" });
      assert.equal(provider.calls, 0);
      assert.deepEqual(statuses, []);
      assert.deepEqual(generated, before);
    });
  }
});

describe("lastAuthoringAdjustment", () => {
  it("reads the last 追加調整 suffix", () => {
    assert.equal(lastAuthoringAdjustment("元の依頼"), null);
    assert.equal(
      lastAuthoringAdjustment("元の依頼\n\n追加調整: 髪を短く\n\n追加調整: 声を低く"),
      "声を低く",
    );
  });
});
