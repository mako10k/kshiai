import { z } from "zod";
import type { ProviderTransportPolicyV1, WorkerExecutionPolicyV1 } from "@kshiai/shared";
import type { FocusedProviderTransportV1 } from "../services/semantic-authoring/execution.js";

const completionSchema = z.object({
  model: z.string(),
  choices: z.array(z.object({
    finish_reason: z.string(),
    message: z.object({ content: z.string().nullable(), refusal: z.string().nullable().optional() }),
  })).length(1),
  usage: z.unknown().optional(),
});

const usageSchema = z.object({ prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative() });

export type SemanticAuthoringProviderConfigV1 = Readonly<{
  endpoint: string;
  model: string;
  apiKey: string;
  pricingIdentity: string;
  // Frozen caller-approved conservative prices; no ambient model or fallback.
  inputMicroUsdPerToken: number;
  outputMicroUsdPerToken: number;
  transportPolicy: ProviderTransportPolicyV1;
  workerPolicy: WorkerExecutionPolicyV1;
}>;

/** Explicit startup selection. Merely configuring another LLM never enables this route. */
export function semanticAuthoringProviderConfigFromEnvironmentV1(
  env: NodeJS.ProcessEnv = process.env,
): SemanticAuthoringProviderConfigV1 | undefined {
  if (!env.SEMANTIC_AUTHORING_POLICY || env.SEMANTIC_AUTHORING_POLICY === "off") return undefined;
  if (env.SEMANTIC_AUTHORING_POLICY !== "semantic_authoring_policy_v1") {
    throw new Error("SEMANTIC_AUTHORING_POLICY_INVALID");
  }
  const required = (key: string) => {
    const value = env[key];
    if (!value?.trim()) throw new Error(`${key}_REQUIRED`);
    return value;
  };
  return {
    endpoint: required("SEMANTIC_AUTHORING_ENDPOINT"), model: required("SEMANTIC_AUTHORING_MODEL"),
    apiKey: required("SEMANTIC_AUTHORING_API_KEY"), pricingIdentity: required("SEMANTIC_AUTHORING_PRICING_IDENTITY"),
    inputMicroUsdPerToken: Number(required("SEMANTIC_AUTHORING_INPUT_MICRO_USD_PER_TOKEN")),
    outputMicroUsdPerToken: Number(required("SEMANTIC_AUTHORING_OUTPUT_MICRO_USD_PER_TOKEN")),
    transportPolicy: {
      identity: required("SEMANTIC_AUTHORING_TRANSPORT_POLICY_IDENTITY"),
      routeIdentity: required("SEMANTIC_AUTHORING_TRANSPORT_ROUTE_IDENTITY"),
      timeoutMs: Number(required("SEMANTIC_AUTHORING_TRANSPORT_TIMEOUT_MS")),
      maxRecoveriesPerWorkItem: Number(required("SEMANTIC_AUTHORING_TRANSPORT_MAX_RECOVERIES")) as 0 | 1,
    },
    workerPolicy: {
      identity: required("SEMANTIC_AUTHORING_WORKER_POLICY_IDENTITY"),
      platformIdentity: required("SEMANTIC_AUTHORING_WORKER_PLATFORM_IDENTITY"),
      leaseDurationMs: Number(required("SEMANTIC_AUTHORING_WORKER_LEASE_MS")),
    },
  };
}

/** No SDK retry, redirects, fallback, schema coercion, or whole-candidate request. */
export function createSemanticAuthoringHttpProviderV1(
  config: SemanticAuthoringProviderConfigV1,
  fetcher: typeof fetch = fetch,
): FocusedProviderTransportV1 {
  const endpoint = new URL(config.endpoint);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:"
    && ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname))) {
    throw new Error("SEMANTIC_AUTHORING_INSECURE_PROVIDER");
  }
  if (!config.model || !config.apiKey || !config.pricingIdentity
    || !Number.isFinite(config.inputMicroUsdPerToken) || config.inputMicroUsdPerToken < 0
    || !Number.isFinite(config.outputMicroUsdPerToken) || config.outputMicroUsdPerToken < 0
    || !config.transportPolicy.identity || !config.transportPolicy.routeIdentity
    || !Number.isSafeInteger(config.transportPolicy.timeoutMs) || config.transportPolicy.timeoutMs <= 0
    || ![0, 1].includes(config.transportPolicy.maxRecoveriesPerWorkItem)
    || !config.workerPolicy.identity || !config.workerPolicy.platformIdentity
    || !Number.isSafeInteger(config.workerPolicy.leaseDurationMs) || config.workerPolicy.leaseDurationMs <= 0) {
    throw new Error("SEMANTIC_AUTHORING_INVALID_PROVIDER_CONFIG");
  }
  if (config.transportPolicy.maxRecoveriesPerWorkItem !== 0) {
    throw new Error("SEMANTIC_AUTHORING_TRANSPORT_RECOVERY_NOT_IMPLEMENTED");
  }
  return {
    pricingIdentity: config.pricingIdentity,
    tokenEstimatorIdentity: "utf8-byte-upper-bound-v1",
    transportPolicy: config.transportPolicy,
    prepare(request, requestId, policy) {
      const body = JSON.stringify({
        model: config.model, stream: false, temperature: 0,
        max_tokens: policy.maxOutputTokensPerCall,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.context },
        ],
      });
      const inputBytes = Buffer.byteLength(body, "utf8");
      // Bound model input, not the extra escaping used by HTTP JSON serialization.
      // The full wire body is independently subject to maxInputBytesPerCall.
      const inputTokens = Buffer.byteLength(request.system, "utf8")
        + Buffer.byteLength(request.context, "utf8") + 256;
      return {
        body, providerRoute: `${config.endpoint}#${config.model}`,
        reservation: {
          requestId, inputBytes, inputTokens,
          outputTokens: policy.maxOutputTokensPerCall, outputBytes: policy.maxOutputBytesPerCall,
          costMicroUsd: Math.ceil(inputTokens * config.inputMicroUsdPerToken
            + policy.maxOutputTokensPerCall * config.outputMicroUsdPerToken),
          elapsedMs: config.transportPolicy.timeoutMs,
        },
      };
    },
    async exchange(request, signal) {
      const response = await fetcher(config.endpoint, {
        method: "POST", body: request.body, signal, redirect: "error",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      });
      if (!response.ok) throw new Error("SEMANTIC_AUTHORING_PROVIDER_HTTP_FAILURE");
      // Bound the response before parsing; do not materialize an unbounded provider body.
      const reader = response.body?.getReader();
      if (!reader) throw new Error("SEMANTIC_AUTHORING_PROVIDER_EMPTY_BODY");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 65_536) throw new Error("SEMANTIC_AUTHORING_PROVIDER_BODY_LIMIT");
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel();
      }
      const raw: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const completion = completionSchema.parse(raw);
      const choice = completion.choices[0];
      if (completion.model !== config.model || !choice || choice.message.refusal) {
        throw new Error("SEMANTIC_AUTHORING_PROVIDER_IDENTITY_OR_REFUSAL");
      }
      // Truncation is recoverable as an invalid focused proposal, not a valid fragment.
      const usage = usageSchema.safeParse(completion.usage);
      return {
        content: choice.finish_reason === "stop" ? choice.message.content ?? "" : "",
        ...(usage.success ? { usage: {
          inputTokens: usage.data.prompt_tokens, outputTokens: usage.data.completion_tokens,
          costMicroUsd: Math.ceil(usage.data.prompt_tokens * config.inputMicroUsdPerToken
            + usage.data.completion_tokens * config.outputMicroUsdPerToken),
        } } : {}),
      };
    },
  };
}
