// R: Verify formal Neva/Rio authoring and the joined local battle user path.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { expect, test } from "@playwright/test";
import { serve } from "@hono/node-server";
import { z } from "zod";

test("formal Neva/Rio remain immutable through browser review, completion, replay and cutover", async ({ page, context }, testInfo) => {
  test.setTimeout(180_000);
  const { createServer } = await import("vite");
  const { default: react } = await import("@vitejs/plugin-react");
  const { CharacterAuthoringReviewSchema, CharacterGenerationEnvelopeV3Schema, defaultDialoguePipelineSettings } = await import("@kshiai/shared");
  // This worker owns a disposable database before importing any backend configuration.
  const directory = mkdtempSync(join(tmpdir(), "kshiai-vt103-"));
  process.env.DATABASE_URL = "";
  process.env.DATABASE_PATH = join(directory, "integration.db");
  process.env.AUTH_PROVIDER = "legacy";
  process.env.LLM_PROVIDER = "mock";
  process.env.COOKIE_SECURE = "false";
  process.env.NODE_ENV = "test";
  process.env.ORIGIN_SHARED_SECRET = "";
  process.env.NARRATION_TASK_QUEUE = "";
  process.env.AUTHORING_TASK_QUEUE = "";

  const { closeDatabase, query } = await import("../backend/src/db.js");
  const { MockLlmProvider } = await import("../backend/src/llm/mock.js");
  const { buildRoutes } = await import("../backend/src/routes.js");
  const { prepareV3TrialCharacter } = await import("../backend/src/repositories/local-v3-trial-characters.js");
  const assets = await import("../backend/src/repositories/asset-generations.js");
  const authoring = await import("../backend/src/repositories/character-assets-v2.js");
  const characters = await import("../backend/src/repositories/characters.js");
  const { getBattle } = await import("../backend/src/repositories/battles.js");
  const { advanceTurn } = await import("../backend/src/services/battle-service.js");
  const { requestDigest } = await import("../backend/src/services/distributed-guard.js");
  const { planBattleCutover, discardBattleCutover } = await import("../backend/src/repositories/battle-cutover.js");
  const { ensureSystemPresets } = await import("../backend/src/repositories/battlefields.js");
  const { ensureSystemNarrationStyles } = await import("../backend/src/repositories/narration-styles.js");
  const { updateDialoguePipelineSettings } = await import("../backend/src/repositories/dialogue-pipeline-settings.js");
  const { processNextNarration, createLlmNarrationGenerator } = await import("../backend/src/services/narration-worker.js");
  const neva = await import("../backend/src/fixtures/neva-v3.js");
  const rio = await import("../backend/src/fixtures/rio-v3.js");
  const { createConsciousFixture } = await import("../backend/src/services/conscious-agency.fixtures.js");

  const ids = z.object({ characters: z.array(z.object({ id: z.string() })) });
  const candidates = z.object({ candidates: z.array(z.object({ id: z.string() })) });
  const createdBody = z.object({ battle: z.object({ id: z.string() }) });
  const historyBody = z.object({ battles: z.array(z.object({ id: z.string() })) });

  // Seed this local harness; normal identity generation still uses crypto.
  const originalRandom = Math.random;
  let randomState = 103;
  Math.random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x100000000;
  };

  const ownerUserId = "vt103-local-owner";
  const llm = new MockLlmProvider();
  const app = buildRoutes({ llm });
  const apiServer = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
  if (!apiServer.listening) await once(apiServer, "listening");
  const address = apiServer.address();
  assert.ok(address && typeof address === "object");
  const apiOrigin = `http://127.0.0.1:${address.port}`;
  const frontend = await createServer({
    configFile: false, root: resolve("frontend"), envDir: directory,
    plugins: [react()],
    define: { "import.meta.env.VITE_SUPABASE_URL": '""', "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '""' },
    server: { host: "127.0.0.1", port: 0, proxy: { "/api": { target: apiOrigin, changeOrigin: true } } },
  });
  try {
    await frontend.listen();
    const frontendAddress = frontend.httpServer?.address();
    assert.ok(frontendAddress && typeof frontendAddress === "object");
    const origin = `http://127.0.0.1:${frontendAddress.port}`;
    // Refuse external browser requests; no API responses are substituted.
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return url.hostname === "127.0.0.1" || url.protocol === "data:"
        ? route.continue() : route.abort("blockedbyclient");
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await query("INSERT INTO users (id, username, password_hash, created_at) VALUES ($1, $2, 'test', $3)",
      [ownerUserId, ownerUserId, new Date().toISOString()]);
    await query("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)",
      ["vt103-local-session", ownerUserId, new Date().toISOString(), "2099-01-01T00:00:00.000Z"]);
    await context.addCookies([{ name: "kshiai_session", value: "vt103-local-session", url: origin }]);
    await ensureSystemPresets();
    await ensureSystemNarrationStyles();
    await updateDialoguePipelineSettings({ userId: ownerUserId, patch: {
      ...defaultDialoguePipelineSettings(), schemaVersion: 3,
      contextProjectionMode: "compact", expectedRevision: 0,
    } });
    const inputs = [
      { characterId: "vt103-neva", ownerUserId, envelope: neva.createV3StageTrialCandidate(), source: neva.createV3StageTrialSource() },
      { characterId: "vt103-rio", ownerUserId, envelope: rio.createV3StageTrialSecondCandidate(), source: rio.createV3StageTrialSecondSource() },
    ];
    const registrations = [];
    for (const input of inputs) {
      console.log("vt103: review", input.characterId);
      const attempt = await prepareV3TrialCharacter(input);
      assert.equal(await assets.getCurrentAssetGeneration("character", input.characterId), null);
      await page.goto(`${origin}/reviews/${attempt.attemptId}`);
      await expect(page.getByRole("heading", { name: "保存済みの構造化候補（V3）" })).toBeVisible();
      await expect(page.getByRole("button", { name: "確定して保存" })).toBeEnabled();
      const confirmation = page.waitForResponse((response) => response.url().endsWith(`/api/characters/${attempt.attemptId}/confirm`));
      await page.getByRole("button", { name: "確定して保存" }).click();
      const confirmed = await confirmation;
      assert.equal(confirmed.status(), 200, await confirmed.text());
      assert.deepEqual(confirmed.request().postDataJSON(), { candidateDigest: attempt.candidateDigest });
      await expect(page).toHaveURL(`${origin}/characters/${input.characterId}`);
      const generation = await assets.getCurrentAssetGeneration("character", input.characterId);
      assert.ok(generation);
      assert.equal(generation.contentDigest, attempt.candidateDigest);
      assert.equal(generation.schemaVersion, 3);
      registrations.push({ characterId: input.characterId, attemptId: attempt.attemptId,
        generationId: generation.generationId, digest: generation.contentDigest });
    }
    const own = await page.request.get(`${origin}/api/characters?selectable=true`);
    assert.equal(own.status(), 200);
    assert.deepEqual(new Set(ids.parse(await own.json()).characters.map((row) => row.id)), new Set(inputs.map((row) => row.characterId)));
    const opposing = await page.request.get(`${origin}/api/match/candidates`);
    assert.equal(opposing.status(), 200);
    assert.deepEqual(new Set(candidates.parse(await opposing.json()).candidates.map((row) => row.id)), new Set(inputs.map((row) => row.characterId)));
    console.log("vt103: select/create");
    await page.goto(`${origin}/match`);
    await page.locator("label.field").filter({ has: page.getByText("自分のキャラ", { exact: true }) }).locator("select").selectOption("vt103-neva");
    await page.locator("label.field").filter({ has: page.getByText("相手", { exact: true }) }).locator("select").selectOption("vt103-rio");
    const creating = page.waitForResponse((response) => response.url().endsWith("/api/battles") && response.request().method() === "POST");
    await page.getByRole("button", { name: "試合開始（方針はキャラが決める）", exact: true }).click();
    const created = await creating;
    assert.equal(created.status(), 200, await created.text());
    const battleId = createdBody.parse(await created.json()).battle.id;
    await expect(page).toHaveURL(`${origin}/battles/${battleId}`);
    // History resume opens paused before explicit transport checks.
    await page.getByRole("button", { name: "一時停止", exact: true }).click();
    await page.goto(`${origin}/battles/${battleId}?resume=1`);
    await expect(page.getByRole("button", { name: "再開する", exact: true })).toBeVisible();
    const bound = await getBattle(battleId);
    assert.ok(bound?.assetManifest?.schemaVersion === 4);
    for (const [index, side] of (["a", "b"] as const).entries()) {
      assert.equal(bound.assetManifest.characters[side].generationId, registrations[index]?.generationId);
      assert.equal(bound.assetManifest.characters[side].contentDigest, registrations[index]?.digest);
      const compiler = bound.assetManifest.characters[side].compilerInputsV4;
      assert.ok(compiler);
      assert.ok(compiler.actionNorms.norms.length > 0);
    }
    console.log("vt103: edit both current generations");
    const edits = [];
    for (const input of inputs) {
      const generation = await assets.getCurrentAssetGeneration("character", input.characterId);
      assert.ok(generation);
      const envelope = CharacterGenerationEnvelopeV3Schema.parse(generation.content);
      // Revise private conscious guidance, leaving the public projection unchanged.
      const guidance = envelope.definition.consciousGuidance[0];
      assert.ok(guidance);
      guidance.priority += 1;
      const sourceText = "ローカル結合試験: 意識上の指針の優先度を1上げる";
      const sourceDigest = assets.assetContentDigest(sourceText);
      const { attempt } = await authoring.beginCharacterAuthoringAttempt({
        characterId: input.characterId, ownerUserId, kind: "revision",
        idempotencyKey: `vt103-edit-${input.characterId}`, requestDigest: assets.assetContentDigest({ sourceText, characterId: input.characterId }), sourceText, sourceDigest,
      });
      envelope.provenance = { ...envelope.provenance, sourceKind: "revision_instruction", sourceDigest, attemptId: attempt.attemptId };
      await authoring.saveCharacterAuthoringCandidate({ attemptId: attempt.attemptId, ownerUserId, envelope,
        assistantMessage: sourceText });
      const reviewResponse = await page.request.get(`${origin}/api/character-drafts/${attempt.attemptId}`);
      assert.equal(reviewResponse.status(), 200);
      const review = CharacterAuthoringReviewSchema.parse(await reviewResponse.json());
      assert.equal(review.canAccept, true);
      const changed = review.semanticCandidateReview?.fields.find((field) => field.key === "definition.consciousGuidance");
      assert.ok(changed?.source);
      assert.notEqual(changed.source, changed.candidate);
      assert.equal(review.semanticCandidateReview?.fields.find((field) => field.key === "revisionSource")?.source, sourceText);
      await page.goto(`${origin}/reviews/${attempt.attemptId}`);
      await expect(page.getByText("今回の編集指示", { exact: true })).toBeVisible();
      const confirming = page.waitForResponse((response) => response.url().endsWith(`/api/characters/${attempt.attemptId}/confirm`));
      await page.getByRole("button", { name: "この内容で確定" }).click();
      const accepted = await confirming;
      assert.equal(accepted.status(), 200, await accepted.text());
      assert.deepEqual(accepted.request().postDataJSON(), { candidateDigest: review.candidateDigest });
      await expect(page).toHaveURL(`${origin}/characters/${input.characterId}`);
      const current = await assets.getCurrentAssetGeneration("character", input.characterId);
      assert.ok(current);
      assert.notEqual(current.generationId, generation.generationId);
      edits.push({ characterId: input.characterId, attemptId: attempt.attemptId, generationId: current.generationId, digest: current.contentDigest });
    }
    await page.goto(`${origin}/battles/${battleId}?resume=1`);
    await expect(page.getByRole("button", { name: "再開する", exact: true })).toBeVisible();
    for (const endpoint of ["advance", "advance/stream", "action"]) {
      const key = `vt103-${endpoint.replaceAll("/", "-")}`;
      const request = () => page.request.post(`${origin}/api/battles/${battleId}/${endpoint}`, { headers: { "Idempotency-Key": key } });
      const first = await request();
      assert.equal(first.status(), 200, await first.text());
      const state = await getBattle(battleId);
      assert.ok(state);
      assert.deepEqual(state.assetManifest, bound.assetManifest);
      const replay = await request();
      assert.equal(replay.status(), 200, await replay.text());
      assert.equal((await getBattle(battleId))?.battleRevision, state.battleRevision);
      const operationId = state.advanceOperation?.operationId;
      assert.ok(operationId);
      if (endpoint !== "action") assert.equal(operationId, requestDigest({ userId: ownerUserId, scope: `battle-advance:${battleId}`, key }));
      await advanceTurn({ userId: ownerUserId, battleId, operationId, llm });
      const stateReplay = await getBattle(battleId);
      assert.equal(stateReplay?.battleRevision, state.battleRevision);
      assert.deepEqual(stateReplay?.assetManifest, bound.assetManifest);
    }
    console.log("vt103: complete battle");
    let finalState = await getBattle(battleId);
    assert.ok(finalState);
    let advances = 0;
    while ((finalState.status !== "finished" || finalState.aftermathPending) && advances < 120) {
      const response = await page.request.post(`${origin}/api/battles/${battleId}/advance`, { headers: { "Idempotency-Key": `vt103-complete-${advances}` } });
      assert.equal(response.status(), 200, await response.text());
      const next = await getBattle(battleId);
      assert.ok(next);
      assert.deepEqual(next.assetManifest, bound.assetManifest);
      finalState = next;
      advances += 1;
    }
    assert.equal(finalState.status, "finished");
    assert.equal(finalState.aftermathPending, false);
    console.log("vt103: drain narration", finalState.turn);
    const generator = createLlmNarrationGenerator(llm);
    const entries = await query<{ receipt_id: string; input_json: string; input_digest: string }>("SELECT receipt_id, input_json, input_digest FROM battle_narration_entries WHERE battle_id = $1 ORDER BY sequence", [battleId]);
    assert.ok(entries.rowCount > 0);
    // The worker receives each exact committed frozen request, not a rebuilt current-character request.
    for (const row of entries.rows) {
      const receipt = finalState.phaseReceipts?.find((value) => value.id === row.receipt_id);
      assert.ok(receipt);
      const request: unknown = JSON.parse(row.input_json);
      assert.deepEqual(request, receipt.narrationInput);
      assert.equal(row.input_digest, receipt.narrationInputDigest);
    }
    for (let index = 0; index < entries.rowCount; index += 1) {
      assert.equal(await processNextNarration({ battleId, ownerId: "vt103-local-worker", generator: async (raw, workerContext) => {
        assert.ok(entries.rows.some((row) => row.input_json === JSON.stringify(raw)));
        return generator(raw, workerContext);
      } }), "completed");
    }
    await page.reload();
    await expect(page.getByRole("heading", { name: "結果", exact: true })).toBeVisible();
    const resultText = finalState.winnerSide === "draw" ? "引き分け"
      : `${finalState.winnerSide === "a" ? bound.sideA.displayName : bound.sideB.displayName} の勝利`;
    await expect(page.getByText(resultText, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("neva-rio-finished.png"), fullPage: true });
    await page.reload();
    await expect(page.getByText(resultText, { exact: true })).toBeVisible();
    const finishedBefore = await getBattle(battleId);

    console.log("vt103: finished visible; cutover readback");
    // V2 fixtures are management-only: both mixed directions and V2-by-V2 fail.
    const legacy = createConsciousFixture();
    await characters.saveSheet({ ...legacy.mine, id: "vt103-v2-a", ownerUserId });
    await characters.saveSheet({ ...legacy.opp, id: "vt103-v2-b", ownerUserId, visibility: "public" });
    for (const [mine, opponent] of [["vt103-v2-a", "vt103-v2-b"], ["vt103-neva", "vt103-v2-b"], ["vt103-v2-a", "vt103-rio"]]) {
      const response = await page.request.post(`${origin}/api/battles`, { headers: { "Idempotency-Key": `vt103-reject-${mine}-${opponent}` }, data: { myCharacterId: mine, opponentCharacterId: opponent } });
      assert.equal(response.status(), 409, await response.text());
    }
    const unfinishedRequest = { headers: { "Idempotency-Key": "vt103-unfinished-create" }, data: { myCharacterId: "vt103-neva", opponentCharacterId: "vt103-rio" } };
    const unfinished = await page.request.post(`${origin}/api/battles`, unfinishedRequest);
    assert.equal(unfinished.status(), 200, await unfinished.text());
    const discardedId = createdBody.parse(await unfinished.json()).battle.id;
    for (const endpoint of ["advance", "advance/stream", "action"]) {
      const response = await page.request.post(`${origin}/api/battles/${discardedId}/${endpoint}`, { headers: { "Idempotency-Key": `vt103-old-${endpoint.replaceAll("/", "-")}` } });
      assert.equal(response.status(), 200, await response.text());
    }
    const frozenState = await getBattle(discardedId);
    assert.ok(frozenState?.advanceOperation?.operationId);
    const plan = await planBattleCutover({ cutoverId: "vt103-local-cutover", cutoverAt: new Date(Date.now() + 1_000).toISOString() });
    assert.deepEqual(plan.targets.map((row) => row.id), [discardedId]);
    assert.deepEqual(plan.finished.map((row) => row.id), [battleId]);
    const discarded = await discardBattleCutover({ plan, operatorId: ownerUserId, stopped: true, recoverySnapshotIdentity: "disposable-local-test-fixture" });
    assert.equal(discarded.kind, "discarded");
    assert.equal(await getBattle(discardedId), null);
    for (const suffix of ["", "/narration", "/narration/events", "/narration/follow", "/narration/receipt"]) {
      const response = await page.request.get(`${origin}/api/battles/${discardedId}${suffix}`);
      assert.equal(response.status(), 404, await response.text());
    }
    for (const endpoint of ["advance", "advance/stream", "action"]) {
      const response = await page.request.post(`${origin}/api/battles/${discardedId}/${endpoint}`, { headers: { "Idempotency-Key": `vt103-old-${endpoint.replaceAll("/", "-")}` } });
      assert.equal(response.status(), 404, await response.text());
    }
    assert.equal((await page.request.post(`${origin}/api/battles`, unfinishedRequest)).status(), 404);
    await assert.rejects(advanceTurn({ userId: ownerUserId, battleId: discardedId, operationId: frozenState.advanceOperation?.operationId, llm }), /BATTLE_NOT_FOUND/);
    assert.equal(await processNextNarration({ battleId: discardedId, ownerId: "vt103-late-worker", generator: async () => { throw new Error("UNEXPECTED_PROVIDER"); } }), "acknowledged");
    assert.deepEqual(await getBattle(battleId), finishedBefore);
    const history = historyBody.parse(await (await page.request.get(`${origin}/api/battles`)).json());
    assert.ok(history.battles.some((row) => row.id === battleId));
    assert.equal(history.battles.some((row) => row.id === discardedId), false);
    const characterHistory = historyBody.parse(await (await page.request.get(`${origin}/api/characters/vt103-neva/battles`)).json());
    assert.ok(characterHistory.battles.some((row) => row.id === battleId));
    await page.reload();
    await expect(page.getByText(resultText, { exact: true })).toBeVisible();
    assert.deepEqual(pageErrors, []);
    const evidence = { schema: "kshiai/vt103-local-integration/v1", seed: 103, provider: "MockLlmProvider", database: "disposable SQLite", registrations, edits,
      battleId, turn: finalState.turn, status: finalState.status, aftermathPending: finalState.aftermathPending,
      winnerSide: finalState.winnerSide, resultText, advances, narrationEntries: entries.rowCount,
      cutover: plan, discarded, finishedRetained: true, browserErrors: pageErrors };
    writeFileSync(testInfo.outputPath("vt103-result.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await frontend.close();
    if ("closeAllConnections" in apiServer) apiServer.closeAllConnections();
    await new Promise<void>((resolveClose, rejectClose) => apiServer.close((error) => error ? rejectClose(error) : resolveClose()));
    await closeDatabase();
    Math.random = originalRandom;
    rmSync(directory, { recursive: true, force: true });
  }
});
