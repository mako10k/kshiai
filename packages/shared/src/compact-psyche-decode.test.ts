import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CharacterDeepPsycheCompactAdvanceSchema } from "./battle.js";
import {
  compactDeepPsycheIssueSummaries,
  decodeCompactDeepPsycheAdvance,
} from "./compact-psyche-decode.js";

const valid = {
  delta: {
    interior: {
      speechAppraisal: {
        anticipatedImpact: "相手の返答を待つ",
        observedImpact: "返答は得られなかった",
        anticipatedSocialCost: "待ち続ければ相手の注意を失う",
        observedSocialCost: "前の待機は返答を引き出せなかった",
        anticipatedSocialConsequence: {
          bearer: "relationship" as const,
          meaning: "待ち続ければ対話の距離が遠のく",
        },
        observedSocialConsequence: {
          bearer: "self" as const,
          meaning: "前の待機で自分の問いへの確信が揺らいだ",
        },
        nextApproach: "別の角度から距離を測る",
        continuityPosture: "fraying" as const,
        continuityBasis: {
          kind: "social_reappraisal" as const,
          reason: "返答がないことで別の距離の測り方が見えた",
        },
        continuityDecision: "reframe" as const,
      },
    },
  },
  expressionBrief: {
    sourceThread: "conversation_continuation" as const,
    continuityDecision: "reframe" as const,
    focus: ["counterpart_speech"],
  },
};

describe("compact psyche decoder", () => {
  it("accepts a successful JSON object that carries unknown envelope keys", () => {
    const decoded = decodeCompactDeepPsycheAdvance({
      ...valid,
      notes: "model extra",
      delta: {
        ...valid.delta,
        scratch: "drop me",
        interior: {
          ...valid.delta.interior,
          speechAppraisal: {
            ...valid.delta.interior.speechAppraisal,
            aside: "drop me too",
          },
        },
      },
      expressionBrief: {
        ...valid.expressionBrief,
        quote: "not a schema field",
      },
    });
    assert.equal(CharacterDeepPsycheCompactAdvanceSchema.safeParse(decoded).success, true);
    assert.equal(
      CharacterDeepPsycheCompactAdvanceSchema.safeParse({
        ...valid,
        notes: "model extra",
      }).success,
      false,
    );
  });

  it("lifts legacy cost strings into consequence objects", () => {
    const decoded = decodeCompactDeepPsycheAdvance({
      delta: {
        interior: {
          speechAppraisal: {
            anticipatedImpact: "相手の返答を待つ",
            observedImpact: "返答は得られなかった",
            anticipatedSocialCost: "待ち続ければ相手の注意を失う",
            observedSocialCost: "前の待機は返答を引き出せなかった",
            nextApproach: "別の角度から距離を測る",
            continuityPosture: "fraying",
            continuityBasis: {
              kind: "social_reappraisal",
              reason: "返答がないことで別の距離の測り方が見えた",
            },
            continuityDecision: "reframe",
          },
        },
      },
      expressionBrief: valid.expressionBrief,
    });
    const parsed = CharacterDeepPsycheCompactAdvanceSchema.safeParse(decoded);
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(
      parsed.data.delta.interior.speechAppraisal.anticipatedSocialConsequence.meaning,
      "待ち続ければ相手の注意を失う",
    );
  });

  it("still rejects a missing compact speech appraisal and reports the path", () => {
    const decoded = decodeCompactDeepPsycheAdvance({
      delta: { interior: {} },
      expressionBrief: valid.expressionBrief,
    });
    assert.equal(CharacterDeepPsycheCompactAdvanceSchema.safeParse(decoded).success, false);
    const issues = compactDeepPsycheIssueSummaries(decoded);
    assert.ok(issues.some((issue) => issue.path.includes("speechAppraisal")));
  });
});
