import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { semanticAuthoringExecutionPolicyV1 } from "../services/semantic-authoring/execution-policy.js";
import {
  createSemanticAuthoringHttpProviderV1,
  semanticAuthoringProviderConfigFromEnvironmentV1,
} from "./semantic-authoring-provider.js";

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
