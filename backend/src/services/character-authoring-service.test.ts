import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultParameters,
  type CharacterDefinitionV2,
  type CharacterSheet,
} from "@kshiai/shared";
import { MockLlmProvider } from "../llm/mock.js";
import type {
  GenerateCharacterDefinitionV2Input,
  GenerateCharacterProfileInput,
  GenerateCharacterResult,
  ValidateCharacterProfileClaimsInput,
} from "../llm/types.js";
import type { ReviewCharacterDefinitionV2Input } from "../llm/types.js";
import {
  buildCharacterGenerationCandidate,
  CHARACTER_DEFINITION_CHECK_FAILED,
  existingCharacterGenerationResult,
  lastAuthoringAdjustment,
} from "./character-authoring-service.js";

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
  reviewInput: ReviewCharacterDefinitionV2Input | null = null;

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

  override async reviewCharacterDefinitionV2(
    input: ReviewCharacterDefinitionV2Input,
  ) {
    this.calls.push("review");
    this.reviewInput = structuredClone(input);
    return super.reviewCharacterDefinitionV2(input);
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
    const statuses: string[] = [];
    const result = await buildCharacterGenerationCandidate({
      llm: provider,
      attemptId: "attempt-claim-order",
      characterId: "character-claim-order",
      ownerUserId: "owner-claim-order",
      sourceText: "PRIVATE_SOURCE_SENTINEL",
      sourceKind: "create_instruction",
      generated: generatedCharacter(),
      reportStatus: async (status) => {
        statuses.push(status);
      },
    });

    assert.deepEqual(provider.calls, [
      "structure",
      "review",
      "profile",
      "claim-validator",
    ]);
    assert.deepEqual(statuses, [
      "generating_structure",
      "validating_structure",
      "generating_description",
      "validating_description",
    ]);
    assert.ok(provider.reviewInput);
    assert.equal(provider.reviewInput!.sourceKind, "create_instruction");
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

  it("upgrades from the existing sheet and restores drifted mechanics", async () => {
    class DriftingUpgradeProvider extends RecordingClaimProvider {
      override async generateCharacterDefinitionV2(
        input: GenerateCharacterDefinitionV2Input,
      ): Promise<CharacterDefinitionV2> {
        this.calls.push("structure");
        const definition = await super.generateCharacterDefinitionV2(input);
        return {
          ...definition,
          identity: { ...definition.identity, displayName: "別人" },
          combat: {
            ...definition.combat,
            parameters: { ...definition.combat.parameters, atk: 99 },
          },
        };
      }
    }

    const existing: CharacterSheet = {
      id: "character-upgrade-existing",
      ownerUserId: "owner-upgrade",
      createdAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:00:00.000Z",
      ...generatedCharacter().sheet,
      displayName: "灯",
      narrativeBlurb: "火を守る旅人。",
    };
    const provider = new DriftingUpgradeProvider();
    const result = await buildCharacterGenerationCandidate({
      llm: provider,
      attemptId: "attempt-upgrade-restore",
      characterId: existing.id,
      ownerUserId: existing.ownerUserId,
      sourceText: existing.narrativeBlurb,
      sourceKind: "upgrade_description",
      generated: existingCharacterGenerationResult(existing),
      existing,
    });

    assert.ok(provider.calls.includes("review"));
    assert.equal(result.envelope.definition.identity.displayName, "灯");
    assert.notEqual(result.envelope.definition.combat.parameters.atk, 99);
    assert.equal(
      result.envelope.definition.expressionNotes?.text.includes("火を守る"),
      true,
    );
  });

  it("applies a self-review fill and fails closed when checks still fail", async () => {
    class RevisingProvider extends RecordingClaimProvider {
      override async reviewCharacterDefinitionV2() {
        this.calls.push("review");
        return {
          verdict: "revise" as const,
          issues: [{
            code: "missing_background",
            path: "profileBackground",
            message: "source supports a traveler origin",
          }],
          fill: {
            profileBackground: [{
              id: "background-origin",
              kind: "origin" as const,
              summary: "火を守る旅",
              description: {
                text: "火を守る旅人として各地を歩く。",
                consumerTags: ["profile-generator" as const],
                sourceSupportRefs: [],
              },
              selfAwareness: "aware" as const,
            }],
          },
        };
      }
    }

    const revised = await buildCharacterGenerationCandidate({
      llm: new RevisingProvider(),
      attemptId: "attempt-review-revise",
      characterId: "character-review-revise",
      ownerUserId: "owner-review-revise",
      sourceText: "火を守る旅人。",
      sourceKind: "upgrade_description",
      generated: existingCharacterGenerationResult({
        id: "character-review-revise",
        ownerUserId: "owner-review-revise",
        createdAt: "2026-08-14T00:00:00.000Z",
        updatedAt: "2026-08-14T00:00:00.000Z",
        ...generatedCharacter().sheet,
        narrativeBlurb: "火を守る旅人。",
      }),
      existing: {
        id: "character-review-revise",
        ownerUserId: "owner-review-revise",
        createdAt: "2026-08-14T00:00:00.000Z",
        updatedAt: "2026-08-14T00:00:00.000Z",
        ...generatedCharacter().sheet,
        narrativeBlurb: "火を守る旅人。",
      },
    });
    assert.equal(
      revised.envelope.definition.profileBackground[0]?.id,
      "background-origin",
    );

    class BrokenReviewProvider extends RecordingClaimProvider {
      override async reviewCharacterDefinitionV2() {
        return {
          verdict: "revise" as const,
          issues: [],
          fill: {
            actionNorms: [{
              id: "norm-bad",
              when: {
                match: "all" as const,
                clauses: [{
                  kind: "always" as const,
                  operator: "is" as const,
                  value: "true",
                }],
              },
              response: {
                disposition: "prefer" as const,
                actionRefs: ["missing-action"],
                actionKinds: [],
                tacticTags: [],
                statement: "存在しない行動を使う",
                fallbackActionRef: null,
              },
              priority: 10,
              force: "preference" as const,
              selfAwareness: "aware" as const,
              exceptions: [],
              description: null,
            }],
          },
        };
      }
    }

    await assert.rejects(
      buildCharacterGenerationCandidate({
        llm: new BrokenReviewProvider(),
        attemptId: "attempt-review-invalid",
        characterId: "character-review-invalid",
        ownerUserId: "owner-review-invalid",
        sourceText: "火を守る旅人。",
        sourceKind: "upgrade_description",
        generated: generatedCharacter(),
      }),
      new RegExp(CHARACTER_DEFINITION_CHECK_FAILED),
    );
  });
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
