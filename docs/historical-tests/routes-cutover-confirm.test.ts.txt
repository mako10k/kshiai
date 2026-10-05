// R: Verify the real owner review and trial battle HTTP path across confirmation and immutable binding.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BattlePublicSchema, BattleStateSchema, defaultDialoguePipelineSettings } from "@kshiai/shared";

const directory = mkdtempSync(join(tmpdir(), "kshiai-cutover-confirm-"));
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.DIRECT_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.LLM_PROVIDER = "mock";
process.env.DATABASE_PATH = join(directory, "confirm.db");
process.env.CUTOVER_ID = "cutover-confirm-test";
process.env.CUTOVER_ARTIFACT_ID = "artifact-confirm-test";

const { closeDatabase, getDb, initializeDatabase, query } = await import("./db.js");
const auth = await import("./auth.js");
const { MockLlmProvider } = await import("./llm/mock.js");
const { prepareV3TrialCharacter } = await import("./repositories/local-v3-trial-characters.js");
const { createV3StageTrialCandidate, createV3StageTrialSource } = await import("./fixtures/neva-v3.js");
const { createV3StageTrialSecondCandidate, createV3StageTrialSecondSource } = await import("./fixtures/rio-v3.js");
const { getCurrentAssetGeneration } = await import("./repositories/asset-generations.js");
const { ensureSystemNarrationStyles } = await import("./repositories/narration-styles.js");
const settingsRepo = await import("./repositories/dialogue-pipeline-settings.js");
const { initializeCutoverControl, recordStoppedBarrier, transitionCutoverControl } = await import("./repositories/cutover-control.js");
const { cutoverRequestDigest } = await import("./services/cutover-admission.js");
const { buildRoutes } = await import("./routes.js");
const stageV3 = await import("./services/stage-v3-smoke.js");
const stageSmoke = await import("./services/cutover-stage-smoke.js");

getDb({ initializeSchema: true });
await initializeDatabase();

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

test("closed owner confirmation produces receipts and trial creates a strict V4 battle", async () => {
  const owner = await auth.registerUser("cutover-confirm-owner", "password-123");
  await ensureSystemNarrationStyles();
  const pipeline = defaultDialoguePipelineSettings();
  await settingsRepo.updateDialoguePipelineSettings({
    userId: owner.id,
    patch: { ...pipeline, schemaVersion: 3, contextProjectionMode: "compact", expectedRevision: 0 },
  });
  const token = await auth.createSession(owner.id);
  const headers = { Cookie: `kshiai_session=${token}`, "Content-Type": "application/json" };
  const candidates = [
    {
      characterId: "positive-neva",
      envelope: createV3StageTrialCandidate(),
      source: createV3StageTrialSource(),
    },
    {
      characterId: "positive-rio",
      envelope: createV3StageTrialSecondCandidate(),
      source: createV3StageTrialSecondSource(),
    },
  ] as const;
  const attempts = await Promise.all(candidates.map((candidate) => prepareV3TrialCharacter({
    ...candidate, ownerUserId: owner.id,
  })));
  await initializeCutoverControl({
    operationId: "confirm-init",
    operatorId: owner.id,
    phase: "closed",
    policy: {
      cutoverId: "cutover-confirm-test",
      artifactId: "artifact-confirm-test",
      ownerUserId: owner.id,
      ownerCandidates: attempts.map((attempt) => ({ attemptId: attempt.attemptId, candidateDigest: attempt.candidateDigest! })) as [
        { attemptId: string; candidateDigest: string }, { attemptId: string; candidateDigest: string },
      ],
      trialBindings: null,
      taskBattleIds: [],
      stageAcceptance: { health: null, postgres: null, email: null, google: null, ownership: null, r2: null, sse: null, directProtection: null },
      productionReceipt: null,
    },
  });
  const app = buildRoutes({ llm: new MockLlmProvider() });
  const generationIds: string[] = [];
  const permitIds: string[] = [];
  for (const attempt of attempts) {
    const reviewResponse = await app.request(`/api/character-drafts/${attempt.attemptId}`, { headers });
    assert.equal(reviewResponse.status, 200);
    const review = await reviewResponse.json() as { reviewConfirmOnly?: boolean; canEditCandidate?: boolean; sourceRetryAvailable?: boolean; candidateDigest?: string };
    assert.equal(review.reviewConfirmOnly, true);
    assert.equal(review.canEditCandidate, false);
    assert.equal(review.sourceRetryAvailable, false);
    assert.equal(review.candidateDigest, attempt.candidateDigest);
    const confirm = await app.request(`/api/characters/${attempt.attemptId}/confirm`, {
      method: "POST", headers, body: JSON.stringify({ candidateDigest: attempt.candidateDigest }),
    });
    assert.equal(confirm.status, 200);
    const generation = await getCurrentAssetGeneration("character", attempt.characterId);
    assert.ok(generation);
    generationIds.push(generation.generationId);
    const permit = await query<{ permit_id: string; state: string; result_digest: string | null }>(
      "SELECT permit_id, state, result_digest FROM cutover_operation_permits WHERE path = $1 ORDER BY created_at DESC LIMIT 1",
      [`/api/characters/${attempt.attemptId}/confirm`],
    );
    assert.equal(permit.rows[0]?.state, "settled");
    assert.ok(permit.rows[0]?.result_digest);
    permitIds.push(permit.rows[0]!.permit_id);
  }
  const stopped = await recordStoppedBarrier({
    cutoverId: "cutover-confirm-test", artifactId: "artifact-confirm-test", expectedRevision: 1,
    operationId: "confirm-stop", operatorId: owner.id, providerAccountingReceiptId: "confirm-stop-receipt",
  });
  assert.equal(stopped.kind, "recorded");
  assert.equal(generationIds.length, 2);
  assert.equal(permitIds.length, 2);
  const generationTuple = [generationIds[0], generationIds[1]] as [string, string];
  const permitTuple = [permitIds[0], permitIds[1]] as [string, string];
  const body = { myCharacterId: candidates[0].characterId, opponentCharacterId: candidates[1].characterId };
  const key = "positive-battle-key";
  const battleId = `btl_${cutoverRequestDigest({ userId: owner.id, scope: "battle-create", key, requestHash: cutoverRequestDigest(body) }).slice(0, 32)}`;
  const stageTarget = { apiBaseUrl: "http://stage.example.test", ownerUserId: owner.id,
    generationIds: generationTuple, body, idempotencyKey: key, advanceKey: "positive-stream-key" };
  const stageManifest = { runId: "actual-owner-stage", ownerUserId: owner.id, kind: "sse" as const,
    steps: stageV3.stageV3SmokeSteps(stageTarget) };
  const { actorId: _actorId, ...stageBinding } = stageSmoke.stageSmokeOperation(stageManifest);
  await transitionCutoverControl({
    cutoverId: "cutover-confirm-test", artifactId: "artifact-confirm-test", expectedRevision: 2,
    operationId: "confirm-trial", operatorId: owner.id, toPhase: "trial",
    trialBindings: {
      generationIds: generationTuple,
      ownerConfirmationReceiptIds: permitTuple,
      cutoverReadbackReceiptId: "confirm-readback", stoppedBarrierReceiptId: "confirm-stop-receipt",
      requests: [{ bindingOperationId: "confirm-battle", kind: "http", method: "POST", path: "/api/battles",
        requestDigest: cutoverRequestDigest({ method: "POST", path: "/api/battles", body, idempotencyKey: key }),
        battleId, maximumReservations: 1 },
        { bindingOperationId: "confirm-follow", kind: "http", method: "POST",
          path: `/api/battles/${battleId}/advance/stream`, battleId,
          requestDigest: cutoverRequestDigest({ method: "POST", path: `/api/battles/${battleId}/advance/stream`,
            body: null, idempotencyKey: stageTarget.advanceKey }), maximumReservations: 1 },
        { ...stageBinding, maximumReservations: 1 }],
    },
  });
  const stageResult = await stageV3.runStageV3Smoke(stageManifest, stageTarget, {
    request: async (url, init) => {
      const requestHeaders = new Headers(init.headers);
      for (const [name, value] of Object.entries(headers)) requestHeaders.set(name, value);
      return app.request(url, { ...init, headers: requestHeaders });
    },
    readState: async (id) => {
      const saved = await query<{ state_json: string }>("SELECT state_json FROM battles WHERE id=$1", [id]);
      return saved.rows[0] ? BattleStateSchema.parse(JSON.parse(saved.rows[0].state_json)) : null;
    },
  });
  assert.equal(stageResult.result.battleId, battleId);
  assert.ok(stageResult.result.eventCount > 0);
  const stored = await query<{ state_json: string }>("SELECT state_json FROM battles WHERE id = $1", [battleId]);
  const state = BattleStateSchema.parse(JSON.parse(stored.rows[0]!.state_json));
  assert.equal(state.assetManifest?.schemaVersion, 4);
  assert.equal(state.assetManifest?.characters?.a?.generationId, generationIds[0]);
  assert.equal(state.assetManifest?.characters?.b?.generationId, generationIds[1]);
});
