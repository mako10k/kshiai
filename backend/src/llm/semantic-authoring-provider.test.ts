import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { characterAuthoringExecutionPolicyV2, frozenCharacterAuthoringExecutionPolicyV1,
  semanticAuthoringExecutionPolicyV1 } from "../services/semantic-authoring/execution-policy.js";
import {
  createSemanticAuthoringHttpProviderV1,
  semanticAuthoringProviderConfigFromEnvironmentV1,
} from "./semantic-authoring-provider.js";

import { admitSemanticAuthoringReservation } from "../services/semantic-authoring/accounting.js";

const transportPolicy = {
  identity: "controlled-transport-v1",
  routeIdentity: "controlled-route-v1",
  timeoutMs: 12_345,
  maxRecoveriesPerWorkItem: 0 as const,
};
const workerPolicy = {
  identity: "controlled-worker-v1",
  platformIdentity: "controlled-node-test-v1",
  leaseDurationMs: 30_000,
};

describe("semantic authoring transport policy", () => {
  it("requires explicit time-policy identity and values when the route is selected", () => {
    assert.throws(
      () => semanticAuthoringProviderConfigFromEnvironmentV1({
        SEMANTIC_AUTHORING_POLICY: "semantic_authoring_policy_v1",
        SEMANTIC_AUTHORING_ENDPOINT: "http://127.0.0.1:3999/v1/chat/completions",
        SEMANTIC_AUTHORING_MODEL: "controlled",
        SEMANTIC_AUTHORING_API_KEY: "local-test-only",
        SEMANTIC_AUTHORING_PRICING_IDENTITY: "controlled-prices-v1",
        SEMANTIC_AUTHORING_INPUT_MICRO_USD_PER_TOKEN: "1",
        SEMANTIC_AUTHORING_OUTPUT_MICRO_USD_PER_TOKEN: "1",
      }),
      /SEMANTIC_AUTHORING_TRANSPORT_POLICY_IDENTITY_REQUIRED/,
    );
    assert.equal(semanticAuthoringProviderConfigFromEnvironmentV1({
      SEMANTIC_AUTHORING_POLICY: "off",
    }), undefined);
  });

  it("uses the explicitly supplied provider timeout without a whole-attempt deadline", () => {
    const provider = createSemanticAuthoringHttpProviderV1({
      endpoint: "http://127.0.0.1:3999/v1/chat/completions",
      model: "controlled",
      apiKey: "local-test-only",
      pricingIdentity: "controlled-prices-v1",
      inputMicroUsdPerToken: 1,
      outputMicroUsdPerToken: 1,
      transportPolicy,
      workerPolicy,
    });
    const request = provider.prepare(
      { system: "focused", context: "{}" },
      "request-1",
      semanticAuthoringExecutionPolicyV1("controlled-prices-v1"),
    );
    assert.equal(request.reservation.elapsedMs, transportPolicy.timeoutMs);
    assert.equal(provider.transportPolicy.identity, transportPolicy.identity);
  });

  it("fails closed when an unimplemented same-run recovery policy is selected", () => {
    assert.throws(() => createSemanticAuthoringHttpProviderV1({
      endpoint: "http://127.0.0.1:3999/v1/chat/completions",
      model: "controlled",
      apiKey: "local-test-only",
      pricingIdentity: "controlled-prices-v1",
      inputMicroUsdPerToken: 1,
      outputMicroUsdPerToken: 1,
      transportPolicy: { ...transportPolicy, maxRecoveriesPerWorkItem: 1 },
      workerPolicy,
    }), /SEMANTIC_AUTHORING_TRANSPORT_RECOVERY_NOT_IMPLEMENTED/);
  });
});


describe("frozen character authoring call budget", () => {
  const identities = { pricingIdentity: "approved-prices", tokenEstimatorIdentity: "approved-estimator" };
  const accounting = { llmCalls: 8, countedSteps: 0, elapsedMs: 0,
    inputTokens: 0, outputTokens: 0, costMicroUsd: 0 };
  const reservation = { requestId: "next-call", inputTokens: 1, inputBytes: 1,
    outputTokens: 1, outputBytes: 1, costMicroUsd: 1, elapsedMs: 1 };

  it("allows profile and claim calls only for newly registered create/revise policies", () => {
    for (const mode of ["create", "revise"] as const) {
      const policy = characterAuthoringExecutionPolicyV2(mode, identities.pricingIdentity,
        identities.tokenEstimatorIdentity);
      assert.equal(policy.identity, "character_complete_review_policy_v2");
      assert.deepEqual(admitSemanticAuthoringReservation(policy, accounting, [], reservation), { admitted: true });
      assert.deepEqual(admitSemanticAuthoringReservation(policy, { ...accounting, llmCalls: 9 }, [], reservation),
        { admitted: true });
      assert.deepEqual(admitSemanticAuthoringReservation(policy, { ...accounting, llmCalls: 10 }, [], reservation),
        { admitted: false, exhausted: "llm_calls" });
    }
    const migration = characterAuthoringExecutionPolicyV2("migrate", identities.pricingIdentity);
    assert.deepEqual(admitSemanticAuthoringReservation(migration, accounting, [], reservation),
      { admitted: false, exhausted: "llm_calls" });
  });

  it("restores old create/revise runs at eight calls and preserves their accounting identities", () => {
    for (const mode of ["create", "revise", "migrate"] as const) {
      const restored = frozenCharacterAuthoringExecutionPolicyV1({ ...identities, mode,
        policyIdentity: "semantic_authoring_policy_v1" });
      assert.equal(restored.maxLlmCalls, 8);
      assert.equal(restored.pricingIdentity, identities.pricingIdentity);
      assert.equal(restored.tokenEstimatorIdentity, identities.tokenEstimatorIdentity);
      assert.deepEqual(admitSemanticAuthoringReservation(restored, accounting, [], reservation),
        { admitted: false, exhausted: "llm_calls" });
    }
    const restored = frozenCharacterAuthoringExecutionPolicyV1({ ...identities, mode: "revise",
      policyIdentity: "character_complete_review_policy_v2" });
    assert.equal(restored.maxLlmCalls, 10);
  });

  it("retains cumulative token and money limits despite the two additional calls", () => {
    const previous = semanticAuthoringExecutionPolicyV1(identities.pricingIdentity, identities.tokenEstimatorIdentity);
    const current = characterAuthoringExecutionPolicyV2("create", identities.pricingIdentity, identities.tokenEstimatorIdentity);
    const { identity: _oldIdentity, maxLlmCalls: _oldCalls, ...previousLimits } = previous;
    const { identity: _newIdentity, maxLlmCalls: _newCalls, ...currentLimits } = current;
    assert.deepEqual(currentLimits, previousLimits);
    for (const [field, exhausted, maximum] of [
      ["inputTokens", "input_tokens", current.maxCumulativeInputTokens],
      ["outputTokens", "output_tokens", current.maxCumulativeOutputTokens],
      ["costMicroUsd", "cost", current.maxCostMicroUsd],
    ] as const) {
      assert.deepEqual(admitSemanticAuthoringReservation(current, { ...accounting, [field]: maximum }, [], reservation),
        { admitted: false, exhausted });
    }
  });

  it("rejects unknown policy identities and a ten-call migration instead of choosing a default", () => {
    assert.throws(() => frozenCharacterAuthoringExecutionPolicyV1({ ...identities, mode: "create",
      policyIdentity: "unknown" }), /FOCUSED_CHARACTER_POLICY_INVALID/);
    assert.throws(() => frozenCharacterAuthoringExecutionPolicyV1({ ...identities, mode: "migrate",
      policyIdentity: "character_complete_review_policy_v2" }), /FOCUSED_CHARACTER_POLICY_INVALID/);
  });
});
