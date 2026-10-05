// R: Verify physical provider attempt accounting and cutover permit outcomes.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-provider-accounting-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "provider-accounting.db");

const { closeDatabase, getDb } = await import("../db.js");
const { config } = await import("../config.js");
const cutoverControl = await import("../repositories/cutover-control.js");
const accounting = await import("./provider-accounting.js");
const { OpenAiCompatibleProvider } = await import("./openai-compatible.js");
const { PROVIDER_OPERATION_TAXONOMY_REVISION, providerOperationLayer } = await import("./provider-operation-taxonomy.js");
class AccountedLabelProvider extends OpenAiCompatibleProvider {
  requestOperation(label: string) {
    return this.chatJson("accounted fixture", "fixture", { tier: "fast", label, retry: "none" });
  }
}
getDb({ initializeSchema: true });

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

async function createRun(
  suffix: string,
  ceiling = 4,
): Promise<{ runId: string; battleId: string; observerUserId: string }> {
  const runId = `run-${suffix}`;
  const battleId = `battle-${suffix}`;
  const observerUserId = `observer-${suffix}`;
  await accounting.createProviderOperationRun({
    runId,
    observerUserId,
    approvedAttemptCeiling: ceiling,
    projectedOperations: { narration: 1, total: ceiling },
    createdAt: "2026-08-13T00:00:00.000Z",
  });
  await accounting.bindProviderOperationRun({ runId, observerUserId, battleId });
  getDb().prepare(
    `INSERT INTO battles
      (id, state_json, observation_run_id, side_a_user_id, side_a_character_id,
       side_b_character_id, created_at, updated_at)
     VALUES (?, '{}', ?, ?, 'character-a', 'character-b', ?, ?)`,
  ).run(
    battleId,
    runId,
    observerUserId,
    "2026-08-13T00:00:00.000Z",
    "2026-08-13T00:00:00.000Z",
  );
  return { runId, battleId, observerUserId };
}

async function withOpenCutover<T>(
  suffix: string,
  ownerUserId: string,
  action: (cutoverId: string) => Promise<T>,
): Promise<T> {
  const priorCutover = config.cutover;
  const cutoverId = `provider-cutover-${suffix}`;
  const artifactId = `provider-artifact-${suffix}`;
  await cutoverControl.initializeCutoverControl({
    phase: "closed",
    operationId: `initialize-${suffix}`,
    operatorId: "operator",
    policy: {
      cutoverId,
      artifactId,
      ownerUserId,
      ownerCandidates: [
        { attemptId: `${suffix}-candidate-a`, candidateDigest: "a".repeat(64) },
        { attemptId: `${suffix}-candidate-b`, candidateDigest: "b".repeat(64) },
      ],
      trialBindings: null,
      taskBattleIds: [],
      stageAcceptance: {
        health: null,
        postgres: null,
        email: null,
        google: null,
        ownership: null,
        r2: null,
        sse: null,
        directProtection: null,
      },
      productionReceipt: null,
    },
  });
  getDb().prepare(
    "UPDATE cutover_control_revisions SET phase = 'open' WHERE cutover_id = ?",
  ).run(cutoverId);
  config.cutover = { cutoverId, artifactId };
  try {
    return await action(cutoverId);
  } finally {
    config.cutover = priorCutover;
    getDb().prepare("DELETE FROM cutover_operation_permits WHERE cutover_id = ?")
      .run(cutoverId);
    getDb().prepare("DELETE FROM cutover_control_active WHERE cutover_id = ?")
      .run(cutoverId);
    getDb().prepare("DELETE FROM cutover_control_revisions WHERE cutover_id = ?")
      .run(cutoverId);
  }
}

function permitState(bindingOperationId: string): string | undefined {
  return (getDb().prepare(
    `SELECT state FROM cutover_operation_permits
      WHERE binding_operation_id = ? ORDER BY created_at DESC LIMIT 1`,
  ).get(bindingOperationId) as { state?: string } | undefined)?.state;
}

describe("provider operation accounting", () => {
  it("rejects a configured closed provider attempt before accounting or transport", async () => {
    const context = await createRun("cutover-closed", 1);
    const priorCutover = config.cutover;
    const cutoverId = "provider-cutover-closed";
    const artifactId = "provider-artifact-closed";
    config.cutover = { cutoverId, artifactId };
    await cutoverControl.initializeCutoverControl({
      phase: "closed",
      operationId: "initialize-provider-closed",
      operatorId: "operator",
      policy: {
        cutoverId,
        artifactId,
        ownerUserId: context.observerUserId,
        ownerCandidates: [
          { attemptId: "candidate-a", candidateDigest: "a".repeat(64) },
          { attemptId: "candidate-b", candidateDigest: "b".repeat(64) },
        ],
        trialBindings: null,
        taskBattleIds: [],
        stageAcceptance: {
          health: null,
          postgres: null,
          email: null,
          google: null,
          ownership: null,
          r2: null,
          sse: null,
          directProtection: null,
        },
        productionReceipt: null,
      },
    });
    let transportCalls = 0;
    try {
      await assert.rejects(
        accounting.withProviderOperationContext(context, () =>
          accounting.executeProviderOperationAttempt({
            logicalCallId: "closed-logical-call",
            attemptOrdinal: 1,
            operation: "narrateTurn",
            provider: "fake",
            model: "fake-fast",
            action: async () => {
              transportCalls += 1;
              return { usage: 1 };
            },
          })),
        /cutover_unavailable/,
      );
      assert.equal(transportCalls, 0);
      const summary = await accounting.readProviderOperationRun(context.runId);
      assert.equal(summary.reservedAttempts, 0);
      assert.deepEqual(summary.attempts, []);
    } finally {
      getDb().prepare("DELETE FROM cutover_operation_permits WHERE cutover_id = ?")
        .run(cutoverId);
      getDb().prepare("DELETE FROM cutover_control_active WHERE cutover_id = ?")
        .run(cutoverId);
      getDb().prepare("DELETE FROM cutover_control_revisions WHERE cutover_id = ?")
        .run(cutoverId);
      config.cutover = priorCutover;
    }
  });

  it("settles a known HTTP provider failure after failed-accounting readback", async () => {
    const context = await createRun("known-http-failure", 1);
    await withOpenCutover("known-http-failure", context.observerUserId, async () => {
      await assert.rejects(
        accounting.withProviderOperationContext(context, () =>
          accounting.executeProviderOperationAttempt({
            logicalCallId: "known-http-call",
            attemptOrdinal: 1,
            operation: "narrateTurn",
            provider: "fake",
            model: "fake-fast",
            action: async () => {
              throw Object.assign(new Error("service unavailable"), { status: 503 });
            },
          })),
        /service unavailable/,
      );
      assert.equal(
        permitState(`provider:${context.runId}:known-http-call:1`),
        "settled",
      );
      const summary = await accounting.readProviderOperationRun(context.runId);
      assert.deepEqual(summary.attempts.map((attempt) => attempt.status), ["failed"]);
    });
  });

  it("keeps an ambiguous timeout indeterminate after failed-accounting readback", async () => {
    const context = await createRun("ambiguous-timeout", 1);
    await withOpenCutover("ambiguous-timeout", context.observerUserId, async () => {
      await assert.rejects(
        accounting.withProviderOperationContext(context, () =>
          accounting.executeProviderOperationAttempt({
            logicalCallId: "timeout-call",
            attemptOrdinal: 1,
            operation: "narrateTurn",
            provider: "fake",
            model: "fake-fast",
            action: async () => {
              throw Object.assign(new Error("request timed out"), { name: "TimeoutError" });
            },
          })),
        /request timed out/,
      );
      assert.equal(
        permitState(`provider:${context.runId}:timeout-call:1`),
        "indeterminate",
      );
      const summary = await accounting.readProviderOperationRun(context.runId);
      assert.deepEqual(summary.attempts.map((attempt) => attempt.status), ["failed"]);
    });
  });

  it("retains accounting-pending when a successful response cannot be persisted", async () => {
    const context = await createRun("accounting-write-failure", 1);
    await withOpenCutover("accounting-write-failure", context.observerUserId, async () => {
      await assert.rejects(
        accounting.withProviderOperationContext(context, () =>
          accounting.executeProviderOperationAttempt({
            logicalCallId: "write-failure-call",
            attemptOrdinal: 1,
            operation: "narrateTurn",
            provider: "fake",
            model: "fake-fast",
            action: async () => {
              getDb().prepare(
                `DELETE FROM provider_operation_attempts
                  WHERE run_id = ? AND logical_call_id = ? AND attempt_ordinal = ?`,
              ).run(context.runId, "write-failure-call", 1);
              return { tokenCount: 11 };
            },
            usage: (value) => ({ tokenCount: value.tokenCount }),
          })),
        /PROVIDER_ATTEMPT_COMPLETION_CONFLICT/,
      );
      assert.equal(
        permitState(`provider:${context.runId}:write-failure-call:1`),
        "result-accounting-pending",
      );
    });
  });

  it("accounts for each retry at the OpenAI-compatible transport boundary", async () => {
    const context = await createRun("adapter-retry", 3);
    const provider = new OpenAiCompatibleProvider({
      name: "fake-provider",
      apiKey: "test-only",
      baseUrl: "https://example.invalid/v1",
      modelEngine: "fake-engine",
      modelFast: "fake-fast",
    }) as unknown as {
      client: {
        chat: {
          completions: {
            create(body: unknown, options: unknown): Promise<unknown>;
          };
        };
      };
      chatJson(
        system: string,
        user: string,
        opts: { tier: "fast"; label: string },
      ): Promise<unknown>;
    };
    let outboundCalls = 0;
    provider.client = {
      chat: {
        completions: {
          create: async () => {
            outboundCalls += 1;
            if (outboundCalls === 1) {
              throw Object.assign(new Error("rate limited"), {
                name: "RateLimitError",
                status: 429,
                headers: { "retry-after-ms": "0" },
              });
            }
            return {
              choices: [{ message: { content: "{\"ok\":true}" } }],
              usage: { total_tokens: 23 },
            };
          },
        },
      },
    };

    const result = await accounting.withBattleProviderOperationContext(
      context.battleId,
      () => provider.chatJson("system", "user", {
        tier: "fast",
        label: "narrateTurn",
      }),
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(outboundCalls, 2);
    const summary = await accounting.readProviderOperationRun(context.runId);
    assert.equal(summary.battleObservationRunId, context.runId);
    assert.equal(summary.reservedAttempts, 2);
    assert.deepEqual(
      summary.attempts.map((attempt) => [attempt.status, attempt.count, attempt.tokenCount]),
      [["failed", 1, null], ["succeeded", 1, 23]],
    );
  });

  it("reserves actual SDK awareness labels in v3 and retains historical operation layers", async (t) => {
    const expectedLayers = new Map([
      ["awareness-v5:subconscious", "deepPsyche"], ["awareness-v5:conscious", "characterExpression"],
      ["awareness-v5:narration-frozen", "narration"], ["awareness-v5:narration-batch", "narration"],
      ["advanceCharacterPsycheCompact", "deepPsyche"], ["advanceCharacterAgentCompact", "characterExpression"],
      ["prepareBattleEncounter", "encounter"], ["proposeHappening", "environment"], ["narrateTurn", "narration"], ["referee", "referee"],
    ]);
    const context = await createRun("awareness-labels", expectedLayers.size);
    let physicalCalls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      physicalCalls++;
      return Response.json({ model: "grok-test", choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
        usage: { prompt_tokens: 7, completion_tokens: 4, total_tokens: 11 } });
    });
    const provider = new AccountedLabelProvider({ name: "xai", apiKey: "test-only", baseUrl: "https://example.invalid/v1", modelEngine: "grok-test", modelFast: "grok-test" });
    const captured = await accounting.captureProviderHttpAttempts(() => accounting.withProviderOperationContext(context, async () => {
      for (const operation of expectedLayers.keys()) assert.deepEqual(await provider.requestOperation(operation), { ok: true });
    }));
    assert.equal(captured.httpAttempts, expectedLayers.size);
    assert.equal(physicalCalls, expectedLayers.size);
    const summary = await accounting.readProviderOperationRun(context.runId);
    assert.equal(summary.taxonomyRevision, "battle-provider-operations-v3");
    assert.equal(summary.taxonomyRevision, PROVIDER_OPERATION_TAXONOMY_REVISION);
    assert.equal(summary.reservedAttempts, expectedLayers.size);
    assert.equal(summary.attempts.length, expectedLayers.size);
    for (const attempt of summary.attempts) {
      assert.equal(attempt.layer, expectedLayers.get(attempt.operation));
      assert.equal(attempt.status, "succeeded");
      assert.equal(attempt.count, 1);
      assert.equal(attempt.tokenCount, 11);
    }
    await assert.rejects(accounting.withProviderOperationContext(context, () => provider.requestOperation("awareness-v5:not-registered")), /PROVIDER_OPERATION_UNCLASSIFIED/);
    await assert.rejects(accounting.withProviderOperationContext(context, () => provider.requestOperation("awareness-v5:conscious")), /PROVIDER_OPERATION_CEILING_EXHAUSTED/);
    assert.equal(physicalCalls, expectedLayers.size);
    assert.equal(providerOperationLayer("awareness-v5:not-registered"), null);
  });

  it("reads preserved v2 ledger identity and entries without relabeling history", async () => {
    const context = await createRun("historical-taxonomy", 1);
    await accounting.withProviderOperationContext(context, () => accounting.executeProviderOperationAttempt({
      logicalCallId: "historic-label", attemptOrdinal: 1, operation: "narrateTurn", provider: "fixture", model: "fixture",
      action: async () => ({ tokens: 13 }), usage: (result) => ({ tokenCount: result.tokens }),
    }));
    getDb().prepare("UPDATE provider_operation_runs SET taxonomy_revision = ? WHERE run_id = ?").run("battle-provider-operations-v2", context.runId);
    const history = await accounting.readProviderOperationRun(context.runId);
    assert.equal(history.taxonomyRevision, "battle-provider-operations-v2");
    assert.equal(history.reservedAttempts, 1);
    assert.deepEqual(history.attempts, [{ layer: "narration", operation: "narrateTurn", status: "succeeded", count: 1, tokenCount: 13, estimatedCostUsd: null }]);
  });

  it("records every fake physical retry and preserves unknown usage", async () => {
    const context = await createRun("retries", 3);
    let outboundCalls = 0;
    const captured = await accounting.captureProviderHttpAttempts(async () => {
      await accounting.withProviderOperationContext(context, async () => {
        await assert.rejects(
          accounting.executeProviderOperationAttempt({
            logicalCallId: "logical-retry",
            attemptOrdinal: 1,
            operation: "narrateTurn",
            provider: "fake",
            model: "fake-fast",
            action: async () => {
              outboundCalls += 1;
              throw new Error("temporary_failure");
            },
          }),
          /temporary_failure/,
        );
        const result = await accounting.executeProviderOperationAttempt({
          logicalCallId: "logical-retry",
          attemptOrdinal: 2,
          operation: "narrateTurn",
          provider: "fake",
          model: "fake-fast",
          action: async () => {
            outboundCalls += 1;
            return { value: "ok", tokens: 17 };
          },
          usage: (value) => ({ tokenCount: value.tokens }),
        });
        assert.equal(result.value, "ok");
      });
      return "done";
    });

    assert.equal(captured.value, "done");
    assert.equal(captured.httpAttempts, 2);
    assert.equal(outboundCalls, 2);
    const summary = await accounting.readProviderOperationRun(context.runId);
    assert.equal(summary.reservedAttempts, 2);
    assert.deepEqual(
      summary.attempts.map((attempt) => ({
        layer: attempt.layer,
        operation: attempt.operation,
        status: attempt.status,
        count: attempt.count,
        tokenCount: attempt.tokenCount,
        estimatedCostUsd: attempt.estimatedCostUsd,
      })),
      [
        {
          layer: "narration",
          operation: "narrateTurn",
          status: "failed",
          count: 1,
          tokenCount: null,
          estimatedCostUsd: null,
        },
        {
          layer: "narration",
          operation: "narrateTurn",
          status: "succeeded",
          count: 1,
          tokenCount: 17,
          estimatedCostUsd: null,
        },
      ],
    );
  });

  it("makes a repeated reservation idempotent without consuming the ceiling", async () => {
    const context = await createRun("idempotent", 2);
    const input = {
      context,
      logicalCallId: "logical-one",
      attemptOrdinal: 1,
      operation: "referee",
      provider: "fake",
      model: "fake-engine",
    };
    assert.equal((await accounting.reserveProviderOperationAttempt(input)).reserved, true);
    assert.equal((await accounting.reserveProviderOperationAttempt(input)).reserved, false);
    assert.equal(
      (await accounting.readProviderOperationRun(context.runId)).reservedAttempts,
      1,
    );
  });

  it("rejects the first attempt beyond the ceiling before fake transport I/O", async () => {
    const context = await createRun("ceiling", 1);
    let outboundCalls = 0;
    await accounting.withProviderOperationContext(context, async () => {
      await accounting.executeProviderOperationAttempt({
        logicalCallId: "logical-ceiling-a",
        attemptOrdinal: 1,
        operation: "prepareBattleEncounter",
        provider: "fake",
        model: "fake-fast",
        action: async () => {
          outboundCalls += 1;
          return "ok";
        },
      });
      await assert.rejects(
        accounting.executeProviderOperationAttempt({
          logicalCallId: "logical-ceiling-b",
          attemptOrdinal: 1,
          operation: "prepareBattleEncounter",
          provider: "fake",
          model: "fake-fast",
          action: async () => {
            outboundCalls += 1;
            return "unexpected";
          },
        }),
        /PROVIDER_OPERATION_CEILING_EXHAUSTED/,
      );
    });
    assert.equal(outboundCalls, 1);
  });

  it("fails closed for unknown operations, battle drift, inactive runs, and rebinding", async () => {
    const context = await createRun("closed", 4);
    await assert.rejects(
      accounting.reserveProviderOperationAttempt({
        context,
        logicalCallId: "logical-unknown",
        attemptOrdinal: 1,
        operation: "notRegistered",
        provider: "fake",
        model: "fake",
      }),
      /PROVIDER_OPERATION_UNCLASSIFIED/,
    );
    await assert.rejects(
      accounting.reserveProviderOperationAttempt({
        context: { ...context, battleId: "another-battle" },
        logicalCallId: "logical-mismatch",
        attemptOrdinal: 1,
        operation: "referee",
        provider: "fake",
        model: "fake",
      }),
      /PROVIDER_OPERATION_BATTLE_MISMATCH/,
    );
    await assert.rejects(
      accounting.bindProviderOperationRun({
        runId: context.runId,
        observerUserId: context.observerUserId,
        battleId: "another-battle",
      }),
      /PROVIDER_OPERATION_RUN_BINDING_REJECTED/,
    );
    await accounting.finalizeProviderOperationRun(context.runId, "failed");
    await assert.rejects(
      accounting.reserveProviderOperationAttempt({
        context,
        logicalCallId: "logical-inactive",
        attemptOrdinal: 1,
        operation: "referee",
        provider: "fake",
        model: "fake",
      }),
      /PROVIDER_OPERATION_RUN_INACTIVE/,
    );

    await accounting.createProviderOperationRun({
      runId: "run-collision",
      observerUserId: "observer-collision",
      approvedAttemptCeiling: 1,
      projectedOperations: { total: 1 },
    });
    getDb().prepare(
      `INSERT INTO battles
        (id, state_json, side_a_user_id, side_a_character_id,
         side_b_character_id, created_at, updated_at)
       VALUES ('battle-collision', '{}', 'ordinary', 'a', 'b', ?, ?)`,
    ).run("2026-08-13T00:00:00.000Z", "2026-08-13T00:00:00.000Z");
    await assert.rejects(
      accounting.bindProviderOperationRun({
        runId: "run-collision",
        observerUserId: "observer-collision",
        battleId: "battle-collision",
      }),
      /PROVIDER_OPERATION_BATTLE_BINDING_CONFLICT/,
    );
  });

  it("stores only bounded accounting metadata", () => {
    const columns = getDb().prepare("PRAGMA table_info(provider_operation_attempts)")
      .all() as Array<{ name: string }>;
    const names = columns.map((column) => column.name);
    assert.deepEqual(names, [
      "run_id",
      "logical_call_id",
      "attempt_ordinal",
      "battle_id",
      "layer",
      "operation",
      "provider",
      "model",
      "status",
      "token_count",
      "estimated_cost_usd",
      "elapsed_ms",
      "error_class",
      "started_at",
      "finished_at",
    ]);
    assert.equal(names.some((name) => /prompt|response|header|secret|character/i.test(name)), false);
  });
});
