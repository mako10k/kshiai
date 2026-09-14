import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acceptConsciousDecisionV3, decodeConsciousOutputV3, initialConsciousAgencyV1,
  type AgencyFactV1,
} from "@kshiai/shared";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-agency-state-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "state.db");
const { createInventoryFixture } = await import("./character-agency-inventory.fixtures.js");
const { createConsciousFixture } = await import("./conscious-agency.fixtures.js");
const { MockLlmProvider } = await import("../llm/mock.js");
const { saveBattle, getBattle } = await import("../repositories/battles.js");
const { closeDatabase, query } = await import("../db.js");
const { toBattlePublic, advanceCharacterAgents, startBattle, advanceTurn } = await import("./battle-service.js");
const characterRepo = await import("../repositories/characters.js");
const settingsRepo = await import("../repositories/dialogue-pipeline-settings.js");
const { ensureSystemNarrationStyles } = await import("../repositories/narration-styles.js");

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("ADR-0028 private agency state persistence", () => {
  it("creates and advances a real bound V3 battle with no psyche LLM calls", async () => {
    const fixture = createConsciousFixture();
    await query(`INSERT INTO users (id, username, password_hash, created_at) VALUES ($1, $2, $3, $4)`,
      ["inventory-owner", "agency-owner", "test", new Date().toISOString()]);
    await characterRepo.saveSheet(fixture.mine);
    await characterRepo.saveSheet(fixture.opp);
    await ensureSystemNarrationStyles();
    await settingsRepo.updateDialoguePipelineSettings({ userId: "inventory-owner", patch: {
      ...fixture.settings, schemaVersion: 3, expectedRevision: 0,
    } });
    const llm = new MockLlmProvider();
    let consciousCalls = 0;
    const original = llm.advanceCharacterAgent.bind(llm);
    llm.advanceCharacterPsyche = async () => { throw new Error("Unexpected V3 psyche call"); };
    llm.advanceCharacterAgent = async (input) => {
      assert.ok(input.contextMode === "compact" && input.contractVersion === 3);
      consciousCalls += 1;
      return original(input);
    };
    const created = await startBattle({ userId: "inventory-owner", battleId: "agency-created-v3",
      myCharacterId: fixture.mine.id, opponentCharacterId: fixture.opp.id, battlefieldMode: "random", llm });
    const initial = await getBattle(created.id);
    assert.equal(initial?.assetManifest?.schemaVersion, 3);
    assert.equal(initial?.agentStateA?.consciousAgencyV1?.upperGoal, null);
    assert.equal(initial?.agentStateA?.currentGoal, "");
    for (let step = 1; step <= 4; step += 1) {
      await advanceTurn({ userId: "inventory-owner", battleId: created.id, operationId: `agency-step-${step}`, llm });
    }
    const final = await getBattle(created.id);
    assert.ok(final?.agentStateA?.consciousAgencyV1?.upperGoal);
    assert.ok(consciousCalls >= 4);
    assert.equal(final.dialoguePipelineSnapshot?.schemaVersion, 3);
    assert.equal(final.assetManifest?.characters.a.compilerInputsV2, undefined);
    assert.ok(final.assetManifest?.characters.a.compilerInputsV3);
  });
  it("runs V3 service acceptance, SQLite reload, second judgment and stale-save rejection together", async () => {
    const fixture = createConsciousFixture();
    fixture.state.id = "agency-runtime-persistence";
    const llm = new MockLlmProvider();
    const first = await advanceCharacterAgents({ llm, before: fixture.state, after: structuredClone(fixture.state),
      mine: fixture.mine, opp: fixture.opp, events: [], actions: [], activeSides: ["a"], dialoguePipeline: fixture.settings, phase: "prologue" });
    const metadata = { sideAUserId: "inventory-owner", sideACharacterId: "a", sideBCharacterId: "b", expectedRevision: 0 };
    await saveBattle(first.state, metadata);
    const loaded = await getBattle(first.state.id);
    assert.ok(loaded?.agentStateA?.consciousAgencyV1?.upperGoal);
    assert.equal(loaded.assetManifest?.schemaVersion, 3);
    const second = await advanceCharacterAgents({ llm, before: loaded, after: structuredClone(loaded),
      mine: fixture.mine, opp: fixture.opp, events: [], actions: [], activeSides: ["a"], dialoguePipeline: fixture.settings, phase: "turn" });
    second.state.battleRevision = 1;
    await saveBattle(second.state, metadata);
    await assert.rejects(saveBattle(first.state, metadata), /BATTLE_REVISION_CONFLICT/);
    const final = await getBattle(first.state.id);
    assert.equal(final?.agentStateA?.consciousAgencyV1?.latestDecision?.phase, "turn");
    assert.deepEqual(final?.agentStateA?.consciousAgencyV1?.upperGoal, loaded.agentStateA.consciousAgencyV1.upperGoal);
  });
  it("persists initial and second accepted decisions via real SQLite and rejects stale CAS", async () => {
    const { state, mine } = createInventoryFixture();
    state.id = "agency-state-persistence";
    assert.ok(state.agentStateA);
    const goal = { statement: "private-goal-protect-counterpart", basisRefs: ["relationship"] };
    const intent = { aim: "private-intent-keep-distance", rationale: "private-rationale-known-relationship", basisRefs: ["candidate"] };
    const facts: AgencyFactV1[] = [
      { ref: "relationship", kind: "relationship", sourcePath: "/structuredSelf/relationship" },
      { ref: "candidate", kind: "candidate", sourcePath: "/decision/availableActions/0" },
    ];
    const first = acceptConsciousDecisionV3({
      previous: initialConsciousAgencyV1(),
      output: decodeConsciousOutputV3({
        initialGoal: goal, intent, nextAction: { kind: "wait" },
        nextUtterance: "また会えたね。", realizedManifestation: null,
      }, "prologue"),
      facts, turn: 0, validateAction: (action) => action,
    });
    assert.equal(first.acceptedDecision, true);
    state.agentStateA.consciousAgencyV1 = first.state;
    const metadata = {
      sideAUserId: "inventory-owner", sideACharacterId: "a", sideBCharacterId: "b", expectedRevision: 0,
    };
    await saveBattle(state, metadata);
    const loaded = await getBattle(state.id);
    assert.ok(loaded?.agentStateA?.consciousAgencyV1);
    assert.deepEqual(loaded.agentStateA.consciousAgencyV1, first.state);
    const second = acceptConsciousDecisionV3({
      previous: loaded.agentStateA.consciousAgencyV1,
      output: decodeConsciousOutputV3({
        initialGoal: null, intent: { ...intent, aim: "private-second-choice" }, nextAction: null,
        nextUtterance: "また会えたね。", realizedManifestation: null,
      }, "turn"),
      facts: [facts[1]!], turn: 1, validateAction: (action) => action,
    });
    loaded.agentStateA.consciousAgencyV1 = second.state;
    loaded.battleRevision = 1;
    await saveBattle(loaded, metadata);
    await assert.rejects(saveBattle(state, metadata), /BATTLE_REVISION_CONFLICT/);
    const final = await getBattle(state.id);
    assert.ok(final?.agentStateA?.consciousAgencyV1);
    assert.equal(final.battleRevision, 1);
    assert.deepEqual(final.agentStateA.consciousAgencyV1.upperGoal, goal);
    assert.equal(final.agentStateA.consciousAgencyV1.latestDecision?.intent.aim, "private-second-choice");
    const publicText = JSON.stringify(toBattlePublic(final, mine));
    for (const marker of [goal.statement, intent.aim, intent.rationale, "private-second-choice"]) {
      assert.equal(publicText.includes(marker), false);
    }
    // Synthetic insertion tests the storage path only. No V3 provider/activation
    // was executed, and legacy lastSpeech was not assigned by the new helper.
    assert.equal(final.agentStateA.lastSpeech, state.agentStateA.lastSpeech);
  });
});
