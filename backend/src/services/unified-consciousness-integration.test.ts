// R: Exercise opted-in battle binding v6 creation, world advance and narration with offline SDK fixtures.
import assert from "node:assert/strict";
import { after, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { UnifiedConsciousnessPolicyV1, type AwarenessFrozenNarration } from "@kshiai/shared";
const directory = mkdtempSync(join(tmpdir(), "kshiai-unified-integration-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.AUTH_PROVIDER = "legacy";
process.env.LLM_PROVIDER = "xai";
process.env.ALLOW_MOCK_PROVIDER = "false";
process.env.OPENAI_API_KEY = "test-only";
process.env.XAI_API_KEY = "test-only";
process.env.OPENAI_BASE_URL = "https://test.invalid/v1";
process.env.XAI_BASE_URL = "https://test.invalid/v1";
process.env.XAI_MODEL_ENGINE = "grok-4.5";
process.env.XAI_MODEL_FAST = "grok-4.3";
process.env.TRIAL_TEST_FAILURE = "";
await import("../testing/awareness-trial-http-fixture.js");
const { closeDatabase, query } = await import("../db.js");
const { readAwarenessTrialCandidate } = await import("./awareness-trial-candidate.js");
const { seedAwarenessTrial } = await import("./awareness-trial-seed.js");
const { createLlmProvider } = await import("../llm/index.js");
const { startBattle, advanceTurn } = await import("./battle-service.js");
const { getBattle } = await import("../repositories/battles.js");
const { getUnifiedRuntime } = await import("../repositories/unified-consciousness.js");
const { getAwarenessRuntime } = await import("../repositories/battle-awareness.js");
const { processNextNarration, createLlmNarrationGenerator } = await import("./narration-worker.js");
after(async () => { await closeDatabase(); rmSync(directory, { recursive: true, force: true }); });
const document = readAwarenessTrialCandidate(resolve(import.meta.dirname, "../../../docs/evidence/awareness-real-trial-candidate-2026-10-05.json"));
const seeded = await seedAwarenessTrial(document.candidate);
it("creates v6 without historical psyche runtime and commits prologue plus a combat tick", async (t) => {
  const llm = createLlmProvider(); const roles = llm.awareness; assert.ok(roles?.consciousness);
  t.mock.method(roles.narration, "narrateFrozenBatch", async (materials: readonly AwarenessFrozenNarration[]) => materials.map((material) => {
    const phase = material.phase;
    if (phase !== "prologue" && phase !== "combat") throw new Error("Unexpected test narration phase");
    return { phase, battleId: material.battleId, turnReceiptId: material.turnReceiptId,
      narration: { turn: material.turn, narrator: ["向き合う。", "静かに構える。", "声が響く。", "場が静まる。"],
        speeches: material.sourceSpeeches.map((speech) => ({ sourceSide: speech.side, speaker: speech.side === "a" ? "アオ" : "クロ", text: speech.text, afterNarratorLine: 0 })) } };
  }));
  let calls = 0;
  t.mock.method(roles.models, "subconscious", async () => { throw new Error("OLD_SUBCONSCIOUS_FORBIDDEN"); });
  t.mock.method(roles.models, "conscious", async () => { throw new Error("OLD_CONSCIOUS_FORBIDDEN"); });
  t.mock.method(roles.consciousness, "requestJson", async () => { calls += 1; return { speech: "まず様子を見よう", memoryOperations: [{ kind: "insert", priority: 1, text: "秘密の観察方針" }] }; });
  const [a, b] = document.candidate.characters; assert.ok(a); assert.ok(b);
  const battleId = "unified-local-integration";
  const createdPublic = await startBattle({ userId: seeded.userId, battleId, myCharacterId: a.sheet.id, opponentCharacterId: b.sheet.id,
    battlefieldMode: "preset", battlefieldPresetId: seeded.battlefieldId, consciousnessPolicy: UnifiedConsciousnessPolicyV1, llm });
  assert.doesNotMatch(JSON.stringify(createdPublic), /秘密の観察方針/);
  assert.equal((await getBattle(battleId))?.assetManifest?.schemaVersion, 6);
  assert.equal(await getAwarenessRuntime(battleId), null);
  const prologue = await advanceTurn({ userId: seeded.userId, battleId, operationId: "unified-prologue", llm });
  assert.notEqual(prologue.status, "incomplete");
  const runtime = await getUnifiedRuntime(battleId); assert.ok(runtime);
  assert.equal(runtime.runtime.tick, 0); assert.equal(calls, 2);
  assert.equal(runtime.runtime.sides.a.memory[0]?.text, "秘密の観察方針");
  const combat = await advanceTurn({ userId: seeded.userId, battleId, operationId: "unified-combat", llm });
  const stored = await getBattle(battleId); assert.ok(stored);
  assert.notEqual(stored.status, "incomplete", stored.incompleteReason);
  assert.equal((await getUnifiedRuntime(battleId))?.runtime.tick, 1);
  assert.doesNotMatch(JSON.stringify(combat), /秘密の観察方針|memoryOperations/);
  assert.ok(stored.turnRecords?.some((record) => record.events.some((event) => event.utterance?.text === "まず様子を見よう")));
  assert.deepEqual((await getUnifiedRuntime(battleId))?.runtime.sides.a.pendingEvents, []);
  const beforeNarration = await getUnifiedRuntime(battleId);
  const narrationResult = await processNextNarration({ battleId, ownerId: "unified-worker", generator: createLlmNarrationGenerator(llm) });
  assert.equal(narrationResult, "completed", JSON.stringify((await query("SELECT error_class FROM battle_narration_attempts WHERE battle_id=$1", [battleId])).rows));
  const afterNarration = await getUnifiedRuntime(battleId); assert.ok(afterNarration);
  assert.deepEqual(afterNarration.runtime.sides, beforeNarration?.runtime.sides);
});
it("keeps default battle binding v5 creation and historical consciousness execution", async () => {
  const llm = createLlmProvider(); const [a, b] = document.candidate.characters; assert.ok(a); assert.ok(b);
  const battleId = "historical-local-integration";
  await startBattle({ userId: seeded.userId, battleId, myCharacterId: a.sheet.id, opponentCharacterId: b.sheet.id,
    battlefieldMode: "preset", battlefieldPresetId: seeded.battlefieldId, llm });
  assert.equal((await getBattle(battleId))?.assetManifest?.schemaVersion, 5);
  assert.equal(await getUnifiedRuntime(battleId), null);
  await advanceTurn({ userId: seeded.userId, battleId, operationId: "historical-prologue", llm });
  const stored = await getBattle(battleId); assert.ok(stored);
  assert.notEqual(stored.status, "incomplete", stored.incompleteReason);
  const runtime = await getAwarenessRuntime(battleId); assert.ok(runtime);
  assert.equal(runtime.runtime.lastCommittedAt !== null, true);
  assert.equal(await processNextNarration({ battleId, ownerId: "historical-worker", generator: createLlmNarrationGenerator(llm) }), "completed");
});
