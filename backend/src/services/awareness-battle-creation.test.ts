// R: Verify actual V5 battle creation, prologue advancement, and replay against frozen SQLite assets.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { CharacterGenerationEnvelopeV3Schema, AwarenessNormalPolicy, AwarenessFrozenNarrationSchema, type CharacterSheet } from "@kshiai/shared";
import type { LlmProvider } from "../llm/types.js";
import type { AwarenessVerifiedBillingContract } from "../llm/awareness-dispatch-admission.js";

const directory = mkdtempSync(join(tmpdir(), "kshiai-awareness-main-creation-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.AUTH_PROVIDER = "legacy";
const { closeDatabase, query } = await import("../db.js");
const { saveHistoricalCharacterFixture } = await import("../testing/historical-character-fixtures.js");
const generationRepo = await import("../testing/historical-asset-generations.js");
const settingsRepo = await import("../repositories/dialogue-pipeline-settings.js");
const { ensureSystemNarrationStyles } = await import("../repositories/narration-styles.js");
const { createConsciousFixture } = await import("./conscious-agency.fixtures.js");
const { buildImportedCharacterEnvelopeV2 } = await import("./character-authoring-service.js");
const { startBattle, advanceTurn } = await import("./battle-service.js");
const { getBattle } = await import("../repositories/battles.js");
const { getAwarenessRuntime } = await import("../repositories/battle-awareness.js");
const { listLlmUsageAttempts } = await import("../repositories/llm-usage.js");
const { OpenAiCompatibleProvider } = await import("../llm/openai-compatible.js");
const { createAwarenessProviderRoles } = await import("../llm/awareness-provider-factory.js");
const { requestDigest } = await import("./distributed-guard.js");
after(async () => { await closeDatabase(); rmSync(directory, { recursive: true, force: true }); });
function envelopeV3(sheet: CharacterSheet) {
  const source = buildImportedCharacterEnvelopeV2({
    sheet,
    attemptId: `v3-battle-${sheet.id}`,
  });
  const { schemaVersion: _schemaVersion, actionNorms: _actionNorms, ...stable } =
    source.definition;
  return CharacterGenerationEnvelopeV3Schema.parse({
    ...source,
    definitionSchema: { family: "character", version: 3 },
    definition: {
      ...stable,
      schemaVersion: 3,
      actionNorms: [],
      consciousGuidance: [],
      mechanicalConflictFallbacks: [],
    },
    compilerCompatibility: [
      { consumer: "character-profile", version: 2 },
      { consumer: "battle-mechanics", version: 3 },
      { consumer: "psyche-trait-profile", version: 1 },
      { consumer: "character-conscious-self", version: 3 },
      { consumer: "character-action-norms", version: 3 },
      { consumer: "character-mechanical-conflict-fallback", version: 1 },
      { consumer: "character-relationship", version: 2 },
    ],
    deferredValues: { contractVersion: 1, values: [] },
  });
}

async function setup() {
  const fixture = createConsciousFixture();
  fixture.opp.visibility = "public";
  await query("INSERT INTO users (id,username,password_hash,created_at) VALUES ($1,$2,$3,$4)", ["inventory-owner", "awareness-owner", "test", new Date().toISOString()]);
  await saveHistoricalCharacterFixture(fixture.mine);
  await saveHistoricalCharacterFixture(fixture.opp);
  const a = await generationRepo.createAssetGeneration({ assetType: "character", assetId: fixture.mine.id, schemaVersion: 3, content: envelopeV3(fixture.mine) });
  const b = await generationRepo.createAssetGeneration({ assetType: "character", assetId: fixture.opp.id, schemaVersion: 3, content: envelopeV3(fixture.opp) });
  await ensureSystemNarrationStyles();
  await settingsRepo.updateDialoguePipelineSettings({ userId: "inventory-owner", patch: { ...fixture.settings, schemaVersion: 3, expectedRevision: 0 } });
  return { fixture, a, b };
}
function provider(billed: boolean): LlmProvider {
  const roles = createAwarenessProviderRoles({ openai: { apiKey: "test-only", baseUrl: "https://test.invalid/v1" },
    xai: { apiKey: "test-only", baseUrl: "https://test.invalid/v1", modelEngine: "grok-engine", modelFast: "grok-fast" } });
  assert.ok(roles);
  const contracts: AwarenessVerifiedBillingContract[] = [{ provider: "xai", model: "grok-engine" }, { provider: "openai", model: "gpt-6-luna" }].map((identity) => ({ ...identity,
    async quote(request) { return { provider: request.provider, model: request.model, requestDigest: requestDigest(request),
      fullMessageTokens: 100, outputTokenLimit: request.options.maxCompletionTokens, maximumChargeUsd: 0.001,
      verifiedFullPrompt: true, includesAllGeneratedTokens: true }; } }));
  return Object.assign(new OpenAiCompatibleProvider({ name: "xai", apiKey: "test-only", baseUrl: "https://test.invalid/v1", modelEngine: "grok-engine", modelFast: "grok-fast", fallbackOnError: false }),
    { awareness: roles, awarenessBillingContracts: billed ? contracts : [] });
}
const wireSchema = z.object({ model: z.string(), messages: z.array(z.object({ content: z.string() })) });
describe("actual awareness battle creation and advancement", () => {
  it("binds immutable V5 assets, adopts encounter accounting and replays without duplicate dispatch", async (t) => {
    const { fixture, a, b } = await setup();
    let encounters = 0;
    let latent = 0;
    let conscious = 0;
    t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
      const wire = wireSchema.parse(JSON.parse(String(init.body)));
      const system = wire.messages[0]?.content ?? "";
      let output: unknown;
      if (system.includes("Prepare immutable presentation")) {
        encounters += 1;
        output = { participants: { a: { battleLabel: fixture.mine.displayName }, b: { battleLabel: fixture.opp.displayName } },
          social: { a: { relationshipLabel: "未知", counterpartAddress: "相手", selfReference: null }, b: { relationshipLabel: "未知", counterpartAddress: "相手", selfReference: null } }, openingSummary: "対峙する" };
      } else if (wire.model === "gpt-6-luna") {
        latent += 1;
        output = { state: { updatedTick: 0, sensations: [], emotions: [], tendencies: [], feltProjection: "落ち着かない" }, reflexDesires: [], affectiveDesires: [], reconsider: false, cancelThought: false };
      } else {
        conscious += 1;
        output = { goal: "状況を見よう", thought: "まず待つ", desires: [], influences: [] };
      }
      return Response.json({ choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } });
    });
    const llm = provider(true);
    const createInput = { userId: "inventory-owner", battleId: "awareness-main", myCharacterId: fixture.mine.id,
      opponentCharacterId: fixture.opp.id, battlefieldMode: "random" as const, llm };
    const created = await startBattle(createInput);
    const bound = await getBattle(created.id);
    assert.ok(bound?.assetManifest?.schemaVersion === 5);
    assert.equal(bound.turnLimit, 12);
    assert.equal(bound.sceneBeat?.k, 3);
    assert.deepEqual(bound.assetManifest.awarenessPolicy, AwarenessNormalPolicy);
    assert.equal(bound.assetManifest.promptRevision, "awareness-prompt-v4");
    assert.equal(bound.assetManifest.characters.a.generationId, a.generationId);
    assert.equal(bound.assetManifest.characters.b.generationId, b.generationId);
    assert.equal(bound.assetManifest.characters.a.contentDigest, a.contentDigest);
    assert.equal(bound.agentStateA?.consciousAgencyV1, undefined);
    assert.equal(bound.agentStateA?.consciousAgencyV2, undefined);
    assert.equal(bound.agentStateA?.reactionStateV1, undefined);
    const initial = await getAwarenessRuntime(created.id);
    assert.ok(initial);
    assert.equal(initial.runtime.budget.physicalAttempts, 1);
    const creationRows = await query<{ snapshot_json: string }>("SELECT snapshot_json FROM battle_awareness_creation WHERE battle_id=$1", [created.id]);
    const creationRow = creationRows.rows[0];
    assert.ok(creationRow);
    const creation = z.object({ startedAt: z.number(), deadlineAt: z.number(), status: z.literal("adopted") }).parse(JSON.parse(creationRow.snapshot_json));
    assert.equal(initial.runtime.startedAt, creation.startedAt);
    assert.equal(initial.runtime.deadlineAt, creation.deadlineAt);
    assert.equal(initial.runtime.deadlineAt - initial.runtime.startedAt, AwarenessNormalPolicy.maxDurationMs);
    await startBattle(createInput);
    assert.equal(encounters, 1);
    const advanced = await advanceTurn({ userId: "inventory-owner", battleId: created.id, operationId: "prologue-once", llm });
    const saved = await getBattle(created.id);
    assert.ok(saved);
    assert.equal(saved.status, "active", saved.incompleteReason ?? "");
    assert.equal(saved.prologuePending, false);
    assert.deepEqual(saved.assetManifest, bound.assetManifest);
    const receipt = saved.phaseReceipts?.find((item) => item.phase === "prologue");
    assert.ok(receipt);
    const frozen = AwarenessFrozenNarrationSchema.parse(receipt.narrationInput);
    assert.equal(frozen.battleId, created.id);
    assert.equal(frozen.turnReceiptId, receipt.id);
    assert.equal(frozen.phase, "prologue");
    assert.equal(frozen.promptRevision, bound.assetManifest.promptRevision);
    assert.equal(latent, 2);
    const sends = encounters + latent + conscious;
    await advanceTurn({ userId: "inventory-owner", battleId: created.id, operationId: "prologue-once", llm });
    assert.equal(encounters + latent + conscious, sends);
    assert.equal((await getBattle(created.id))?.battleRevision, saved.battleRevision);
    assert.equal(advanced.id, created.id);
    const missingInput = { ...createInput, battleId: "awareness-main-no-proof", llm: provider(false) };
    await startBattle(missingInput);
    assert.equal(encounters, 2);
    assert.ok(await getBattle(missingInput.battleId));
    const usage = await listLlmUsageAttempts({ battleId: created.id });
    assert.ok(usage.length >= 3);
    assert.ok(usage.some((attempt) => attempt.role === "creation"));
    assert.equal(usage.filter((attempt) => attempt.role === "subconscious").length, 2);
    for (const attempt of usage.filter((item) => item.status === "completed")) {
      assert.equal(attempt.promptTokens, 10);
      assert.equal(attempt.completionTokens, 10);
      assert.equal(attempt.totalTokens, 20);
    }
  });
});
