import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  OpenAiCompatibleProvider,
  type ChatOpts,
} from "./openai-compatible.js";

type CompactPsycheInput = Parameters<
  OpenAiCompatibleProvider["advanceCharacterPsyche"]
>[0];

const RepairRequestProbeSchema = z.object({
  validationIssues: z.array(z.object({
    path: z.array(z.string()),
    code: z.string(),
  })),
  rejectedSemanticSlice: z.record(z.string(), z.unknown()),
  writableRoots: z.array(z.string()),
});

function compactV2Input(): CompactPsycheInput {
  return {
    contextMode: "compact",
    contractVersion: 2,
    phase: "turn",
    character: {
      schemaVersion: 1,
      displayName: "アカリ",
      identity: {
        realName: null,
        nicknames: [],
        selfNames: ["私"],
        epithets: [],
        gender: null,
        age: null,
      },
      tags: ["test"],
      appearanceSummary: "簡素な旅装をまとっている",
      traits: ["観察を言葉へ反映する"],
      narrativeBlurb: "相手の変化を見て言葉を選び直す。",
      basicAction: { name: "一歩進む", description: "距離を測る。" },
      skills: [],
      equipment: { weapon: null, armor: null },
    },
    expressionState: {
      privateMemory: "保持する記憶",
      currentGoal: "相手の反応を確かめる",
      emotion: "平静",
      beliefs: [],
      observations: [],
      speechStyle: "短く率直に話す",
      interior: {
        primaryEmotion: "平静",
        concealedEmotion: null,
        coreNeed: "相互理解",
        protectiveStance: "急いで決めつけない",
        eventAppraisal: "相手の位置を捉えた",
        unspokenIntent: "反応を引き出す",
        currentConcern: "言葉が届くか",
        attitudeTowardCounterpart: "観察している",
        confidence: "steady",
        relationshipTension: "まだ測っている",
        speechMode: "weave",
      },
      dialogueThread: {
        topic: "互いの位置",
        unresolvedMove: "まだ言葉を交わしていない",
        anchoredExchange: null,
      },
      battleVolatileMemory: "",
    },
    utteranceHistory: { recent: [] },
    turnObservation: {
      schemaVersion: 1,
      turn: 1,
      observerSide: "a",
      selfResult: [],
      counterpartResult: [{
        phenomenon: "相手の姿と位置を明瞭に捉えた",
        certainty: "certain",
        sourceEventIds: ["evt.1"],
      }],
      ambientChange: [],
    },
  };
}

function appraisal(input?: {
  anticipatedImpact?: string;
  continuityDecision?: "advance" | "reframe";
}) {
  const continuityDecision = input?.continuityDecision ?? "advance";
  return {
    anticipatedImpact: input?.anticipatedImpact ?? "相手から応答を引き出す",
    observedImpact: "前の発話はまだない",
    anticipatedSocialConsequence: {
      bearer: "relationship",
      meaning: "性急に迫れば対話の距離を固定してしまう",
    },
    observedSocialConsequence: {
      bearer: "self",
      meaning: "まだ言葉の効力を確かめられていない",
    },
    nextApproach: continuityDecision === "reframe"
      ? "位置の確認から相互認識へ角度を変える"
      : "相手の存在を認めて応答を待つ",
    continuityPosture: continuityDecision === "reframe" ? "fraying" : "opening",
    continuityBasis: {
      kind: continuityDecision === "reframe" ? "social_reappraisal" : "fresh_leverage",
      reason: continuityDecision === "reframe"
        ? "位置を捉えただけでは応答の有無を判断できない"
        : "相手の位置を新しく明瞭に捉えた",
    },
    continuityDecision,
  };
}

function expressionBrief(
  continuityDecision: "advance" | "reframe" = "advance",
) {
  return {
    sourceThread: "action_reaction",
    continuityDecision,
    focus: ["counterpart_result"],
    observedImpact: continuityDecision === "reframe"
      ? "位置の確認だけでは応答を得られない"
      : "相手の位置を確認できた",
    relationshipMove: continuityDecision === "reframe"
      ? "存在確認から応答の余地を作る"
      : "互いの存在を認める",
    publicAim: "相手から応答を引き出す",
  };
}

function candidate(input?: { anticipatedImpact?: string }) {
  return {
    delta: {
      emotion: "集中",
      interior: {
        speechAppraisal: appraisal({
          anticipatedImpact: input?.anticipatedImpact,
        }),
      },
      dialogueThread: {
        topic: "互いの位置",
        unresolvedMove: "まだ応答がない",
        anchoredExchange: null,
      },
    },
    expressionBrief: expressionBrief(),
    narrativeCues: [{
      access: "self_inner",
      description: "位置の把握を応答の可能性として測る",
      sourceEventIds: ["evt.1"],
    }],
  };
}

class StubProvider extends OpenAiCompatibleProvider {
  readonly calls: Array<{ system: string; user: string; opts?: ChatOpts }> = [];

  constructor(private readonly responses: unknown[]) {
    super({
      name: "xai",
      apiKey: "test-only",
      baseUrl: "https://example.invalid/v1",
      modelEngine: "grok-4.3",
      modelFast: "grok-4.3",
    });
  }

  protected override async chatJson(
    system: string,
    user: string,
    opts?: ChatOpts,
  ): Promise<unknown> {
    this.calls.push({ system, user, opts });
    const response = this.responses[this.calls.length - 1];
    if (response === undefined) throw new Error("unexpected provider call");
    return structuredClone(response);
  }
}

function providerWithResponses(responses: unknown[]) {
  const provider = new StubProvider(responses);
  return { provider, calls: provider.calls };
}

function requiredCall(
  calls: Array<{ system: string; user: string; opts?: ChatOpts }>,
  index: number,
) {
  const call = calls[index];
  assert.ok(call, `provider call ${index + 1} is missing`);
  return call;
}

describe("Compact V2 psyche semantic-closure repair", () => {
  it("keeps the valid first-result path to one call and states the non-empty contract", async () => {
    const { provider, calls } = providerWithResponses([candidate()]);

    await provider.advanceCharacterPsyche(compactV2Input());

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.opts?.label, "advanceCharacterPsycheCompact");
    const firstCall = requiredCall(calls, 0);
    assert.match(firstCall.system, /All six strings below are required/);
    assert.doesNotMatch(firstCall.system, /"anticipatedImpact":""/);
    assert.match(
      firstCall.system,
      /"unresolvedMove": string \(use an empty string when no unresolved move exists\)/,
    );
  });

  it("repairs the full semantic closure and preserves unrelated candidate state", async () => {
    const rejected = candidate({ anticipatedImpact: "" });
    const repairedAppraisal = appraisal({ continuityDecision: "reframe" });
    const repairedBrief = expressionBrief("reframe");
    const { provider, calls } = providerWithResponses([
      rejected,
      {
        replacement: {
          speechAppraisal: repairedAppraisal,
          expressionBrief: repairedBrief,
          dialogueThread: {
            topic: "応答の可能性",
            unresolvedMove: "位置確認だけでは応答にならない",
            anchoredExchange: null,
          },
        },
      },
    ]);

    const result = await provider.advanceCharacterPsyche(compactV2Input());

    assert.equal(calls.length, 2);
    assert.equal(calls[1]?.opts?.label, "advanceCharacterPsycheCompactRepair");
    assert.equal(calls[1]?.opts?.temperature, 0.2);
    const rawRepairRequest: unknown = JSON.parse(requiredCall(calls, 1).user);
    const repairRequest = RepairRequestProbeSchema.parse(rawRepairRequest);
    assert.ok(repairRequest.validationIssues.some((issue) =>
      issue.path.join(".") ===
        "delta.interior.speechAppraisal.anticipatedImpact" &&
      issue.code === "too_small"
    ));
    assert.equal("emotion" in repairRequest.rejectedSemanticSlice, false);
    assert.deepEqual(repairRequest.writableRoots, [
      "replacement.speechAppraisal",
      "replacement.expressionBrief",
      "replacement.dialogueThread",
      "replacement.observableManifestations",
      "replacement.narrativeCues",
    ]);
    assert.equal(result.delta?.emotion, "集中");
    assert.equal(
      result.delta?.interior?.speechAppraisal?.anticipatedImpact,
      repairedAppraisal.anticipatedImpact,
    );
    assert.equal(
      result.delta?.interior?.speechAppraisal?.continuityDecision,
      "reframe",
    );
    assert.deepEqual(
      result.delta?.interior?.speechAppraisal?.continuityBasis,
      repairedAppraisal.continuityBasis,
    );
    assert.deepEqual(result.expressionBrief, repairedBrief);
    assert.deepEqual(result.narrativeCues, rejected.narrativeCues);
  });

  it("states the complete brief contract when repairing a missing expression brief", async () => {
    const base = candidate();
    const rejected = {
      delta: base.delta,
      narrativeCues: base.narrativeCues,
    };
    const repairedBrief = expressionBrief();
    const { provider, calls } = providerWithResponses([
      rejected,
      {
        replacement: {
          speechAppraisal: appraisal(),
          expressionBrief: repairedBrief,
        },
      },
    ]);

    const result = await provider.advanceCharacterPsyche(compactV2Input());

    assert.equal(calls.length, 2);
    assert.match(
      requiredCall(calls, 1).system,
      /"sourceThread":"action_reaction\|conversation_continuation\|weave"/,
    );
    assert.match(
      requiredCall(calls, 1).system,
      /"focus":\[one or two of self_result,counterpart_result,ambient_change,counterpart_speech\]/,
    );
    assert.deepEqual(result.expressionBrief, repairedBrief);
  });

  it("rejects an unauthorized repair root without a recursive repair", async () => {
    const { provider, calls } = providerWithResponses([
      candidate({ anticipatedImpact: "" }),
      {
        replacement: {
          speechAppraisal: appraisal(),
          expressionBrief: expressionBrief(),
          emotion: "範囲外",
        },
      },
    ]);

    await assert.rejects(
      provider.advanceCharacterPsyche(compactV2Input()),
      /repair\.replacement:unrecognized_keys/,
    );
    assert.equal(calls.length, 2);
  });

  it("revalidates cross-field meaning after merge and does not repair twice", async () => {
    const { provider, calls } = providerWithResponses([
      candidate({ anticipatedImpact: "" }),
      {
        replacement: {
          speechAppraisal: appraisal({ continuityDecision: "reframe" }),
          expressionBrief: expressionBrief("advance"),
        },
      },
    ]);

    await assert.rejects(
      provider.advanceCharacterPsyche(compactV2Input()),
      /expressionBrief\.continuityDecision:custom/,
    );
    assert.equal(calls.length, 2);
  });

  it("allows an explicit empty cue array to clear an affected optional root", async () => {
    const { provider } = providerWithResponses([
      candidate({ anticipatedImpact: "" }),
      {
        replacement: {
          speechAppraisal: appraisal(),
          expressionBrief: expressionBrief(),
          narrativeCues: [],
        },
      },
    ]);

    const result = await provider.advanceCharacterPsyche(compactV2Input());

    assert.deepEqual(result.narrativeCues, []);
  });

  it("does not repair a schema error outside the declared semantic group", async () => {
    const rejected = {
      ...candidate(),
      narrativeCues: [{
        access: "self_inner",
        description: "位置を測る",
        sourceEventIds: [""],
      }],
    };
    const { provider, calls } = providerWithResponses([rejected]);

    await assert.rejects(
      provider.advanceCharacterPsyche(compactV2Input()),
      /narrativeCues\.0\.sourceEventIds\.0:too_small/,
    );
    assert.equal(calls.length, 1);
  });
});
