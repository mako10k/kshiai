// R: Verify the public V5 advance path preserves durable facts on failed admission and never substitutes absent character actions.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { BattleStateSchema, CharacterGenerationEnvelopeV3Schema, compileCharacterBattleCompilerInputsV4,
  AwarenessLatentOutputSchema, AwarenessConsciousOutputSchema, AwarenessFrozenNarrationSchema } from "@kshiai/shared";
import type { AwarenessCharacterState } from "@kshiai/shared";
import type { AwarenessProviderRoles } from "../llm/awareness-provider-factory.js";
import type { AwarenessVerifiedBillingContract } from "../llm/awareness-dispatch-admission.js";
import type { LlmProvider } from "../llm/types.js";
import { validAwarenessBattleFixture } from "./awareness-test-fixture.js";

process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "awareness-battle-service-")), "test.db");
const { query, withTransaction } = await import("../db.js");
const { insertNewBattle, getBattle } = await import("../repositories/battles.js");
const { writeAssetGeneration } = await import("../repositories/asset-generations.js");
const { buildImportedCharacterEnvelopeV2 } = await import("./character-authoring-service.js");
const { MockLlmProvider } = await import("../llm/mock.js");
const { requestDigest } = await import("./distributed-guard.js");
const { advanceTurn } = await import("./battle-service.js");

class NoLegacyProvider extends MockLlmProvider {
  legacyCalls = 0;
  semanticFailure = false;
  override async reconcileTurnSemanticState(input: Parameters<LlmProvider["reconcileTurnSemanticState"]>[0]): ReturnType<LlmProvider["reconcileTurnSemanticState"]> {
    if (this.semanticFailure) throw new Error("test required semantic failure");
    return super.reconcileTurnSemanticState(input);
  }
  override async decideCharacterAction(_input: Parameters<LlmProvider["decideCharacterAction"]>[0]): Promise<never> {
    this.legacyCalls++; throw new Error("legacy decide forbidden in V5");
  }
  override async advanceCharacterAgent(_input: Parameters<LlmProvider["advanceCharacterAgent"]>[0]): Promise<never> {
    this.legacyCalls++; throw new Error("legacy consciousness forbidden in V5");
  }
  override async advanceCharacterPsyche(_input: Parameters<LlmProvider["advanceCharacterPsyche"]>[0]): Promise<never> {
    this.legacyCalls++; throw new Error("legacy psyche forbidden in V5");
  }
}
function provider(configured: boolean, billed: boolean, attack = false) {
  const domain = new NoLegacyProvider();
  const calls = { latent: 0, conscious: 0, transport: 0 };
  const roles: AwarenessProviderRoles = {
    models: { subconscious: async (input) => { calls.latent++; return AwarenessLatentOutputSchema.parse({
      state: { ...input.currentState, updatedTick: input.tick }, reflexDesires: [],
      affectiveDesires: attack && input.side === "a" ? [{ id: `attack-${input.tick}`, source: "subconscious", strength: 1,
        resource: "body", startTick: input.tick, validUntilTick: input.tick + 1, action: { kind: "basic_attack" } }] : [], reconsider: false, cancelThought: false,
    }); }, conscious: async () => { calls.conscious++; return AwarenessConsciousOutputSchema.parse({ goal: null, thought: "", desires: [], influences: [] }); } },
    adjudication: { identity: { provider: "xai", engineModel: "grok-test", fastModel: "grok-test" },
      requestJson: async () => { calls.transport++; throw new Error("unexpected transport call"); } },
    adjudicationProvider: domain,
    narration: { identity: { provider: "xai", engineModel: "grok-test", fastModel: "grok-test" },
      narrateBatch: async () => { throw new Error("advance must not narrate"); },
      narrateFrozenBatch: async () => { throw new Error("advance must not narrate"); } },
  };
  const contracts: AwarenessVerifiedBillingContract[] = [{ provider: "openai", model: "gpt-6-luna" }, { provider: "xai", model: "grok-test" }].map((identity) => ({
    ...identity, quote: async (request) => ({ ...identity, requestDigest: requestDigest(request),
      fullMessageTokens: 100, outputTokenLimit: request.options.maxCompletionTokens,
      maximumChargeUsd: 0.001, verifiedFullPrompt: true, includesAllGeneratedTokens: true }),
  }));
  const llm: LlmProvider = Object.assign(domain, configured ? { awareness: roles, awarenessBillingContracts: billed ? contracts : [] } : {});
  return { llm, calls, domain };
}
async function fixture(id: string, prologue: boolean, lowHp = false) {
  const { state, characters } = validAwarenessBattleFixture(id);
  const manifest = state.assetManifest; assert.ok(manifest?.schemaVersion === 5);
  manifest.boundAt = new Date().toISOString();
  for (const side of ["a", "b"] as const) {
    const source = buildImportedCharacterEnvelopeV2({ sheet: characters[side], attemptId: `test-${id}-${side}` });
    const content = CharacterGenerationEnvelopeV3Schema.parse({ ...source, definitionSchema: { family: "character", version: 3 },
      definition: { ...source.definition, schemaVersion: 3, actionNorms: [], consciousGuidance: [], mechanicalConflictFallbacks: [] },
      compilerCompatibility: [{ consumer: "character-profile", version: 2 }, { consumer: "battle-mechanics", version: 3 },
        { consumer: "psyche-trait-profile", version: 1 }, { consumer: "character-conscious-self", version: 3 },
        { consumer: "character-action-norms", version: 3 }, { consumer: "character-mechanical-conflict-fallback", version: 1 },
        { consumer: "character-relationship", version: 2 }], deferredValues: { contractVersion: 1, values: [] },
    });
    const generation = await withTransaction((connection) => writeAssetGeneration(connection, {
      assetType: "character", assetId: characters[side].id, schemaVersion: 3, content,
    }));
    manifest.characters[side] = { ...manifest.characters[side], generationId: generation.generationId,
      contentDigest: generation.contentDigest, compilerInputsV4: compileCharacterBattleCompilerInputsV4({ definition: content.definition }),
      basicAttackSource: { kind: "character_generation_v3", generationId: generation.generationId, definitionPath: "capabilities.basicAction" } };
  }
  if (lowHp) state.sideB.parameters.hp = 1;
  const complete = BattleStateSchema.parse({ ...state, prologuePending: prologue });
  await insertNewBattle(complete, { sideAUserId: "owner", sideACharacterId: "a", sideBCharacterId: "b" });
  return complete;
}
for (const configured of [false, true]) it(`public advance stops incomplete with ${configured ? "missing billing proof" : "missing awareness route"} and preserves canonical facts`, async () => {
  const id = `awareness-public-stop-${configured}`; const before = await fixture(id, true); const test = provider(configured, false);
  const result = await advanceTurn({ userId: "owner", battleId: id, operationId: "stop-op", llm: test.llm });
  assert.equal(result.status, "incomplete");
  const saved = await getBattle(id); assert.ok(saved);
  assert.deepEqual(saved.worldState, before.worldState);
  assert.deepEqual(saved.sideA, before.sideA); assert.deepEqual(saved.sideB, before.sideB);
  assert.equal(saved.winnerSide, before.winnerSide);
  assert.equal(saved.finishReason, before.finishReason);
  assert.equal(saved.ratingSettlement, undefined);
  assert.deepEqual(test.calls, { latent: 0, conscious: 0, transport: 0 });
  assert.equal(test.domain.legacyCalls, 0);
  assert.equal((await query("SELECT 1 FROM battle_narration_entries WHERE battle_id=$1", [id])).rowCount, 0);
});
it("public configured prologue then combat preserves absent body intents without legacy agent calls", async () => {
  const id = "awareness-public-prologue-combat"; const before = await fixture(id, true); const test = provider(true, true);
  const first = await advanceTurn({ userId: "owner", battleId: id, operationId: "opening-op", llm: test.llm });
  assert.equal(first.status, "active", first.incompleteReason ?? "");
  let saved = await getBattle(id); assert.ok(saved);
  assert.equal(saved.prologuePending, false);
  assert.equal(saved.phaseReceipts?.at(-1)?.phase, "prologue");
  AwarenessFrozenNarrationSchema.parse(saved.phaseReceipts?.at(-1)?.narrationInput);
  await new Promise<void>((resolve) => setTimeout(resolve, 1050));
  const second = await advanceTurn({ userId: "owner", battleId: id, operationId: "combat-op", llm: test.llm });
  assert.equal(second.status, "active", second.incompleteReason ?? "");
  saved = await getBattle(id); assert.ok(saved);
  assert.equal(saved.sideA.parameters.hp, before.sideA.parameters.hp);
  assert.equal(saved.sideB.parameters.hp, before.sideB.parameters.hp);
  assert.deepEqual(saved.turnRecords?.at(-1)?.actions, []);
  assert.equal(saved.agentStateA, undefined);
  assert.equal(saved.agentStateB, undefined);
  assert.equal(saved.phaseReceipts?.at(-1)?.phase, "combat");
  AwarenessFrozenNarrationSchema.parse(saved.phaseReceipts?.at(-1)?.narrationInput);
  assert.equal(test.domain.legacyCalls, 0);
  assert.equal(test.calls.transport, 0);
  assert.equal(test.calls.latent, 4);
});

it("public KO commits terminal combat and aftermath together without starting post-KO thoughts", async () => {
  const id = "awareness-public-ko"; await fixture(id, false, true); const test = provider(true, true, true);
  const result = await advanceTurn({ userId: "owner", battleId: id, operationId: "ko-op", llm: test.llm });
  assert.equal(result.status, "finished");
  const saved = await getBattle(id); assert.ok(saved);
  assert.equal(saved.winnerSide, "a");
  assert.equal(saved.aftermathPending, false);
  assert.equal(saved.sideB.parameters.hp, 0);
  assert.deepEqual(saved.phaseReceipts?.map((receipt) => receipt.phase), ["combat", "aftermath"]);
  for (const receipt of saved.phaseReceipts ?? []) AwarenessFrozenNarrationSchema.parse(receipt.narrationInput);
  const { getAwarenessRuntime } = await import("../repositories/battle-awareness.js");
  const runtime = await getAwarenessRuntime(id); assert.ok(runtime);
  assert.equal(runtime.runtime.status, "terminal");
  assert.ok(runtime.runtime.terminalAt !== null);
  for (const side of ["a", "b"] as const) {
    const subjective: AwarenessCharacterState = runtime.runtime.sides[side];
    assert.equal(subjective.job?.status, "cancelled");
    assert.ok(subjective.generation > (subjective.job?.generation ?? -1));
  }
  assert.equal(test.calls.latent, 2);
  assert.equal(test.calls.conscious, 2);
  assert.equal(test.domain.legacyCalls, 0);
});

it("failed required semantic judgment preserves the last world instead of saving an earlier engine bucket", async () => {
  const id = "awareness-public-required-failure"; const before = await fixture(id, false, true);
  const test = provider(true, true, true); test.domain.semanticFailure = true;
  const result = await advanceTurn({ userId: "owner", battleId: id, operationId: "required-failure-op", llm: test.llm });
  assert.equal(result.status, "incomplete");
  const saved = await getBattle(id); assert.ok(saved);
  assert.deepEqual(saved.worldState, before.worldState);
  assert.equal(saved.sideB.parameters.hp, 1);
  assert.equal(saved.winnerSide, before.winnerSide);
  assert.equal(saved.finishReason, before.finishReason);
  assert.equal(saved.ratingSettlement, undefined);
  assert.deepEqual(saved.phaseReceipts ?? [], []);
  assert.equal((await query("SELECT 1 FROM battle_narration_entries WHERE battle_id=$1", [id])).rowCount, 0);
  assert.equal(test.domain.legacyCalls, 0);
});
