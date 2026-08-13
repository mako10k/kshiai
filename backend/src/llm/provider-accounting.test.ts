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
const accounting = await import("./provider-accounting.js");
const { OpenAiCompatibleProvider } = await import("./openai-compatible.js");

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

describe("provider operation accounting", () => {
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
