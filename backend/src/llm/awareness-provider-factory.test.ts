// R: Verify explicit role configuration and zero-retry transport binding without provider calls.
import { AwarenessLongMeasurementPolicy, AwarenessFrozenNarrationSchema } from "@kshiai/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAwarenessProviderRoles, type AwarenessAdapterFactory, type AwarenessProviderConfiguration } from "./awareness-provider-factory.js";
import type { JsonRequestOpts } from "./openai-compatible.js";

const configured = (): AwarenessProviderConfiguration => ({
  openai: { apiKey: "openai-test-only", baseUrl: "https://openai-test.invalid/v1" },
  xai: { apiKey: "xai-test-only", baseUrl: "https://xai-test.invalid/v1", modelEngine: "grok-4.5", modelFast: "grok-4.3" },
});

describe("awareness provider role factory", () => {
  it("binds Luna and preserves configured Grok identities with no fallback or retries", async () => {
    const configs: Array<Parameters<AwarenessAdapterFactory>[0]> = [];
    const requests: Array<{ provider: string; options: JsonRequestOpts }> = [];
    const roles = createAwarenessProviderRoles(configured(), (config) => {
      configs.push(config);
      return {
        name: config.name, models: { engine: config.modelEngine, fast: config.modelFast },
        async requestJson(_system, _user, options) { requests.push({ provider: config.name, options }); return { accepted: true }; },
      };
    });
    assert.ok(roles);
    assert.equal(configs.length, 2);
    assert.equal(configs[0]?.modelFast, "gpt-6-luna");
    assert.equal(configs[0]?.supportsTemperature, false);
    assert.equal(configs.every((config) => config.fallbackOnError === false), true);
    assert.deepEqual(roles.adjudication.identity, { provider: "xai", engineModel: "grok-4.5", fastModel: "grok-4.3" });
    assert.equal(Object.isFrozen(roles.adjudication.identity), true);
    assert.equal(typeof roles.models.subconscious, "function");
    assert.equal(typeof roles.narration.narrateBatch, "function");
    await roles.adjudication.requestJson("裁定指示", "確定事実", {
      tier: "engine", timeoutMs: 10000, maxCompletionTokens: 1500, label: "test", responseFormat: { type: "json_object" },
    });
    assert.equal(requests[0]?.provider, "xai");
    assert.equal(requests[0]?.options.retry, "none");
    assert.equal(requests[0]?.options.maxCompletionTokens, 1500);
  });
  it("forwards an explicit bound measurement policy into the narration role", async () => {
    const requests: JsonRequestOpts[] = [];
    const source = AwarenessFrozenNarrationSchema.parse({ kind: "awareness-v5", phase: "combat", battleId: "battle", turnReceiptId: "receipt", turn: 1,
      system: "確定資料を実況", user: "姿勢を変えた", urgent: false, sourceSpeeches: [], recognitionRefs: [], judgmentVerdict: null });
    const roles = createAwarenessProviderRoles({ ...configured(), policy: AwarenessLongMeasurementPolicy }, (config) => ({
      name: config.name, models: { engine: config.modelEngine, fast: config.modelFast },
      async requestJson(_system, _user, options) { requests.push(options); return { receipts: [{ phase: "combat", battleId: "battle", turnReceiptId: "receipt", turn: 1,
        narrator: ["姿勢を変えた。", "互いに待つ。"], speeches: [], recognitionUpdates: [] }] }; },
    }));
    assert.ok(roles);
    await roles.narration.narrateFrozenBatch([source]);
    assert.equal(requests[0]?.timeoutMs, 60000); assert.equal(requests[0]?.maxCompletionTokens, 1200);
    assert.equal(requests[0]?.retry, "none");
  });
  it("exposes the configured Grok domain adapter without sending a request", () => {
    const roles = createAwarenessProviderRoles(configured());
    assert.ok(roles?.adjudicationProvider);
    assert.equal(roles.adjudicationProvider.name, "xai");
    assert.equal(typeof roles.adjudicationProvider.referee, "function");
  });
  it("leaves all roles unconfigured when either credential is absent", () => {
    for (const provider of ["openai", "xai"] as const) {
      const config = configured();
      config[provider].apiKey = undefined;
      let created = false;
      assert.equal(createAwarenessProviderRoles(config, () => { created = true; throw new Error("must not instantiate"); }), undefined);
      assert.equal(created, false);
    }
  });
  it("rejects non-Grok models and invalid transport URLs before adapter creation", () => {
    const config = configured();
    config.xai.modelEngine = "another-provider-model";
    assert.throws(() => createAwarenessProviderRoles(config, () => { throw new Error("must not instantiate"); }), /EXPLICIT_GROK/);
    const invalidUrl = configured();
    invalidUrl.openai.baseUrl = "file:///tmp/provider";
    assert.throws(() => createAwarenessProviderRoles(invalidUrl, () => { throw new Error("must not instantiate"); }), /INVALID_PROVIDER_URL/);
  });
});
