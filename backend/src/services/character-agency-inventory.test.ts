import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InventoryMode, InventoryPhase } from "./character-agency-inventory.fixtures.js";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-agency-inventory-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "inventory.db");
const { runInventory, PRIVATE_GOAL, INVENTORY_UTTERANCE } = await import("./character-agency-inventory.fixtures.js");
const { saveBattle, getBattle } = await import("../repositories/battles.js");
const { closeDatabase } = await import("../db.js");
const { toBattlePublic } = await import("./battle-service.js");

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("CA-00 existing agency boundary inventory (not model quality)", () => {
  const modes: InventoryMode[] = ["legacy", "compact1", "compact2"];
  const phases: InventoryPhase[] = ["prologue", "turn", "aftermath"];
  for (const mode of modes) {
    for (const phase of phases) {
      it(`records ${mode}/${phase} provider routing without network`, async (t) => {
        const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("Network forbidden"); });
        const run = await runInventory("control", mode, phase);
        assert.equal(run.provider.psycheInputs.length, phase === "turn" ? 0 : 1);
        assert.equal(run.provider.expressionInputs.length, 1);
        assert.equal(run.provider.requests.length, phase === "turn" ? 1 : 2);
        assert.equal(Boolean(run.provider.expressionInputs[0]?.decision), phase !== "aftermath");
        assert.equal(fetch.mock.callCount(), 0);
        assert.ok(run.provider.requests.every((request) => request.system.length > 0 && request.user.length > 0));
      });
    }
  }

  it("retains the old unbound turn psyche call", async () => {
    const run = await runInventory("control", "compact2", "turn", false);
    assert.equal(run.provider.psycheInputs.length, 1);
    assert.equal(run.provider.requests.length, 2);
  });

  it("F01/F02 projects personality and known relationship without changing the fallback victory objective", async () => {
    const control = await runInventory();
    const enjoy = await runInventory("enjoy");
    const care = await runInventory("care");
    const baseline = control.provider.expressionInputs[0];
    const personality = enjoy.provider.expressionInputs[0];
    const relationship = care.provider.expressionInputs[0];
    assert.ok(baseline && personality && relationship);
    assert.notDeepEqual(baseline.structuredSelf?.tendencies, personality.structuredSelf?.tendencies);
    assert.notDeepEqual(baseline.structuredSelf?.relationship, relationship.structuredSelf?.relationship);
    assert.deepEqual(baseline.decision?.decisionProfile?.defaultObjective, personality.decision?.decisionProfile?.defaultObjective);
    assert.equal(personality.decision?.decisionProfile?.defaultObjective.id, "victory");
  });

  it("F03/F04 removes unavailable skill and out-of-range basic action from the actual decision input", async () => {
    const control = await runInventory();
    const low = await runInventory("low_mp");
    const far = await runInventory("far");
    const baseline = control.provider.expressionInputs[0]?.decision?.availableActions;
    const resource = low.provider.expressionInputs[0]?.decision?.availableActions;
    const distance = far.provider.expressionInputs[0]?.decision?.availableActions;
    assert.ok(baseline && resource && distance);
    assert.ok(baseline.some((action) => action.kind === "skill"));
    assert.ok(!resource.some((action) => action.kind === "skill"));
    assert.ok(baseline.some((action) => action.kind === "basic_attack"));
    assert.ok(!distance.some((action) => action.kind === "basic_attack"));
  });

  it("F05 changes conscious ability knowledge but not deterministic reaction", async () => {
    const control = await runInventory();
    const changed = await runInventory("ability_text");
    assert.deepEqual(control.state.assetManifest?.characters.a.compilerInputsV2?.psycheTraits,
      changed.state.assetManifest?.characters.a.compilerInputsV2?.psycheTraits);
    assert.deepEqual(control.result.state.agentStateA?.reactionStateV1, changed.result.state.agentStateA?.reactionStateV1);
    assert.deepEqual(control.result.state.agentStateA?.reactionReceiptV1, changed.result.state.agentStateA?.reactionReceiptV1);
    const baseline = control.provider.expressionInputs[0];
    const knowledge = changed.provider.expressionInputs[0];
    assert.ok(baseline?.contextMode === "compact" && knowledge?.contextMode === "compact");
    assert.equal(baseline.contractVersion, 2);
    assert.equal(knowledge.contractVersion, 2);
    if (baseline.contractVersion === 2 && knowledge.contractVersion === 2) {
      assert.deepEqual(baseline.turnObservation, knowledge.turnObservation);
    }
    assert.notEqual(baseline.character.basicAction.description, knowledge.character.basicAction.description);
  });

  it("F06 saves and reloads the old goal, rejects stale revisions, but still omits it from conscious input", async () => {
    const run = await runInventory();
    assert.equal(run.provider.expressionOutputs[0]?.state.currentGoal, "");
    assert.equal(run.result.state.agentStateA?.currentGoal, PRIVATE_GOAL);
    const metadata = { sideAUserId: "inventory-owner", sideACharacterId: "a", sideBCharacterId: "b", expectedRevision: 0 };
    await saveBattle(run.result.state, metadata);
    const loaded = await getBattle(run.result.state.id);
    assert.ok(loaded);
    assert.equal(loaded.agentStateA?.currentGoal, PRIVATE_GOAL);
    assert.deepEqual(loaded.assetManifest, run.result.state.assetManifest);
    const next = await runInventory("control", "compact2", "turn", true, loaded);
    next.result.state.battleRevision = 1;
    await saveBattle(next.result.state, metadata);
    await assert.rejects(saveBattle(run.result.state, metadata), /BATTLE_REVISION_CONFLICT/);
    const persisted = await getBattle(run.result.state.id);
    assert.equal(persisted?.battleRevision, 1);
    assert.equal(persisted?.agentStateA?.currentGoal, PRIVATE_GOAL);
    const input = next.provider.expressionInputs[0];
    assert.ok(input?.contextMode === "compact" && input.contractVersion === 2);
    assert.ok(!Object.hasOwn(input.expressionState, "currentGoal"));
    assert.ok(next.provider.requests.every((request) => !request.user.includes(PRIVATE_GOAL)));
  });

  it("F07 records the later action adapter input without attributing an engine redecision to this helper test", async () => {
    const run = await runInventory();
    assert.ok(run.laterInput);
    assert.deepEqual(Object.keys(run.laterInput).sort(), ["character", "decision", "perception", "structuredSelf"]);
    await run.provider.decideCharacterAction(run.laterInput);
    assert.equal(run.provider.actionInputs.length, 1);
    assert.ok(!run.provider.requests.at(-1)?.user.includes(PRIVATE_GOAL));
    assert.ok(run.laterInput.perception.self.percepts.some((percept) => percept.phenomenon.includes(INVENTORY_UTTERANCE)));
    assert.ok(run.provider.requests.at(-1)?.user.includes(INVENTORY_UTTERANCE));
  });

  it("F08 preserves repeated speech and keeps the private goal out of public projection", async () => {
    const first = await runInventory();
    const second = await runInventory("control", "compact2", "turn", true, first.result.state);
    assert.equal(second.result.state.agentStateA?.conversationHistory?.filter((entry) => entry.text === INVENTORY_UTTERANCE).length, 2);
    assert.equal(second.result.state.agentStateA?.lastSpeech, null);
    assert.ok(!JSON.stringify(toBattlePublic(second.result.state, second.mine)).includes(PRIVATE_GOAL));
  });
});
