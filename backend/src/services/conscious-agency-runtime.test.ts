import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { snapshotDialoguePipelineSettings, type BattleState } from "@kshiai/shared";
import { OpenAiCompatibleProvider, type ChatOpts } from "../llm/openai-compatible.js";
import type { CharacterExpressionInput, CharacterExpressionCompactInputV3, CharacterDeepPsycheInput } from "../llm/types.js";
import { consciousRequest, privateBattleGoal } from "../llm/conscious-agency.js";
import { advanceCharacterAgents, buildLaterBucketActionInput, toBattlePublic } from "./battle-service.js";
import { createConsciousFixture } from "./conscious-agency.fixtures.js";
import { resolveDialoguePipelineActivation } from "./dialogue-pipeline-activation.js";

class ConsciousFixtureProvider extends OpenAiCompatibleProvider {
  readonly inputs: CharacterExpressionCompactInputV3[] = [];
  readonly requests: { system: string; user: string; label: string }[] = [];
  responseOverride: unknown = undefined;
  constructor() {
    super({ name: "agency-fixture", apiKey: "not-sent", baseUrl: "https://example.invalid/v1",
      modelEngine: "fixture", modelFast: "fixture", fallbackOnError: false });
  }
  override async advanceCharacterPsyche(_input: CharacterDeepPsycheInput): Promise<never> {
    throw new Error("V3 must not call psyche");
  }
  override async advanceCharacterAgent(input: CharacterExpressionInput) {
    assert.ok(input.contextMode === "compact" && input.contractVersion === 3);
    this.inputs.push(structuredClone(input));
    return super.advanceCharacterAgent(input);
  }
  protected override async chatJson(system: string, user: string, options?: ChatOpts): Promise<unknown> {
    const label = options?.label ?? "";
    this.requests.push({ system, user, label });
    if (this.responseOverride !== undefined) return structuredClone(this.responseOverride);
    if (label === "decideCharacterAction") return {
      intent: { aim: "待機する", rationale: "許可された選択", basisRefs: ["ordinary-goal"] }, nextAction: { kind: "wait" },
    };
    const input = this.inputs.at(-1);
    assert.ok(input);
    if (input.phase === "aftermath") return { nextUtterance: "また会おう。", realizedManifestation: null };
    return {
      initialGoal: input.agencyState.upperGoal ? null : { statement: "private-new-goal", basisRefs: ["ordinary-goal"] },
      intent: { aim: "private-intent", rationale: "private-rationale", basisRefs: ["ordinary-goal"] },
      nextAction: null, nextUtterance: "間合いを確かめよう。", realizedManifestation: null,
    };
  }
}

async function advance(fixture: ReturnType<typeof createConsciousFixture>, provider: ConsciousFixtureProvider,
  phase: "prologue" | "turn" | "aftermath" = "turn", state: BattleState = fixture.state) {
  return advanceCharacterAgents({
    llm: provider, before: state, after: structuredClone(state),
    mine: fixture.mine, opp: fixture.opp, events: [], actions: [], activeSides: ["a"],
    dialoguePipeline: fixture.settings, phase,
  });
}

describe("ADR-0028 V3 runtime routing (network replaced, not model-quality evidence)", () => {
  for (const phase of ["prologue", "turn", "aftermath"] as const) {
    it(`${phase}: one conscious request, no psyche request, no old free-text input`, async () => {
      const fixture = createConsciousFixture();
      const provider = new ConsciousFixtureProvider();
      const result = await advance(fixture, provider, phase);
      assert.equal(provider.requests.length, 1);
      assert.equal(provider.requests[0]?.label, "advanceCharacterAgentCompact");
      const input = provider.inputs[0];
      assert.ok(input);
      assert.equal(input.contractVersion, 3);
      for (const marker of ["legacy-private-goal", "legacy-private-memory", "deepPsyche", "objectiveAuthority", "lastSpeech"]) {
        assert.equal(provider.requests[0]?.user.includes(marker), false, marker);
      }
      assert.equal(Object.hasOwn(input, "expressionState"), false);
      if (phase === "prologue") assert.deepEqual(result.state.agentStateA?.reactionStateV1, fixture.state.agentStateA?.reactionStateV1);
      if (phase === "aftermath") assert.equal(result.state.agentStateA?.consciousAgencyV1?.upperGoal, null);
      else assert.equal(result.state.agentStateA?.consciousAgencyV1?.upperGoal?.statement, "private-new-goal");
    });
  }
  it("passes the accepted prior decision to the next call, permits repeated speech, and keeps private goal out of public DTO", async () => {
    const fixture = createConsciousFixture();
    const provider = new ConsciousFixtureProvider();
    const first = await advance(fixture, provider, "prologue");
    const second = await advance(fixture, provider, "turn", first.state);
    assert.deepEqual(provider.inputs[1]?.agencyState, first.state.agentStateA?.consciousAgencyV1);
    assert.equal(second.characterSpeeches[0]?.text, first.characterSpeeches[0]?.text);
    const publicText = JSON.stringify(toBattlePublic(second.state, fixture.mine));
    for (const marker of ["private-new-goal", "private-intent", "private-rationale", "legacy-private-goal"]) {
      assert.equal(publicText.includes(marker), false, marker);
    }
    assert.equal(privateBattleGoal(second.state, "a"), "private-new-goal");
  });
  it("retains valid speech independently of rejected goal/intent/action", async () => {
    const fixture = createConsciousFixture();
    const provider = new ConsciousFixtureProvider();
    provider.responseOverride = { initialGoal: null, intent: null, nextAction: { kind: "wait" }, nextUtterance: "有効な発話。", realizedManifestation: null };
    const result = await advance(fixture, provider);
    assert.equal(result.state.agentStateA?.consciousAgencyV1?.upperGoal, null);
    assert.equal(result.state.agentStateA?.consciousAgencyV1?.latestDecision, null);
    assert.equal(result.characterSpeeches[0]?.text, "有効な発話。");
  });
  it("rejects tuple drift before dispatch and never silently falls back", async () => {
    const fixture = createConsciousFixture();
    const provider = new ConsciousFixtureProvider();
    fixture.settings = { ...fixture.settings, recentExchangeLimit: 8 };
    await assert.rejects(advance(fixture, provider), /BATTLE_CONTRACT_MISMATCH/);
    assert.equal(provider.requests.length, 0);
  });
  it("disabled and missing observation do not dispatch, missing input holds reaction", async () => {
    const fixture = createConsciousFixture();
    const provider = new ConsciousFixtureProvider();
    delete fixture.state.perceptionFrameA;
    const result = await advance(fixture, provider);
    assert.equal(provider.requests.length, 0);
    assert.deepEqual(result.state.agentStateA?.reactionStateV1, fixture.state.agentStateA?.reactionStateV1);
    const disabled = createConsciousFixture();
    disabled.settings = { ...disabled.settings, enabled: false };
    disabled.state.dialoguePipelineSnapshot = snapshotDialoguePipelineSettings(disabled.settings);
    assert.ok(disabled.state.assetManifest);
    disabled.state.assetManifest.dialoguePipeline.snapshot = disabled.state.dialoguePipelineSnapshot;
    await advance(disabled, provider);
    assert.equal(provider.requests.length, 0);
    assert.equal(buildLaterBucketActionInput({ state: disabled.state, sheet: disabled.mine, side: "a" }), null);
  });
  it("later reuses agency/reaction without ticking and excludes private/extra envelope keys", async () => {
    const fixture = createConsciousFixture();
    const provider = new ConsciousFixtureProvider();
    const first = await advance(fixture, provider);
    const input = buildLaterBucketActionInput({ state: first.state, sheet: fixture.mine, counterpartSheet: fixture.opp, side: "a" });
    assert.ok(input?.conscious);
    const before = structuredClone(first.state.agentStateA?.reactionStateV1);
    await provider.decideCharacterAction(input);
    assert.deepEqual(first.state.agentStateA?.reactionStateV1, before);
    assert.equal(provider.requests.at(-1)?.label, "decideCharacterAction");
    assert.equal(provider.requests.at(-1)?.user.includes("legacy-private-memory"), false);
    const normal = provider.inputs[0];
    assert.ok(normal);
    const clean = consciousRequest({ ...normal, ...{ privateExtra: "must-not-send" } });
    assert.equal(Object.hasOwn(clean, "privateExtra"), false);
  });
  it("rejects V3 legacy override before activation", () => {
    const fixture = createConsciousFixture();
    assert.throws(() => resolveDialoguePipelineActivation({ settings: fixture.settings, settingsSource: "persisted_setting",
      override: "legacy", overrideDeployment: { commitSha: "a".repeat(40), artifactRef: `image@sha256:${"b".repeat(64)}` },
    }), /BATTLE_CONTRACT_MISMATCH/);
  });
});
