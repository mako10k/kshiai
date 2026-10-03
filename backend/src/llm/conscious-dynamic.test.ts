import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCharacterSelfProfileAnchor, buildTurnObservationPacket, initialConsciousAgencyV2 } from "@kshiai/shared";
import { createConsciousFixture } from "../services/conscious-agency.fixtures.js";
import { consciousReaction } from "./conscious-agency.js";
import { generationPlan, generationPrompt, generationSchema, runConsciousGeneration, bindConsciousGenerationControl, type DynamicInput } from "./conscious-dynamic.js";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";
import type { CharacterExpressionCompactInputV4 } from "./types.js";
import { ProviderJsonSyntaxError } from "./provider-json.js";
import { assertXaiResponseSchema } from "./provider-response-schema.js";
const intent = { aim: "間合いを見極める", basisRefs: ["value"] };
const goal = { statement: "相手を守りながら勝つ", basisRefs: ["value"] };
function input(): CharacterExpressionCompactInputV4 {
  const f = createConsciousFixture();
  const compiler = f.state.assetManifest?.characters.a.compilerInputsV3;
  assert.ok(compiler && f.state.agentStateA);
  return {
    contextMode: "compact", contractVersion: 4, phase: "turn", character: buildCharacterSelfProfileAnchor(f.mine),
    structuredSelf: compiler.consciousSelf, agencyState: { ...initialConsciousAgencyV2(), upperGoal: goal },
    reaction: consciousReaction(f.state.agentStateA, compiler), goalPolicy: "性格と関係から目標を導く",
    facts: [{ ref: "value", kind: "value", sourcePath: "/character" }], utteranceHistory: { recent: [] },
    turnObservation: buildTurnObservationPacket({ frame: f.state.perceptionFrameA! }),
    observableManifestations: [], decision: { nextTurn: 1, turnsRemaining: 20, finisher: null, availableActions: [
      { kind: "skill", skillId: "bound-skill", name: "技", target: { kind: "counterpart", perceivedAs: "相手" } },
      { kind: "free_action", name: "自由行動", target: { kind: "self", perceivedAs: "自分" } },
    ] },
  };
}
describe("dynamic provider boundary (no network or live quality claims)", () => {
  it("requests only current phase fields and restores the exact bound skill", async () => {
    const i = input(), plan = generationPlan(i);
    assert.equal(plan.fields.includes("initialGoal"), false);
    assert.equal(plan.fields.includes("realizedManifestation"), false);
    assert.equal(generationPrompt(plan).includes("For aftermath"), false);
    const result = await runConsciousGeneration(i, i, async (_system, _user, opts) => {
      assert.ok(opts.responseFormat);
      assertXaiResponseSchema(opts.responseFormat.json_schema.schema);
      assert.equal(Object.hasOwn(opts.responseFormat.json_schema.schema, "properties"), true);
      return { intent, nextAction: { choiceKey: "choice-0" } };
    });
    assert.deepEqual(result.nextAction, { valid: true, value: { kind: "skill", skillId: "bound-skill" } });
    assert.deepEqual(result.errors, []);
  });
  it("keeps character speech guidance phase scoped and accepts chosen speech and silence independently", async () => {
    const i = input();
    const turnPrompt = generationPrompt(generationPlan(i));
    assert.match(turnPrompt, /structuredSelf\.speech/);
    assert.match(turnPrompt, /selecting a combat action does not imply silence/i);
    assert.match(turnPrompt, /Choose null when silence fits/);
    for (const utterance of ["その間合い、試させてもらう。", null]) {
      const output = await runConsciousGeneration(i, i, async (_system, user) => {
        const request = JSON.parse(user);
        assert.deepEqual(request.context.structuredSelf.speech, i.structuredSelf.speech);
        assert.deepEqual(request.context.utteranceHistory, i.utteranceHistory);
        return { intent, nextAction: { choiceKey: "choice-0" }, nextUtterance: utterance };
      });
      assert.deepEqual(output.nextUtterance, { valid: true, value: utterance });
      assert.deepEqual(output.errors, []);
    }
    const laterPrompt = generationPrompt(generationPlan({ ...i, phase: "later" }));
    assert.doesNotMatch(laterPrompt, /structuredSelf\.speech|Choose one Japanese public utterance/);
  });
  it("repairs speech only, preserves action and blocks out-of-target overwrites", async () => {
    const i = input(); let calls = 0, reservations = 0;
    bindConsciousGenerationControl(i, { reserveRepair: async () => { reservations++; return true; }, validateAction: () => null });
    const result = await runConsciousGeneration(i, i, async (_system, user, opts) => {
      calls++;
      if (calls === 1) return { intent, nextAction: { choiceKey: "choice-0" }, nextUtterance: 1 };
      const req = JSON.parse(user);
      assert.deepEqual(req.repair.repairFields, ["nextUtterance"]);
      assert.deepEqual(Object.keys(opts.responseFormat?.json_schema.schema.properties ?? {}), ["nextUtterance"]);
      return { nextUtterance: "来てみて。", nextAction: null };
    });
    assert.equal(calls, 2); assert.equal(reservations, 1);
    assert.equal(result.nextAction.valid && result.nextAction.value?.kind, "skill");
    assert.ok(result.errors.some((e) => e.code === "repair_field_not_requested"));
  });
  it("repairs invalid selections together with intent and provides exact candidates", async () => {
    const i = input(); let calls = 0;
    bindConsciousGenerationControl(i, { reserveRepair: async () => true, validateAction: () => null });
    const result = await runConsciousGeneration(i, i, async (_system, user) => {
      if (++calls === 1) return { intent, nextAction: { choiceKey: "old-key" }, nextUtterance: "そのまま。" };
      const req = JSON.parse(user);
      assert.deepEqual(req.repair.repairFields, ["intent", "nextAction"]);
      assert.ok(req.repair.errors.some((e: { code: string }) => e.code === "not_in_current_candidates"));
      return { intent, nextAction: { choiceKey: "choice-0" } };
    });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.nextUtterance, { valid: true, value: "そのまま。" });
  });
  it("keeps missing free-action content invalid and never synthesizes it", async () => {
    const i = input(); let calls = 0;
    bindConsciousGenerationControl(i, { reserveRepair: async () => true, validateAction: () => null });
    const result = await runConsciousGeneration(i, i, async () => { calls++; return { intent, nextAction: { choiceKey: "choice-1" } }; });
    assert.equal(calls, 2); assert.equal(result.nextAction.valid, false);
    assert.ok(result.errors.some((e) => e.path === "/nextAction/description"));
  });
  it("handles syntax as one domain repair and does not retry transport errors", async () => {
    const i = input(); let calls = 0;
    bindConsciousGenerationControl(i, { reserveRepair: async () => true, validateAction: () => null });
    const result = await runConsciousGeneration(i, i, async () => { if (++calls === 1) throw new ProviderJsonSyntaxError("{bad"); return { intent, nextAction: { choiceKey: "choice-0" } }; });
    assert.equal(calls, 2); assert.deepEqual(result.errors, []);
    await assert.rejects(runConsciousGeneration(i, i, async () => { throw new Error("401"); }), /401/);
  });
  it("does not repair optional omissions and obeys an already-reserved budget", async () => {
    const i = input(); let calls = 0;
    bindConsciousGenerationControl(i, { reserveRepair: async () => false, validateAction: () => null });
    assert.deepEqual((await runConsciousGeneration(i, i, async () => { calls++; return {}; })).errors, []);
    const r = await runConsciousGeneration(i, i, async () => { calls++; return { intent, nextAction: { choiceKey: "old" } }; });
    assert.equal(calls, 2); assert.ok(r.errors.length > 0);
  });
  it("removes goal/speech from later and requires a concrete current decision", () => {
    const i = { ...input(), phase: "later" as const };
    const p = generationPlan(i);
    assert.deepEqual(p.fields, ["intent", "nextAction"]);
    assert.equal(generationSchema(p).safeParse({}).success, false);
    assert.throws(() => generationPlan({ ...i, agencyState: initialConsciousAgencyV2() }), /later_without_goal/);
  });
  it("sends the dynamic strict schema through the actual HTTP adapter", async (t) => {
    const i = input(); let calls = 0;
    t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init.body));
      assert.equal(body.response_format.type, "json_schema");
      assert.equal(body.response_format.json_schema.strict, true);
      assert.equal(Object.hasOwn(body.response_format.json_schema.schema.properties, "initialGoal"), false);
      assert.equal(body.messages[0].content.includes("For later"), false);
      return Response.json({ choices: [{ message: { content: JSON.stringify({ intent, nextAction: { choiceKey: "choice-0" } }) } }], usage: { total_tokens: 10 } });
    });
    const provider = new OpenAiCompatibleProvider({ name: "xai", apiKey: "test-only", baseUrl: "https://example.invalid/v1", modelEngine: "test", modelFast: "test" });
    const result = await provider.advanceCharacterAgent(i);
    assert.equal(calls, 1);
    assert.ok(result.contractVersion === 4);
    assert.equal(result.proposedAction?.kind, "skill");
    assert.equal(result.proposedAction?.skillId, "bound-skill");
  });

  it("skips an empty target set and closes dependencies for partial generation", async () => {
    const i = input();
    bindConsciousGenerationControl(i, { targets: [], reserveRepair: async () => true, validateAction: () => null });
    const output = await runConsciousGeneration(i, i, async () => { throw new Error("unexpected provider call"); });
    assert.equal(output.decisionRequested, false);
    assert.deepEqual(generationPlan(i, ["nextAction"]).fields, ["intent", "nextAction"]);
    assert.deepEqual(generationPlan(i, ["nextUtterance"]).fields, ["nextUtterance"]);
    assert.throws(() => generationPlan({ ...i, phase: "later" }, ["nextUtterance"]), /target_outside_phase/);
  });

  it("repairs only missing payload slots while preserving selection, intent and valid description", async () => {
    const i = input(); let calls = 0;
    bindConsciousGenerationControl(i, { reserveRepair: async () => true, validateAction: () => null });
    const result = await runConsciousGeneration(i, i, async (_system, user, opts) => {
      if (++calls === 1) return { intent, nextAction: { choiceKey: "choice-1", description: "観測済みの足場を確かめる", subjectRefs: [] } };
      const request = JSON.parse(user);
      assert.deepEqual(request.repair.repairFields, ["nextAction"]);
      assert.deepEqual(request.repair.payloadFields, ["subjectRefs"]);
      assert.equal(request.repair.fixedAction.description, "観測済みの足場を確かめる");
      const actionSchema = opts.responseFormat?.json_schema.schema.properties;
      assert.ok(actionSchema);
      return { nextAction: { subjectRefs: ["profile:a:weapon"], description: "上書きを試す" } };
    });
    assert.equal(calls, 2);
    assert.deepEqual(result.nextAction, { valid: true, value: { kind: "free_action", description: "観測済みの足場を確かめる", subjectRefs: ["profile:a:weapon"] } });
    assert.deepEqual(result.intent, { valid: true, value: intent });
    assert.ok(result.errors.some((e) => e.path === "/nextAction/description" && e.code === "repair_field_not_requested"));
  });

});
