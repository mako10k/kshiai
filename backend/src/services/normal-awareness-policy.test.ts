// R: Verify ordinary creation persists adequate deadlines and forwards its bound policy through the real SDK roles offline.
import assert from "node:assert/strict";
import { after, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AwarenessNormalPolicy, AwarenessObservedPolicy, type AwarenessPolicyV1, type AwarenessLatentInput, type AwarenessConsciousInput } from "@kshiai/shared";

const directory = mkdtempSync(join(tmpdir(), "kshiai-normal-policy-"));
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
const { closeDatabase } = await import("../db.js");
const { readAwarenessTrialCandidate } = await import("./awareness-trial-candidate.js");
const { seedAwarenessTrial } = await import("./awareness-trial-seed.js");
const { createLlmProvider } = await import("../llm/index.js");
const { startBattle, advanceTurn } = await import("./battle-service.js");
const { getBattle } = await import("../repositories/battles.js");
const { getAwarenessRuntime } = await import("../repositories/battle-awareness.js");
after(async () => { await closeDatabase(); rmSync(directory, { recursive: true, force: true }); });

it("persists operating policy awareness-v5-usage-v3 for default creation and overrides a legacy provider's shorter timing", async (t) => {
  const document = readAwarenessTrialCandidate(resolve(import.meta.dirname, "../../../docs/evidence/awareness-real-trial-candidate-2026-10-05.json"));
  const seeded = await seedAwarenessTrial(document.candidate);
  const llm = createLlmProvider({ awarenessPolicy: AwarenessObservedPolicy });
  const roles = llm.awareness; assert.ok(roles);
  const seen: Array<{ role: string; policy: AwarenessPolicyV1 | undefined }> = [];
  const latent = roles.models.subconscious.bind(roles.models);
  const conscious = roles.models.conscious.bind(roles.models);
  t.mock.method(roles.models, "subconscious", async (input: AwarenessLatentInput, revision?: string, policy?: AwarenessPolicyV1) => {
    seen.push({ role: "subconscious", policy }); return latent(input, revision, policy);
  });
  t.mock.method(roles.models, "conscious", async (input: AwarenessConsciousInput, revision?: string, policy?: AwarenessPolicyV1) => {
    seen.push({ role: "conscious", policy }); return conscious(input, revision, policy);
  });
  const [a, b] = document.candidate.characters; assert.ok(a); assert.ok(b);
  const battleId = "normal-policy-default";
  await startBattle({ userId: seeded.userId, battleId, myCharacterId: a.sheet.id, opponentCharacterId: b.sheet.id,
    battlefieldMode: "preset", battlefieldPresetId: seeded.battlefieldId, llm });
  const created = await getBattle(battleId); assert.ok(created?.assetManifest?.schemaVersion === 5);
  assert.deepEqual(created.assetManifest.awarenessPolicy, AwarenessNormalPolicy);
  assert.equal(created.assetManifest.promptRevision, "awareness-prompt-v4");
  await advanceTurn({ userId: seeded.userId, battleId, operationId: "normal-policy-prologue", llm });
  const stored = await getAwarenessRuntime(battleId); assert.ok(stored);
  assert.deepEqual(stored.runtime.policy, AwarenessNormalPolicy);
  assert.equal(stored.runtime.promptRevision, "awareness-prompt-v4");
  assert.equal(stored.runtime.deadlineAt - stored.runtime.startedAt, 600000);
  assert.equal(stored.runtime.status, "active");
  assert.equal(seen.filter((item) => item.role === "subconscious").length, 2);
  assert.equal(seen.filter((item) => item.role === "conscious").length, 2);
  assert.ok(seen.every((item) => item.policy?.revision === "awareness-v5-usage-v3"));
});
