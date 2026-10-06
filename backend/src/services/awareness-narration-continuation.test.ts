// R: Verify legacy frozen narration continues through the current transport contract and publication path.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { AwarenessDefaultPolicy, AwarenessFrozenNarrationSchema, AwarenessInitialize, BattleStateSchema, NarrativeBlockSchema } from "@kshiai/shared";
import { TransportAwarenessNarrationProvider } from "../llm/awareness-narration.js";
import type { AwarenessRequestOptions } from "../llm/awareness-provider-contract.js";
import { LEGACY_NARRATION_CONTRACT } from "../llm/narration-prompt-contract.js";
import { narrationReceiptExample } from "../llm/narration-receipt-contract.js";
import type { VerifiedNarrationDispatchAdmission } from "./awareness-narration-worker.js";
import { validAwarenessBattleFixture } from "./awareness-test-fixture.js";

process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "awareness-continuation-")), "test.db");

const { query } = await import("../db.js");
const { insertNewBattle } = await import("../repositories/battles.js");
const { initializeAwarenessRuntime } = await import("../repositories/battle-awareness.js");
const { acquireBattleLeaseFence, releaseBattleLease, requestDigest } = await import("./distributed-guard.js");
const { processNextNarration } = await import("./narration-worker.js");

const base = Date.parse("2026-10-05T06:00:00Z");
const clock = { now: () => base + 1000, withDeadline: async <T>(promise: Promise<T>) => promise };
const admission: VerifiedNarrationDispatchAdmission = {
  pricingRevision: "verified-continuation-test",
  billingContract: {
    provider: "xai", model: "grok-test",
    quote: async (request) => ({ provider: request.provider, model: request.model, requestDigest: requestDigest(request),
      fullMessageTokens: 100, outputTokenLimit: request.options.maxCompletionTokens, maximumChargeUsd: 0.001,
      verifiedFullPrompt: true, includesAllGeneratedTokens: true }),
  },
};

const phases = ["prologue", "combat", "judgment", "aftermath"] as const;
const revisions = ["awareness-prompt-v1", "awareness-prompt-v2", undefined] as const;

it("continues every phase and retained prompt revision through current transport publication", async () => {
  for (const phase of phases) for (const [revisionIndex, promptRevision] of revisions.entries()) {
    const battleId = `awareness-legacy-continuation-${phase}-${revisionIndex}`;
    const { state } = validAwarenessBattleFixture(battleId);
    const turn = phase === "prologue" ? 0 : 1;
    const user = `凍結入力 ${phase} ${revisionIndex}; preserve observer boundary.`;
    const material = AwarenessFrozenNarrationSchema.parse({
      kind: "awareness-v5", phase, battleId, turnReceiptId: `${battleId}:phase:1`, turn,
      system: [LEGACY_NARRATION_CONTRACT.output(phase, "external"), LEGACY_NARRATION_CONTRACT.speechSurface(phase),
        `Frozen style ${phase} ${revisionIndex}; preserve observer boundary.`].join("\n"),
      user, urgent: true, sourceSpeeches: [], recognitionRefs: [],
      judgmentVerdict: phase === "judgment" ? "draw" : null,
      ...(promptRevision === undefined ? {} : { promptRevision }),
    });
    const originalDigest = requestDigest(material);
    const complete = BattleStateSchema.parse({ ...state, advanceOperation: undefined, battleRevision: 1, phaseReceiptSequence: 1, phaseReceipts: [{
      schemaVersion: 1, id: material.turnReceiptId, sequence: 1, operationId: `${battleId}:op`, phase,
      combatTurn: phase === "combat" ? 1 : null, fromRevision: 0, toRevision: 1,
      committedAt: new Date(base).toISOString(), narrationInput: material, narrationInputDigest: originalDigest, narrationDeferred: true,
    }] });
    await insertNewBattle(complete, { sideAUserId: "owner", sideACharacterId: "a", sideBCharacterId: "b" });
    const persistedState = (await query<{ state_json: string }>("SELECT state_json FROM battles WHERE id=$1", [battleId])).rows[0]!;
    const persistedBattle = BattleStateSchema.parse(JSON.parse(persistedState.state_json));
    const persistedReceipt = persistedBattle.phaseReceipts?.[0];
    assert.ok(persistedReceipt);
    const digest = originalDigest;
    const serialized = JSON.stringify(material);
    const fence = await acquireBattleLeaseFence(battleId, "fixture", new Date(base));
    assert.ok(fence);
    await initializeAwarenessRuntime({ battleId, fence, now: new Date(base).toISOString(), runtime: AwarenessInitialize({
      startedAt: base, promptRevision: "awareness-prompt-v1", outputRevision: "awareness-output-v1", policy: AwarenessDefaultPolicy,
    }) });
    await releaseBattleLease(battleId, "fixture");
    // Seed the retained legacy snapshot after the repository creates current narration rows.
    const updatedBattle = BattleStateSchema.parse({ ...persistedBattle, phaseReceipts: [{ ...persistedReceipt, narrationInput: material, narrationInputDigest: digest }] });
    await query("UPDATE battles SET state_json=$2 WHERE id=$1", [battleId, JSON.stringify(updatedBattle)]);
    await query("UPDATE battle_narration_entries SET input_json=$2,input_digest=$3,status='queued',active_attempt_id=NULL WHERE battle_id=$1", [battleId, JSON.stringify(material), digest]);
    await query("DELETE FROM battle_presentations WHERE battle_id=$1", [battleId]);
    await query("UPDATE battle_narration_outbox SET status='pending',dispatched_at=NULL WHERE battle_id=$1", [battleId]);

    const calls: { system: string; user: string; options: AwarenessRequestOptions }[] = [];
    const provider = new TransportAwarenessNarrationProvider({
      identity: { provider: "xai", engineModel: "grok-test", fastModel: "grok-test" },
      requestJson: async (system, requestedUser, options) => {
        calls.push({ system, user: requestedUser, options });
        return narrationReceiptExample([material]);
      },
    });
    const generator = Object.assign(async () => { throw new Error("legacy generator must not run"); }, {
      awareness: { provider, admission, clock },
    });
    assert.equal(await processNextNarration({ battleId, ownerId: "worker", now: new Date(clock.now()), generator }), "completed", `${phase}/${revisionIndex}`);
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.system, /Return JSON only with exactly one top-level receipts array/);
    assert.match(calls[0]!.system, /Preserve each supplied speech text exactly/);
    assert.match(calls[0]!.system, new RegExp(`Frozen style ${phase} ${revisionIndex}`));
    assert.match(calls[0]!.system, /preserve observer boundary/);
    assert.doesNotMatch(calls[0]!.system, /JSON: \{/);
    assert.doesNotMatch(calls[0]!.system, /You may change punctuation/);
    assert.match(calls[0]!.user, new RegExp(`凍結入力 ${phase} ${revisionIndex}`));
    const row = (await query<{ input_json: string; input_digest: string; status: string }>(
      "SELECT input_json,input_digest,status FROM battle_narration_entries WHERE battle_id=$1", [battleId])).rows[0];
    assert.ok(row);
    assert.equal(row.status, "completed");
    assert.equal(row.input_json, serialized);
    assert.equal(row.input_digest, digest);
    const storedBattle = (await query<{ state_json: string }>("SELECT state_json FROM battles WHERE id=$1", [battleId])).rows[0];
    assert.ok(storedBattle);
    const stateAfter = BattleStateSchema.parse(JSON.parse(storedBattle.state_json));
    assert.deepEqual(stateAfter.phaseReceipts?.[0]?.narrationInput, material);
    assert.equal(stateAfter.phaseReceipts?.[0]?.narrationInputDigest, digest);
    const presentation = (await query<{ phase: string; input_digest: string; narrative_json: string }>(
      "SELECT phase,input_digest,narrative_json FROM battle_presentations WHERE battle_id=$1", [battleId])).rows[0];
    assert.ok(presentation);
    assert.equal(presentation.phase, phase);
    assert.equal(presentation.input_digest, digest);
    const narrative = NarrativeBlockSchema.parse(JSON.parse(presentation.narrative_json));
    if (phase === "judgment") assert.ok(narrative.narrator?.includes("draw"));
    else assert.ok(Array.isArray(narrative.narrator) && narrative.narrator.length > 0);
  }
});
