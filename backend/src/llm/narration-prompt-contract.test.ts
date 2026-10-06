// R: Verify current phase contracts and bounded upgrades of historical narration material.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NarrationTurnView } from "@kshiai/shared";
import { freezeAwarenessNarration, type AwarenessNarrationPhaseInput } from "./awareness-narration-phase.js";
import { prepareAwarenessFrozenNarrationRequest, validateAwarenessFrozenNarrationResults } from "./awareness-frozen-narration.js";
import { narrationReceiptExample } from "./narration-receipt-contract.js";
import { prepareAwarenessNarrationRequest } from "./awareness-narration.js";
import { LEGACY_NARRATION_CONTRACT, CURRENT_DIRECT_NARRATION_CONTRACT, CONTENT_ONLY_NARRATION_CONTRACT, currentNarrationContentRules, type NarrationPromptContract } from "./narration-prompt-contract.js";
import { buildNarrateTurnPromptMaterial, buildNarrateProloguePromptMaterial, buildNarrateAftermathPromptMaterial, buildNarrateJudgmentPromptMaterial, OpenAiCompatibleProvider } from "./openai-compatible.js";
function phasePrompt(request: AwarenessNarrationPhaseInput, contract?: NarrationPromptContract) {
  if (request.phase === "combat") return buildNarrateTurnPromptMaterial(request.input, contract);
  if (request.phase === "prologue") return buildNarrateProloguePromptMaterial(request.input, contract);
  if (request.phase === "aftermath") return buildNarrateAftermathPromptMaterial(request.input, contract);
  return buildNarrateJudgmentPromptMaterial(request.input, contract);
}
class NarrationContractProvider extends OpenAiCompatibleProvider {
  readonly systems: string[] = [];
  protected override async chatJson(system: string, _user: string): Promise<unknown> {
    this.systems.push(system);
    return { turn: 1, narrator: ["雨が降る。", "二つの姿が向き合う。", "足元が濡れる。", "声が響く。"],
      before: ["静けさが戻る。"], after: [],
      speeches: [{ sourceSide: "a", speaker: "白い姿", text: "待て。まだ！", afterNarratorLine: 0 }], recognitionUpdates: [] };
  }
}
const view: NarrationTurnView = {
  schemaVersion: 1, turn: 1, scene: "雨の路地",
  perception: { schemaVersion: 1, mode: "external", viewpointSide: null, resolvedFromFluid: false, references: [] },
  participantLabels: { a: "白い姿", b: "黒い姿" }, profileAnchors: {}, sceneStateFacts: [], continuity: null,
  recognitionSubjects: [], events: [], actionBeats: [{ actorLabel: "白い姿", actionName: "身構える", description: "姿勢を整える", outcomes: [] }],
  canonicalChange: { semantic: { status: "applied", changed: false }, world: { status: "applied", changed: false, operationKinds: [] } }, battlefield: null,
};
const common = { scene: "雨の路地", sideAName: "白い姿", sideBName: "黒い姿", profileAnchors: {}, characterSpeeches: [{ side: "a" as const, speaker: "SECRET", text: "待て！ …まだ。" }] };
const phases: AwarenessNarrationPhaseInput[] = [
  { phase: "combat", input: { view, characterSpeeches: common.characterSpeeches } },
  { phase: "prologue", input: common },
  { phase: "aftermath", input: { ...common, turn: 1, winnerSide: null, winnerName: null, fallenNames: [] } },
  { phase: "judgment", input: { scene: common.scene, sideAName: common.sideAName, sideBName: common.sideBName, turn: 1, winnerSide: "draw", winnerName: null, presentationProjection: { schemaVersion: 1, verdictKind: "draw", winnerLabel: null, basisLines: ["双方が向き合った。"] }, recentPublicNarration: [] } },
];
describe("constructed narration content and receipt contracts", () => {
  it("preserves committed speech in direct runtime APIs when a model rewrites punctuation", async () => {
    const provider = new NarrationContractProvider({ name: "xai", apiKey: "test-only", baseUrl: "https://example.invalid/v1", modelEngine: "grok-test", modelFast: "grok-test" });
    for (const request of phases) {
      const result = request.phase === "combat" ? await provider.narrateTurn(request.input)
        : request.phase === "prologue" ? await provider.narratePrologue(request.input)
        : request.phase === "aftermath" ? await provider.narrateAftermath(request.input) : await provider.narrateJudgment(request.input);
      if ("speeches" in result) assert.equal(result.speeches[0]?.text, common.characterSpeeches[0]!.text);
    }
    assert.equal(provider.systems.length, 4);
    for (const system of provider.systems) {
      assert.doesNotMatch(system, /JSON:|You may change punctuation|"focus"\s*:/);
      assert.equal((system.match(/Return JSON only/g) ?? []).length, 1);
    }
  });
  it("uses current exact-speech instructions in all direct consumer builders", () => {
    for (const request of phases) {
      const prompt = phasePrompt(request);
      assert.equal(prompt.system, phasePrompt(request, CURRENT_DIRECT_NARRATION_CONTRACT).system);
      assert.doesNotMatch(prompt.system, /JSON:|You may change punctuation|"focus"\s*:/);
      assert.equal((prompt.system.match(/Return JSON only/g) ?? []).length, 1);
      if (request.phase !== "judgment") assert.match(prompt.system, /Preserve each supplied speech text exactly/);
    }
  });
  it("changes only registered historical grammar and speech permission while preserving style and observation rules", () => {
    for (const request of phases) {
      const legacySystem = phasePrompt(request, LEGACY_NARRATION_CONTRACT).system;
      assert.equal(currentNarrationContentRules(legacySystem, request.phase), phasePrompt(request, CONTENT_ONLY_NARRATION_CONTRACT).system);
      const styleAndObserver = '\nCustom frozen style: 雨の音を短く描く。\nStyle example JSON: {"color":"雨"}\nObservation boundary: never reveal inaccessible identity. 未知の声。';
      assert.equal(currentNarrationContentRules(legacySystem + styleAndObserver, request.phase), phasePrompt(request, CONTENT_ONLY_NARRATION_CONTRACT).system + styleAndObserver);
    }
  });
  it("constructs every real phase with only the strict receipts grammar and valid examples", () => {
    for (const phase of phases) {
      const material = freezeAwarenessNarration(phase, { battleId: "battle", turnReceiptId: phase.phase });
      const prepared = prepareAwarenessFrozenNarrationRequest([material]);
      assert.equal(material.promptRevision, "awareness-prompt-v4");
      assert.doesNotMatch(material.system, /JSON:|You may change punctuation/);
      assert.match(prepared.system, /phase, battleId, turnReceiptId, turn/);
      assert.equal((prepared.system.match(/Return JSON only/g) ?? []).length, 1);
      assert.doesNotMatch(prepared.system, /"focus"\s*:/);
      const example = narrationReceiptExample([material]);
      assert.equal(validateAwarenessFrozenNarrationResults([material], example)[0]?.phase, phase.phase);
      assert.throws(() => validateAwarenessFrozenNarrationResults([material], { receipts: example.receipts.map((item) => ({ ...item, focus: "external" })) }));
      if (phase.phase !== "judgment") {
        assert.match(material.system, /Preserve each supplied speech text exactly/);
        const changed = narrationReceiptExample([material]);
        const receipt = changed.receipts[0];
        if (receipt && "speeches" in receipt && receipt.speeches) receipt.speeches[0]!.text = "待て。";
        assert.throws(() => validateAwarenessFrozenNarrationResults([material], changed), /SPEECH_SOURCE_MISMATCH/);
      }
      for (const revision of ["awareness-prompt-v1", "awareness-prompt-v2"] as const) {
        const oldSource = { ...freezeAwarenessNarration(phase, { battleId: "battle", turnReceiptId: phase.phase }, revision), system: phasePrompt(phase, LEGACY_NARRATION_CONTRACT).system };
        const oldBytes = structuredClone(oldSource);
        const current = prepareAwarenessFrozenNarrationRequest([oldSource]);
        assert.doesNotMatch(current.system, /JSON:|You may change punctuation|"focus"\s*:/);
        assert.equal((current.system.match(/Return JSON only/g) ?? []).length, 1);
        assert.deepEqual(oldSource, oldBytes);
        assert.equal(current.system, prepared.system);
        const { promptRevision: _revision, ...savedOldMaterial } = oldSource;
        assert.deepEqual(prepareAwarenessFrozenNarrationRequest([savedOldMaterial]), current);
        const newlyBuilt = freezeAwarenessNarration(phase, { battleId: "battle", turnReceiptId: phase.phase }, revision);
        assert.equal(newlyBuilt.system, material.system);
      }
    }
  });
  it("constructs alternate combat batches through the same repaired phase contract", () => {
    const receipts = [1, 2].map((turn) => ({ battleId: "battle", turnReceiptId: `r${turn}`, input: { view: { ...view, turn }, characterSpeeches: common.characterSpeeches } }));
    const prepared = prepareAwarenessNarrationRequest(receipts);
    assert.doesNotMatch(prepared.system, /JSON:|You may change punctuation|"focus"\s*:/);
    assert.match(prepared.system, /"phase":"combat"/);
    assert.equal((prepared.system.match(/Return JSON only/g) ?? []).length, 1);
    const materials = receipts.map((receipt) => freezeAwarenessNarration({ phase: "combat", input: receipt.input }, { battleId: receipt.battleId, turnReceiptId: receipt.turnReceiptId }));
    assert.equal(validateAwarenessFrozenNarrationResults(materials, narrationReceiptExample(materials)).length, 2);
    assert.deepEqual(prepareAwarenessNarrationRequest(receipts, undefined, undefined, "awareness-prompt-v2"), prepared);
  });
});
