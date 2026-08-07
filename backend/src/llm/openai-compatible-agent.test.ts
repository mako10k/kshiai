import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHARACTER_ACTION_PROPOSAL_OUTPUT_RULES } from "./openai-compatible.js";

describe("character-agent action proposal prompt", () => {
  it("defines mutually exclusive action-kind output shapes", () => {
    for (const kind of [
      "skill",
      "basic_attack",
      "defend",
      "rest",
      "wait",
      "free_action",
    ]) {
      assert.match(
        CHARACTER_ACTION_PROPOSAL_OUTPUT_RULES,
        new RegExp(`- ${kind}:`),
      );
    }
    assert.match(
      CHARACTER_ACTION_PROPOSAL_OUTPUT_RULES,
      /description, desiredOutcome, subjectRefs, and opportunityId are free_action-only/,
    );
    assert.match(
      CHARACTER_ACTION_PROPOSAL_OUTPUT_RULES,
      /useFinisher and skillId are skill-only/,
    );
    assert.match(
      CHARACTER_ACTION_PROPOSAL_OUTPUT_RULES,
      /instrumentRef is allowed only for skill, basic_attack, or defend/,
    );
  });
});
