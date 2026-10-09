// R: Verify adjudication compression preserves typed facts, ordering and bounded data handling.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderAdjudicationPrompt } from "./adjudication-prompt-prose.js";
import { renderPromptSections } from "./prompt-prose.js";

describe("compact adjudication facts", () => {
  it("preserves strings, numbers, booleans, null, empty containers and ordered attempts", () => {
    const text = renderAdjudicationPrompt({
      scene: "雨\n否定: 接触していない", turn: 3,
      intents: [{ actorSide: "b", target: "character.a", possible: false }, { actorSide: "a", force: 0.25 }],
      unknown: null, emptyText: "", emptyList: [], emptyObject: {}, omitted: undefined,
    });
    assert.ok(text.includes('"雨\\n否定: 接触していない"'));
    assert.ok(text.includes('"turn": 3'));
    assert.ok(text.includes('"possible": false'));
    assert.ok(text.includes('"force": 0.25'));
    for (const field of ['"unknown": null', '"emptyText": ""', '"emptyList": []', '"emptyObject": {}']) {
      assert.ok(text.includes(field), field);
    }
    assert.ok(text.indexOf('"actorSide": "b"') < text.indexOf('"actorSide": "a"'));
    assert.ok(text.includes("[0]") && text.includes("[1]"));
    assert.ok(!text.includes("omitted"));
  });

  it("reduces structural text without omitting canonical material", () => {
    const input = { turn: 4, scene: "濡れた広場", actors: {
      a: { posture: "standing", restraint: null, capabilityEvidence: [], canFight: true },
      b: { posture: "crouching", restraint: null, capabilityEvidence: [], canFight: true },
    }, roots: [{ rootRef: "character.b", canonicalLabel: "B", canonicalAccessByActor: { a: "near", b: "contact" } }],
    intents: [{ actorSide: "a", description: "Bの手首をつかもうとする" }] };
    const compact = renderAdjudicationPrompt(input);
    const previous = renderPromptSections([{ title: "裁定に使える確定資料", value: input }]);
    assert.ok(compact.length < previous.length);
    for (const word of ["濡れた広場", "capabilityEvidence", "character.b", "canonicalAccessByActor", "near", "contact", "Bの手首をつかもうとする"]) {
      assert.ok(compact.includes(word), word);
    }
  });

  it("rejects cycles, unsupported values and excessive nesting instead of silently dropping facts", () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    assert.throws(() => renderAdjudicationPrompt(cycle), /PROMPT_DATA_CYCLE/);
    for (const value of [NaN, Infinity, new Date(), undefined, () => null]) {
      assert.throws(() => renderAdjudicationPrompt(value), /PROMPT_DATA_NOT_SERIALIZABLE/);
    }
    let nested: unknown = null;
    for (let index = 0; index < 34; index++) nested = { child: nested };
    assert.throws(() => renderAdjudicationPrompt(nested), /PROMPT_DATA_LIMIT_EXCEEDED/);
    assert.throws(() => renderAdjudicationPrompt(Array.from({ length: 20_001 }, () => null)), /PROMPT_DATA_LIMIT_EXCEEDED/);
  });
});
