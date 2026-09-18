import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { CharacterDefinitionV3Schema, CharacterAuthoringReviewSchema,
  SemanticAuthoringAcceptedV1Schema, CharacterDefinitionV2Schema,
  type CharacterProposalPayloadV1 } from "@kshiai/shared";
import { createCharacterSemanticAuthoringAdapterV3 } from "./semantic-authoring/adapters/character-v3.js";
import { createSemanticAuthoringHttpProviderV1 } from "../llm/semantic-authoring-provider.js";

const directory = mkdtempSync(join(tmpdir(), "kshiai-focused-consumer-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.AUTH_PROVIDER = "legacy";
process.env.LLM_PROVIDER = "mock";
const { query, closeDatabase } = await import("../db.js");
const { MockLlmProvider } = await import("../llm/mock.js");
const { buildRoutes } = await import("../routes.js");
const { processNextCharacterAuthoringJob, drainCharacterAuthoringJobs } = await import("./character-authoring-jobs.js");
const attempts = await import("../repositories/character-assets-v2.js");
const runs = await import("../repositories/semantic-authoring.js");
const generations = await import("../repositories/asset-generations.js");
const { buildImportedCharacterEnvelopeV2 } = await import("./character-authoring-service.js");

const scaffold = createCharacterSemanticAuthoringAdapterV3().buildBaseline(
  { kind: "create", naturalText: "fixture" }, "create").candidate;
const complete = CharacterDefinitionV3Schema.parse({
  ...scaffold, identity: { ...scaffold.identity, displayName: "灯" },
  psycheDisposition: { ...scaffold.psycheDisposition, coreNeeds: [{ id: "protect",
    description: { text: "守る", consumerTags: [], sourceSupportRefs: [] }, selfAwareness: "aware" }] },
  capabilities: { ...scaffold.capabilities, basicAction: { ...scaffold.capabilities.basicAction, name: "構え" } },
  relationshipSeeds: [{ id: "rival", target: { kind: "role", role: "rival" }, relationKinds: ["rival"],
    historySummary: null, defaultAddress: null, selfAwareness: "aware",
    dynamics: { trust: 0, affiliation: 0, fear: 0, competition: 0 }, priority: 50 }],
  speechPolicy: { ...scaffold.speechPolicy, register: "丁寧" },
  appearance: { ...scaffold.appearance, publicSummary: "赤い外套" },
  actionNorms: [{ id: "prefer-basic", when: { match: "all", clauses: [{ kind: "always", operator: "is", value: "true" }] },
    response: { disposition: "prefer", actionRefs: [scaffold.capabilities.basicAction.id], actionKinds: [], tacticTags: [] },
    priority: 50, force: "preference", exceptions: [], description: null }],
});
const migrationGuidance = {
  id: "prefer-basic-guidance",
  applicability: complete.actionNorms[0]!.when,
  statement: "大切な火を守る",
  priority: 50,
  force: "preference" as const,
  selfAwareness: "aware" as const,
  exceptions: [],
  description: null,
};

const contextSchema = z.object({
  mode: z.string(), source: z.record(z.unknown()),
  work: z.object({ kind: z.string(), cluster: z.string().optional() }),
  findings: z.array(z.tuple([z.string(), z.unknown()])),
  obligations: z.array(z.object({ obligationId: z.string() })),
  proposal: z.object({ runId: z.string(), workItemId: z.string(), baseCandidateRevision: z.number(),
    capabilitySessionId: z.string(), proposalSchemaIdentity: z.string() }),
});
type Context = z.infer<typeof contextSchema>;
let seen: Context[] = [];
let scopeSeen: string[] = [];
let scopeBehavior: "appearance" | "ambiguous" | "multi" | "invalid" = "appearance";
let behavior: "invalid" | "complete" | "repair" | "unavailable" = "invalid";
let endpoint = "";
let lastPreparedSize = 0;
let lastPreparedParts = "";
let preparedSizes: number[] = [];

function payload(context: Context): CharacterProposalPayloadV1 {
  if (context.work.kind === "skeleton") {
    const { mechanics: _mechanics, ...action } = complete.capabilities.basicAction;
    const ids = context.obligations.map((o) => o.obligationId);
    return { kind: "set_skeleton", operations: [
      ...(ids.includes("identity") ? [{ op: "replace_identity" as const, value: complete.identity }] : []),
      ...(ids.includes("psycheDisposition:coreNeeds") ? [{ op: "upsert_core_need" as const, value: complete.psycheDisposition.coreNeeds[0]! }] : []),
      ...(ids.some((id) => id.startsWith("capabilities:actions:")) ? [{ op: "set_action_semantics" as const, value: action }] : []),
      ...(ids.includes("relationshipSeeds") ? [{ op: "upsert_relationship_seed" as const, value: complete.relationshipSeeds[0]! }] : []),
    ] };
  }
  if (context.work.kind === "cluster") {
    if (context.work.cluster === "mechanics") return { kind: "complete_cluster", cluster: "mechanics",
      operations: context.mode === "migrate"
        ? JSON.stringify(context.source).includes('"actionNorms":[]')
          ? [{ op: "upsert_action_norm", value: complete.actionNorms[0]! }]
          : [{ op: "upsert_conscious_guidance", value: migrationGuidance }]
        : [{ op: "upsert_action_norm", value: complete.actionNorms[0]! }] };
    if (context.work.cluster === "relationship-expression") return {
      kind: "complete_cluster", cluster: "relationship-expression",
      operations: [{ op: "replace_speech_policy", value: complete.speechPolicy }],
    };
    return { kind: "complete_cluster", cluster: "appearance",
      operations: [{ op: "set_appearance_summary", value: "青い外套" }] };
  }
  const unresolved = context.obligations[0]?.obligationId;
  if (unresolved?.startsWith("source:")) return { kind: "classify_source_disposition",
    decisions: [{ sourceClaimId: unresolved.slice("source:".length), disposition: "transform",
      targetClaimIds: unresolved === "source:speechPolicy"
        ? ["speechPolicy"] : [`consciousGuidance:${migrationGuidance.id}`],
      rationale: "The awareness-gated source statement is represented as conscious guidance." }] };
  if (unresolved === "source-disposition") return { kind: "classify_source_disposition",
    decisions: [{ sourceClaimId: "identity.displayName", disposition: "preserve",
      targetClaimIds: ["identity"], rationale: "Fixture preserves identity." }] };
  const lens = unresolved === "lens:compiler" ? "compiler"
    : unresolved === "lens:disclosure" ? "disclosure" : "cross-reference";
  return { kind: "submit_lens_review", lens, findingIds: [unresolved ?? "identity"], verdict: "pass" };
}

const server = createServer(async (req, res) => {
  try {
    let text = "";
    for await (const part of req) text += String(part);
    const body = z.object({ model: z.string(), messages: z.array(z.object({ content: z.string() })) }).parse(JSON.parse(text));
    const contextValue: unknown = JSON.parse(body.messages[1]!.content);
    const scopeInput = z.object({ request: z.string() }).strict().safeParse(contextValue);
    if (scopeInput.success) {
      scopeSeen.push(scopeInput.data.request);
      const content = scopeBehavior === "appearance"
        ? { result: { kind: "resolved", clusters: ["appearance"],
          evidence: [{ sourceQuote: "外套を青に変更", clusters: ["appearance"] }] } }
        : scopeBehavior === "invalid"
          ? { result: { kind: "resolved", clusters: ["unrecognized"],
            evidence: [{ sourceQuote: "外套を青に変更", clusters: ["unrecognized"] }] } }
        : scopeBehavior === "multi"
          ? { result: { kind: "resolved", clusters: ["appearance", "mechanics"], evidence: [
            { sourceQuote: "外套を青に変更", clusters: ["appearance"] },
            { sourceQuote: "戦い方も変えて", clusters: ["mechanics"] }] } }
          : { result: { kind: "ambiguous", sourceQuote: "印象", unsafeReason: "対象が不明", alternatives: [
            { id: "appearance", clusters: ["appearance"], effect: "外見を変える" },
            { id: "mechanics", clusters: ["mechanics"], effect: "戦い方を変える" }] } };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ model: body.model, choices: [{ finish_reason: "stop",
        message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 } }));
      return;
    }
    const context = contextSchema.parse(contextValue);
    seen.push(context);
    // The durable reservation must exist BEFORE the real HTTP server sees a request.
    const receipts = await runs.listSemanticAuthoringRequestsV1(context.proposal.runId);
    assert.ok(receipts.length >= seen.filter((item) =>
      item.proposal.runId === context.proposal.runId).length);
    assert.equal(receipts.at(-1)?.outcome, null);
    if (behavior === "unavailable") { res.writeHead(503).end(); return; }
    const invalid = behavior === "invalid" || (behavior === "repair" && seen.length === 1);
    const proposalPayload = payload(context);
    const disposition = proposalPayload.kind === "classify_source_disposition"
      ? proposalPayload.decisions[0] : null;
    const speechTransform = context.mode === "migrate"
      && proposalPayload.kind === "complete_cluster"
      && proposalPayload.operations.some((operation) => operation.op === "replace_speech_policy");
    const proposalSourceClaimIds = disposition ? [disposition.sourceClaimId]
      : speechTransform ? ["speechPolicy"] : ["source-instruction"];
    const proposalProvenance = disposition && disposition.targetClaimIds.length > 0
      ? disposition.targetClaimIds.map((targetClaimId) => ({ targetClaimId,
          sourceClaimIds: [disposition.sourceClaimId], method: "derived" as const }))
      : speechTransform ? [{ targetClaimId: "speechPolicy", sourceClaimIds: ["speechPolicy"],
          method: "derived" as const }]
      : [{ targetClaimId: "identity", sourceClaimIds: proposalSourceClaimIds, method: "generated" as const }];
    const content = invalid ? "{bad-json" : JSON.stringify({
      ...context.proposal, proposalId: `proposal-${seen.length}`, sourceClaimIds: proposalSourceClaimIds,
      affectedObligationIds: context.obligations.map((o) => o.obligationId),
      declaredSemanticDependantIds: [], provenance: proposalProvenance,
      ownerExplanation: "Controlled HTTP fixture, not model-quality evidence.", uncertainty: [], payload: proposalPayload,
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ model: body.model, choices: [{ finish_reason: "stop", message: { content } }],
      usage: { prompt_tokens: 700, completion_tokens: 350 } }));
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});

function llm() {
  class NoLegacyGeneration extends MockLlmProvider {
    override async generateCharacter(): Promise<never> { throw new Error("LEGACY_ROUTE_CALLED"); }
  }
  const transport = createSemanticAuthoringHttpProviderV1({
    endpoint, model: "controlled", apiKey: "local-test-only", pricingIdentity: "controlled-prices-v1",
    inputMicroUsdPerToken: 1, outputMicroUsdPerToken: 2,
    transportPolicy: {
      identity: "controlled-transport-v1",
      routeIdentity: "controlled-loopback-route-v1",
      timeoutMs: 60_000,
      maxRecoveriesPerWorkItem: 0,
    },
    workerPolicy: {
      identity: "controlled-worker-v1",
      platformIdentity: "controlled-node-test-v1",
      leaseDurationMs: 60_000,
    },
  });
  return Object.assign(new NoLegacyGeneration(), { semanticAuthoringProvider: {
    ...transport, prepare(...args: Parameters<typeof transport.prepare>) {
      const prepared = transport.prepare(...args);
      lastPreparedSize = prepared.reservation.inputTokens;
      preparedSizes.push(lastPreparedSize);
      const parts = z.record(z.unknown()).parse(JSON.parse(args[0].context));
      lastPreparedParts = Object.entries(parts).map(([key, value]) =>
        `${key}=${Buffer.byteLength(JSON.stringify(value))}`).join(",")
        + `,workValue=${JSON.stringify(parts.work)}`;
      return prepared;
    },
  }, semanticAuthoringWorkerPolicy: {
    identity: "controlled-worker-v1",
    platformIdentity: "controlled-node-test-v1",
    leaseDurationMs: 60_000,
  } });
}

before(async () => {
  await query(`INSERT INTO users (id, username, password_hash, created_at) VALUES ('focused-owner', 'focused-owner', 'x', $1)`,
    [new Date().toISOString()]);
  await query(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('focused-session', 'focused-owner', $1, $2)`,
    [new Date().toISOString(), "2099-01-01T00:00:00.000Z"]);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  endpoint = `http://127.0.0.1:${address.port}/v1/chat/completions`;
});
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase(); rmSync(directory, { recursive: true, force: true });
});

describe("focused authoring through the real owner command and worker", () => {
  it("generates from source through HTTP, exposes the stored owner candidate, and does not activate it", async () => {
    seen = []; behavior = "complete";
    const provider = llm();
    const app = buildRoutes({ llm: provider });
    const response = await app.request("/api/characters/generate", { method: "POST",
      headers: { Cookie: "kshiai_session=focused-session", "Content-Type": "application/json", "Idempotency-Key": "focused-complete-create" },
      body: JSON.stringify({ prompt: "火を守る旅人" }) });
    assert.equal(response.status, 202);
    const accepted = z.object({ attemptId: z.string() }).parse(await response.json());
    await drainCharacterAuthoringJobs({ llm: provider, workerId: "focused-complete-worker" });
    const attempt = await attempts.getCharacterAuthoringAttempt(accepted.attemptId, "focused-owner");
    assert.equal(attempt?.status, "awaiting_owner_acceptance",
      `calls=${seen.length}, error=${attempt?.errorCode}, inputBound=${lastPreparedSize}, ${lastPreparedParts}`);
    const responseReview = await app.request(`/api/character-drafts/${accepted.attemptId}`, {
      headers: { Cookie: "kshiai_session=focused-session" } });
    assert.equal(responseReview.status, 200);
    const review = CharacterAuthoringReviewSchema.parse(await responseReview.json());
    assert.ok(review.semanticCandidateReview?.fields.some((f) => f.key === "identity" && f.candidate.includes("灯")));
    assert.equal(review.progress, null);
    assert.equal(review.canAccept, false, "structural completion alone is not activation readiness");
    const latest = await app.request("/api/character-drafts/latest", {
      headers: { Cookie: "kshiai_session=focused-session" } });
    assert.equal(z.object({ reviewAttemptId: z.string() }).parse(await latest.json()).reviewAttemptId, accepted.attemptId);
    const forcedAcceptance = await app.request(`/api/characters/${accepted.attemptId}/confirm`, {
      method: "POST", headers: { Cookie: "kshiai_session=focused-session" } });
    assert.equal(forcedAcceptance.status, 409);
    assert.equal(await generations.getCurrentAssetGeneration("character", review.characterId), null);
    assert.equal(seen.length, 8, "the final admitted call must still be applied");
  });

  it("routes a create HTTP command through bounded focused recovery and persists failure without legacy calls", async () => {
    seen = []; behavior = "invalid";
    const provider = llm();
    const app = buildRoutes({ llm: provider });
    const request = () => app.request("/api/characters/generate", { method: "POST",
      headers: { Cookie: "kshiai_session=focused-session", "Content-Type": "application/json", "Idempotency-Key": "focused-http-create" },
      body: JSON.stringify({ prompt: "火を守る旅人" }) });
    const response = await request();
    assert.equal(response.status, 202);
    const accepted = z.object({ attemptId: z.string() }).parse(await response.json());
    await drainCharacterAuthoringJobs({ llm: provider, workerId: "focused-http-worker" });
    const attempt = await attempts.getCharacterAuthoringAttempt(accepted.attemptId, "focused-owner");
    assert.equal(attempt?.status, "failed");
    assert.notEqual(attempt?.errorCode, "LEGACY_ROUTE_CALLED");
    assert.ok(seen.length >= 2 && seen.length <= 8, `calls=${seen.length}`);
    const stored = await runs.getSemanticAuthoringRunV1(seen[0]!.proposal.runId);
    assert.equal(stored?.status, "failed");
    assert.ok(stored.accounting.llmCalls >= 2);
    const calls = seen.length;
    await request();
    await drainCharacterAuthoringJobs({ llm: provider, workerId: "focused-replay-worker" });
    assert.equal(seen.length, calls, "terminal replay must not call the provider");
    assert.equal(attempt?.candidate, null);
    assert.equal(attempt?.resultGenerationId, null);
  });

  it("routes an appearance revision from the real owner HTTP command to a non-current review candidate", async () => {
    seen = []; scopeSeen = []; scopeBehavior = "appearance"; behavior = "repair";
    const now = new Date().toISOString();
    const characterId = "focused-revise-character";
    const fixture = await new MockLlmProvider().generateCharacter({ prompt: "revision fixture" });
    await query(`INSERT INTO characters (id, owner_user_id, sheet_json, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $4)`, [characterId, "focused-owner", JSON.stringify({
        ...fixture.sheet, id: characterId, ownerUserId: "focused-owner", createdAt: now, updatedAt: now,
      }), now]);
    const original = await generations.createAssetGeneration({ assetType: "character",
      assetId: characterId, schemaVersion: 3, content: { definition: complete } });
    await query(`INSERT INTO character_asset_states
      (character_id, compatibility_status, current_generation_id, active_attempt_id, reason_code, updated_at)
      VALUES ($1, 'ready', $2, NULL, NULL, $3)`, [characterId, original.generationId, now]);
    const provider = llm();
    const app = buildRoutes({ llm: provider, enableCharacterRevisionScopeTrial: true });
    const response = await app.request(`/api/characters/${characterId}/chat`, {
      method: "POST",
      headers: { Cookie: "kshiai_session=focused-session", "Content-Type": "application/json",
        "Idempotency-Key": "focused-revision-source" },
      body: JSON.stringify({ message: "外套を青に変更" }),
    });
    assert.equal(response.status, 202, await response.clone().text());
    const accepted = z.object({ attemptId: z.string() }).parse(await response.json());
    await drainCharacterAuthoringJobs({ llm: provider, workerId: "focused-revise-worker" });
    assert.deepEqual(scopeSeen, ["外套を青に変更"]);
    assert.equal(seen[0]?.source.instruction, "外套を青に変更");
    assert.equal(seen[0]?.work.cluster, "appearance");
    assert.equal(seen[1]?.proposal.baseCandidateRevision, 0, "invalid reply did not change the candidate");
    assert.ok(seen[1]?.findings.some(([key]) => key === "kernel:proposal"));
    const saved = await query<{ result_json: unknown }>(`SELECT p.result_json FROM character_focused_authoring_payloads p
      JOIN semantic_authoring_runs r ON r.run_id = p.run_id WHERE r.attempt_id = $1`, [accepted.attemptId]);
    const raw = saved.rows[0]?.result_json;
    const result = z.object({ kind: z.literal("ready_for_review"), finalCandidate: CharacterDefinitionV3Schema,
      sourceLedger: z.object({ provenance: z.array(z.object({ targetClaimId: z.string() })).min(1),
        sourceDispositions: z.array(z.object({ sourceClaimId: z.string() })) }) })
      .parse(typeof raw === "string" ? JSON.parse(raw) : raw);
    assert.equal(result.finalCandidate.appearance.publicSummary, "青い外套");
    assert.deepEqual(result.finalCandidate.combat, complete.combat);
    const reviewResponse = await app.request(`/api/character-drafts/${accepted.attemptId}`, {
      headers: { Cookie: "kshiai_session=focused-session" },
    });
    assert.equal(reviewResponse.status, 200);
    const review = CharacterAuthoringReviewSchema.parse(await reviewResponse.json());
    assert.equal(review.canAccept, false, "focused review remains separate from final acceptance");
    assert.ok(review.semanticCandidateReview?.fields.some((field) => field.key === "appearance"
      && field.source?.includes("赤い外套") && field.candidate.includes("青い外套")));
    assert.equal((await generations.getCurrentAssetGeneration("character", characterId))?.generationId,
      original.generationId, "review candidate does not move the immutable source pointer");
    assert.equal((await attempts.getCharacterAuthoringAttempt(accepted.attemptId, "focused-owner"))?.resultGenerationId, null);
    const registered = await query<{ run_id: string; resolved_source_json: unknown }>(
      `SELECT r.run_id, p.resolved_source_json FROM semantic_authoring_runs r
        JOIN character_focused_authoring_payloads p ON p.run_id = r.run_id
        WHERE r.attempt_id = $1`, [accepted.attemptId]);
    const runId = registered.rows[0]?.run_id;
    assert.ok(runId);
    assert.equal(z.object({ requestedCluster: z.literal("appearance") }).parse(
      typeof registered.rows[0]?.resolved_source_json === "string"
        ? JSON.parse(registered.rows[0].resolved_source_json) : registered.rows[0]?.resolved_source_json,
    ).requestedCluster, "appearance");
    const requests = await runs.listSemanticAuthoringRequestsV1(runId);
    assert.equal(requests.length, seen.length + 1, "scope shares the same recorded attempt");
    assert.equal(requests[0]?.outcome, "succeeded");
    assert.equal((await runs.getSemanticAuthoringRunV1(runId))?.accounting.llmCalls,
      requests.length, "scope request consumes the same cumulative ceiling");
  });

  it("does not generate a candidate for ambiguous, multi-area, or invalid scope", async () => {
    const fixture = await new MockLlmProvider().generateCharacter({ prompt: "scope refusal fixture" });
    for (const scopeCase of [
      { behavior: "ambiguous" as const, message: "印象を変えて" },
      { behavior: "multi" as const, message: "外套を青に変更、戦い方も変えて" },
      { behavior: "invalid" as const, message: "外套を青に変更" },
    ]) {
      seen = []; scopeSeen = []; scopeBehavior = scopeCase.behavior; behavior = "complete";
      const now = new Date().toISOString();
      const characterId = `focused-scope-${scopeCase.behavior}`;
      await query(`INSERT INTO characters (id, owner_user_id, sheet_json, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $4)`, [characterId, "focused-owner", JSON.stringify({
          ...fixture.sheet, id: characterId, ownerUserId: "focused-owner", createdAt: now, updatedAt: now,
        }), now]);
      const original = await generations.createAssetGeneration({ assetType: "character",
        assetId: characterId, schemaVersion: 3, content: { definition: complete } });
      await query(`INSERT INTO character_asset_states
        (character_id, compatibility_status, current_generation_id, active_attempt_id, reason_code, updated_at)
        VALUES ($1, 'ready', $2, NULL, NULL, $3)`, [characterId, original.generationId, now]);
      const provider = llm();
      const app = buildRoutes({ llm: provider, enableCharacterRevisionScopeTrial: true });
      const response = await app.request(`/api/characters/${characterId}/chat`, {
        method: "POST", headers: { Cookie: "kshiai_session=focused-session",
          "Content-Type": "application/json", "Idempotency-Key": `scope-${scopeCase.behavior}` },
        body: JSON.stringify({ message: scopeCase.message }),
      });
      assert.equal(response.status, 202, await response.clone().text());
      const accepted = z.object({ attemptId: z.string() }).parse(await response.json());
      await drainCharacterAuthoringJobs({ llm: provider, workerId: `scope-${scopeCase.behavior}-worker` });
      assert.deepEqual(scopeSeen, [scopeCase.message]);
      assert.equal(seen.length, 0, "rejected scope must not dispatch candidate generation");
      assert.equal((await attempts.getCharacterAuthoringAttempt(accepted.attemptId, "focused-owner"))?.status,
        "failed");
      assert.equal((await generations.getCurrentAssetGeneration("character", characterId))?.generationId,
        original.generationId);
      const run = await query<{ run_id: string }>(
        `SELECT run_id FROM semantic_authoring_runs WHERE attempt_id = $1`, [accepted.attemptId]);
      const runId = run.rows[0]?.run_id;
      assert.ok(runId);
      const requests = await runs.listSemanticAuthoringRequestsV1(runId);
      assert.equal(requests.length, 1);
      assert.equal(requests[0]?.outcome, "failed");
      assert.equal((await runs.getSemanticAuthoringRunV1(runId))?.accounting.llmCalls, 1);
    }
  });

  it("carries changed-role migration meaning through the real worker into a review candidate", async () => {
    seen = []; behavior = "complete";
    const now = new Date().toISOString();
    const fixture = await new MockLlmProvider().generateCharacter({ prompt: "migration source" });
    const characterId = "focused-migration-character";
    await query(`INSERT INTO characters (id, owner_user_id, sheet_json, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $4)`, [characterId, "focused-owner", JSON.stringify({
        ...fixture.sheet, id: characterId, ownerUserId: "focused-owner", createdAt: now, updatedAt: now,
      }), now]);
    const { consciousGuidance: _guidance, mechanicalConflictFallbacks: _fallbacks, ...stable } = complete;
    const source = CharacterDefinitionV2Schema.parse({ ...stable, schemaVersion: 2,
      actionNorms: complete.actionNorms.map((norm) => ({ ...norm, selfAwareness: "aware",
        response: { ...norm.response, statement: "大切な火を守る", fallbackActionRef: null } })) });
    const original = await generations.createAssetGeneration({ assetType: "character", assetId: characterId,
      schemaVersion: 2, content: { definition: source } });
    const started = await attempts.beginCharacterAuthoringAttempt({ ownerUserId: "focused-owner", kind: "upgrade",
      characterId, idempotencyKey: "focused-migration-source", requestDigest: "m".repeat(64),
      sourceText: "frozen migration", sourceDigest: "n".repeat(64),
      focused: { pricingIdentity: "controlled-prices-v1", source: { kind: "migrate", definition: source, capsule: null } } });
    const migrationOutcome = await processNextCharacterAuthoringJob({ llm: llm(), workerId: "focused-migration-worker" });
    const migrationAttempt = await attempts.getCharacterAuthoringAttempt(
      started.attempt.attemptId,
      "focused-owner",
    );
    assert.equal(migrationOutcome, "completed",
      `status=${migrationAttempt?.status}, error=${migrationAttempt?.errorCode}, inputBound=${lastPreparedSize}, parts=${lastPreparedParts}, seen=${JSON.stringify(seen)}`);
    const saved = await query<{ result_json: unknown; source_json: unknown }>(`SELECT p.result_json, p.source_json
      FROM character_focused_authoring_payloads p JOIN semantic_authoring_runs r ON r.run_id = p.run_id
      WHERE r.attempt_id = $1`, [started.attempt.attemptId]);
    const result = z.object({ kind: z.literal("ready_for_review"), finalCandidate: CharacterDefinitionV3Schema,
      sourceLedger: z.object({
      sourceDispositions: z.array(z.object({ sourceClaimId: z.string(), disposition: z.string() })),
      provenance: z.array(z.object({ targetClaimId: z.string() })),
    }) }).parse(typeof saved.rows[0]!.result_json === "string" ? JSON.parse(saved.rows[0]!.result_json) : saved.rows[0]!.result_json);
    assert.ok(result.sourceLedger.sourceDispositions.some((entry) => entry.sourceClaimId === "combat" && entry.disposition === "preserve"));
    assert.ok(result.sourceLedger.sourceDispositions.some((entry) =>
      entry.sourceClaimId === "actionNorms:prefer-basic:legacyMeaning" && entry.disposition === "transform"));
    assert.ok(result.sourceLedger.provenance.some((entry) => entry.targetClaimId === "actionNorms:prefer-basic"));
    assert.equal(result.finalCandidate.consciousGuidance[0]?.statement, "大切な火を守る");
    const retained = z.object({ definition: CharacterDefinitionV2Schema }).parse(typeof saved.rows[0]!.source_json === "string"
      ? JSON.parse(saved.rows[0]!.source_json) : saved.rows[0]!.source_json);
    assert.deepEqual(retained.definition, source);
    assert.ok(seen.some((context) => JSON.stringify(context.source).includes("大切な火を守る")));
    assert.ok(seen.every((context) => !JSON.stringify(context.source).includes('"combat":')));
    assert.equal((await generations.getCurrentAssetGeneration("character", characterId))?.generationId, original.generationId);
    assert.equal((await attempts.getCharacterAuthoringAttempt(started.attempt.attemptId, "focused-owner"))?.status,
      "awaiting_owner_acceptance");
  });

  it("routes an exact ready V2 upgrade command into focused migration without activating it", async () => {
    seen = []; preparedSizes = []; behavior = "complete";
    const now = new Date().toISOString();
    const generated = await new MockLlmProvider().generateCharacter({ prompt: "route migration source" });
    const characterId = "focused-migration-route-character";
    const sheet = { ...generated.sheet, id: characterId, ownerUserId: "focused-owner",
      createdAt: now, updatedAt: now };
    await query(`INSERT INTO characters (id, owner_user_id, sheet_json, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $4)`, [characterId, "focused-owner", JSON.stringify(sheet), now]);
    const envelope = buildImportedCharacterEnvelopeV2({ sheet, attemptId: "focused-route-import" });
    const original = await generations.createAssetGeneration({ assetType: "character", assetId: characterId,
      schemaVersion: 2, content: envelope });
    await query(`INSERT INTO character_asset_states
      (character_id, compatibility_status, current_generation_id, active_attempt_id, reason_code, updated_at)
      VALUES ($1, 'ready', $2, NULL, NULL, $3)`, [characterId, original.generationId, now]);
    const provider = llm();
    const app = buildRoutes({ llm: provider });
    const response = await app.request(`/api/characters/${characterId}/upgrade`, {
      method: "POST",
      headers: { Cookie: "kshiai_session=focused-session", "Idempotency-Key": "focused-migration-route" },
    });
    assert.equal(response.status, 202);
    const accepted = z.object({ attemptId: z.string() }).parse(await response.json());
    await drainCharacterAuthoringJobs({ llm: provider, workerId: "focused-migration-route-worker" });
    const attempt = await attempts.getCharacterAuthoringAttempt(accepted.attemptId, "focused-owner");
    const terminal = await query<{ result_json: unknown }>(`SELECT p.result_json
      FROM character_focused_authoring_payloads p JOIN semantic_authoring_runs r ON r.run_id = p.run_id
      WHERE r.attempt_id = $1`, [accepted.attemptId]);
    const terminalValue = typeof terminal.rows[0]?.result_json === "string"
      ? JSON.parse(terminal.rows[0].result_json) : terminal.rows[0]?.result_json;
    const terminalSummary = z.object({ kind: z.string(), receipt: z.object({
      category: z.string(), relevantFindingKeys: z.array(z.string()),
    }).optional() }).passthrough().safeParse(terminalValue);
    assert.equal(attempt?.status, "awaiting_owner_acceptance",
      `error=${attempt?.errorCode}, inputBounds=${JSON.stringify(preparedSizes)}, parts=${lastPreparedParts}, terminal=${JSON.stringify(terminalSummary.success ? terminalSummary.data : terminalValue)}, calls=${seen.length}`);
    const result = z.object({
      kind: z.literal("ready_for_review"),
      finalCandidate: CharacterDefinitionV3Schema,
      obligationCoverage: z.object({ resolvedRequiredObligationCount: z.number(), requiredObligationCount: z.number() }),
      sourceLedger: z.object({ sourceDispositions: z.array(z.object({
        sourceClaimId: z.string(), disposition: z.string(), targetClaimIds: z.array(z.string()),
      })) }),
    }).parse(terminalValue);
    assert.equal(result.obligationCoverage.resolvedRequiredObligationCount,
      result.obligationCoverage.requiredObligationCount);
    assert.ok(result.sourceLedger.sourceDispositions.some((entry) => entry.sourceClaimId === "speechPolicy"
      && entry.disposition === "transform" && entry.targetClaimIds.includes("speechPolicy")));
    assert.ok(result.finalCandidate.actionNorms.length > 0 && result.finalCandidate.relationshipSeeds.length > 0);
    const run = await query<{ mode: string; expected_current_generation_id: string }>(
      `SELECT mode, expected_current_generation_id FROM semantic_authoring_runs WHERE attempt_id = $1`,
      [accepted.attemptId]);
    assert.deepEqual(run.rows[0], { mode: "migrate", expected_current_generation_id: original.generationId });
    assert.ok(seen.length > 0, "the configured focused HTTP provider must receive migration work");
    assert.ok(seen.some((context) => context.work.kind === "ledger"
      && context.obligations.some((item) => item.obligationId === "source:speechPolicy")));
    assert.equal((await generations.getCurrentAssetGeneration("character", characterId))?.generationId,
      original.generationId);
    const confirm = await app.request(`/api/characters/${accepted.attemptId}/confirm`, {
      method: "POST", headers: { Cookie: "kshiai_session=focused-session" },
    });
    assert.equal(confirm.status, 409, "a focused V3 migration candidate cannot activate through the V2 command");
  });

  it("retries a failed owner command from the same source with a new attempt and idempotent replay", async () => {
    seen = []; behavior = "unavailable";
    const provider = llm();
    const app = buildRoutes({ llm: provider });
    const failed = await attempts.beginCharacterAuthoringAttempt({ ownerUserId: "focused-owner", kind: "create",
      idempotencyKey: "focused-retry-source", requestDigest: "a".repeat(64), sourceDigest: "b".repeat(64),
      sourceText: "火を守る旅人", focused: { pricingIdentity: "controlled-prices-v1",
        source: { kind: "create", naturalText: "火を守る旅人" } } });
    await drainCharacterAuthoringJobs({ llm: provider, workerId: "focused-failed-worker" });
    const retry = () => app.request(`/api/authoring/attempts/${failed.attempt.attemptId}/retries`, {
      method: "POST", headers: { Cookie: "kshiai_session=focused-session", "Content-Type": "application/json" },
      body: JSON.stringify({ commandId: "retry-owner-command" }) });
    seen = []; behavior = "invalid";
    const response = await retry();
    assert.equal(response.status, 202, await response.clone().text());
    const accepted = SemanticAuthoringAcceptedV1Schema.parse(await response.json());
    assert.notEqual(accepted.attemptId, failed.attempt.attemptId);
    assert.equal(accepted.kind, "create");
    await drainCharacterAuthoringJobs({ llm: provider, workerId: "focused-retry-worker" });
    assert.equal(seen[0]?.source.instruction, "火を守る旅人");
    assert.equal(seen[0]?.proposal.baseCandidateRevision, 0);
    const count = seen.length;
    const replay = SemanticAuthoringAcceptedV1Schema.parse(await (await retry()).json());
    assert.equal(replay.attemptId, accepted.attemptId);
    await drainCharacterAuthoringJobs({ llm: provider, workerId: "focused-retry-replay" });
    assert.equal(seen.length, count);
  });

  it("persists source-drift failure in both lifecycles before any dispatch", async () => {
    seen = []; behavior = "complete";
    const started = await attempts.beginCharacterAuthoringAttempt({ ownerUserId: "focused-owner", kind: "create",
      idempotencyKey: "focused-drift-source", requestDigest: "c".repeat(64), sourceDigest: "d".repeat(64),
      sourceText: "火を守る旅人", focused: { pricingIdentity: "controlled-prices-v1",
        source: { kind: "create", naturalText: "火を守る旅人" } } });
    await query(`UPDATE character_focused_authoring_payloads SET source_json = $2
      WHERE run_id IN (SELECT run_id FROM semantic_authoring_runs WHERE attempt_id = $1)`,
    [started.attempt.attemptId, JSON.stringify({ kind: "create", naturalText: "changed after freezing" })]);
    await drainCharacterAuthoringJobs({ llm: llm(), workerId: "focused-drift-worker" });
    assert.equal(seen.length, 0);
    assert.equal((await attempts.getCharacterAuthoringAttempt(started.attempt.attemptId, "focused-owner"))?.status, "failed");
    const runRow = await query<{ run_id: string }>(`SELECT run_id FROM semantic_authoring_runs WHERE attempt_id = $1`,
      [started.attempt.attemptId]);
    const run = await runs.getSemanticAuthoringRunV1(runRow.rows[0]!.run_id);
    assert.equal(run?.status, "failed");
    assert.equal(run.accounting.llmCalls, 0);
    assert.deepEqual(run.failureReceipt?.relevantFindingKeys, ["source_drift"]);
  });
});
