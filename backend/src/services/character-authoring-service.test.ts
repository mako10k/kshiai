import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultParameters,
  type CharacterDefinitionV2,
} from "@kshiai/shared";
import { MockLlmProvider } from "../llm/mock.js";
import type {
  GenerateCharacterDefinitionV2Input,
  GenerateCharacterProfileInput,
  GenerateCharacterResult,
  ValidateCharacterProfileClaimsInput,
} from "../llm/types.js";
import { buildCharacterGenerationCandidate } from "./character-authoring-service.js";

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
      skills: [],
      weapon: null,
      armor: null,
      combatFlags: { canFight: true, irreversibleIncapacitated: false },
      narrativeBlurb: "この第一段階の文章は捨てられる。",
    },
  };
}

class RecordingClaimProvider extends MockLlmProvider {
  readonly calls: string[] = [];
  claimInput: ValidateCharacterProfileClaimsInput | null = null;

  override async generateCharacterDefinitionV2(
    input: GenerateCharacterDefinitionV2Input,
  ): Promise<CharacterDefinitionV2> {
    this.calls.push("structure");
    const definition = await super.generateCharacterDefinitionV2(input);
    return {
      ...definition,
      psycheDisposition: {
        ...definition.psycheDisposition,
        dynamics: {
          ...definition.psycheDisposition.dynamics,
          adverseSensitivity: 731,
        },
      },
    };
  }

  override async generateCharacterProfile(input: GenerateCharacterProfileInput) {
    this.calls.push("profile");
    return super.generateCharacterProfile(input);
  }

  override async validateCharacterProfileClaims(
    input: ValidateCharacterProfileClaimsInput,
  ) {
    this.calls.push("claim-validator");
    this.claimInput = structuredClone(input);
    return super.validateCharacterProfileClaims(input);
  }
}

describe("structured character authoring claim validation", () => {
  it("runs after profile generation with only the public projection and candidate", async () => {
    const provider = new RecordingClaimProvider();
    const result = await buildCharacterGenerationCandidate({
      llm: provider,
      attemptId: "attempt-claim-order",
      characterId: "character-claim-order",
      ownerUserId: "owner-claim-order",
      sourceText: "PRIVATE_SOURCE_SENTINEL",
      sourceKind: "create_instruction",
      generated: generatedCharacter(),
    });

    assert.deepEqual(provider.calls, ["structure", "profile", "claim-validator"]);
    assert.ok(provider.claimInput);
    assert.deepEqual(Object.keys(provider.claimInput!).sort(), ["profile", "projection"]);
    const serialized = JSON.stringify(provider.claimInput);
    assert.equal(serialized.includes("PRIVATE_SOURCE_SENTINEL"), false);
    assert.equal(serialized.includes("731"), false);
    assert.equal(serialized.includes("dynamics"), false);
    assert.equal(
      result.envelope.publicPresentation.claimValidation?.validatorContract,
      "character-profile-claim-validator-v1",
    );
    assert.ok(result.envelope.compilerCompatibility.some((compiler) =>
      compiler.consumer === "character-profile-claim-validator" &&
      compiler.version === 1));
  });

  it("does not produce an activatable envelope for an unsupported material claim", async () => {
    class RejectingProvider extends RecordingClaimProvider {
      override async validateCharacterProfileClaims(
        input: ValidateCharacterProfileClaimsInput,
      ) {
        this.claimInput = structuredClone(input);
        return {
          segments: input.profile.segments.map((segment) => ({
            segmentId: segment.id,
            verdict: "unsupported" as const,
            supportRefs: [],
            riskCodes: ["history_event" as const],
          })),
        };
      }
    }

    await assert.rejects(
      buildCharacterGenerationCandidate({
        llm: new RejectingProvider(),
        attemptId: "attempt-claim-rejected",
        characterId: "character-claim-rejected",
        ownerUserId: "owner-claim-rejected",
        sourceText: "公開可能な情報だけで作る",
        sourceKind: "create_instruction",
        generated: generatedCharacter(),
      }),
      /PROFILE_UNSUPPORTED_CLAIM/,
    );
  });
});
