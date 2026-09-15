import assert from "node:assert/strict";
import { after, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "kshiai-json-accounting-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "accounting.db");
const { closeDatabase } = await import("../db.js");
const { OpenAiCompatibleProvider } = await import("./openai-compatible.js");
const { ProviderJsonSyntaxError } = await import("./provider-json.js");
const accounting = await import("./provider-accounting.js");

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

class JsonProvider extends OpenAiCompatibleProvider {
  request() {
    return this.chatJson("test", "test", { label: "generateCharacterDefinitionV2" });
  }
}

it("settles actual HTTP usage before malformed JSON rejection without transport retry", async (t) => {
  const context = { runId: "malformed-json-run", battleId: "malformed-json-battle" };
  await accounting.createProviderOperationRun({ runId: context.runId,
    observerUserId: "test-observer", approvedAttemptCeiling: 1, projectedOperations: {} });
  await accounting.bindProviderOperationRun({ ...context, observerUserId: "test-observer" });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ choices: [{ message: { content: '{"private source":,' } }],
      usage: { total_tokens: 29 } });
  });
  const provider = new JsonProvider({ name: "xai", apiKey: "test-only",
    baseUrl: "https://example.invalid/v1", modelEngine: "test", modelFast: "test" });
  await assert.rejects(accounting.withProviderOperationContext(context,
    () => provider.request()), ProviderJsonSyntaxError);
  assert.equal(calls, 1);
  const run = await accounting.readProviderOperationRun(context.runId);
  assert.equal(run.reservedAttempts, 1);
  assert.equal(run.attempts[0].tokenCount, 29);
  assert.equal(run.attempts[0].status, "succeeded", "HTTP success is not candidate acceptance");
});
