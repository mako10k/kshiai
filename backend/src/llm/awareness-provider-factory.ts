// R: Bind explicitly configured awareness roles to accounted providers without implicit fallback.
import { AwarenessNormalPolicy, AwarenessPolicyV1Schema, type AwarenessPolicyV1 } from "@kshiai/shared";
import { OpenAiCompatibleProvider, type JsonRequestOpts } from "./openai-compatible.js";
import { TransportAwarenessProvider, type AwarenessModelProvider } from "./awareness-provider.js";
import { TransportAwarenessNarrationProvider, type AwarenessNarrationProvider } from "./awareness-narration.js";
import type { LlmProvider } from "./types.js";
import type { AwarenessJsonTransport } from "./awareness-provider-contract.js";

export type AwarenessProviderConfiguration = {
  policy?: AwarenessPolicyV1;
  openai: { apiKey: string | undefined; baseUrl: string };
  xai: { apiKey: string | undefined; baseUrl: string; modelEngine: string; modelFast: string };
};
export type AwarenessProviderRoles = {
  models: AwarenessModelProvider;
  consciousness?: AwarenessJsonTransport;
  narration: AwarenessNarrationProvider;
  adjudication: AwarenessJsonTransport;
  adjudicationProvider?: LlmProvider;
};
type AdapterConfiguration = ConstructorParameters<typeof OpenAiCompatibleProvider>[0];
export interface AwarenessCompatibleAdapter {
  readonly domainProvider?: LlmProvider;
  readonly name: string;
  readonly models: { readonly engine: string; readonly fast: string };
  requestJson(system: string, user: string, options: JsonRequestOpts): Promise<unknown>;
}
export type AwarenessAdapterFactory = (config: AdapterConfiguration) => AwarenessCompatibleAdapter;

function transport(adapter: AwarenessCompatibleAdapter): AwarenessJsonTransport {
  return {
    identity: Object.freeze({ provider: adapter.name, engineModel: adapter.models.engine, fastModel: adapter.models.fast }),
    requestJson(system, user, options) {
      return adapter.requestJson(system, user, { ...options, retry: "none" });
    },
  };
}

/** Missing credentials leave all awareness roles unconfigured; development mocks are never substituted. */
export function createAwarenessProviderRoles(
  config: AwarenessProviderConfiguration,
  createAdapter: AwarenessAdapterFactory = (adapterConfig) => {
    const adapter = new OpenAiCompatibleProvider(adapterConfig);
    return { name: adapter.name, models: adapter.models, domainProvider: adapter, requestJson: adapter.requestJson.bind(adapter) };
  },
): AwarenessProviderRoles | undefined {
  if (!config.openai.apiKey?.trim() || !config.xai.apiKey?.trim()) return undefined;
  if (!config.xai.modelEngine.startsWith("grok-") || !config.xai.modelFast.startsWith("grok-")) {
    throw new Error("AWARENESS_CONFIG_REQUIRES_EXPLICIT_GROK_MODELS");
  }
  for (const baseUrl of [config.openai.baseUrl, config.xai.baseUrl]) {
    const url = new URL(baseUrl);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("AWARENESS_CONFIG_INVALID_PROVIDER_URL");
  }
  const policy = AwarenessPolicyV1Schema.parse(config.policy ?? AwarenessNormalPolicy);
  const latent = transport(createAdapter({
    name: "openai", apiKey: config.openai.apiKey, baseUrl: config.openai.baseUrl,
    modelEngine: "gpt-6-luna", modelFast: "gpt-6-luna", supportsTemperature: false, fallbackOnError: false,
  }));
  const grokAdapter = createAdapter({
    name: "xai", apiKey: config.xai.apiKey, baseUrl: config.xai.baseUrl,
    modelEngine: config.xai.modelEngine, modelFast: config.xai.modelFast, fallbackOnError: false,
  });
  const grok = transport(grokAdapter);
  return {
    models: new TransportAwarenessProvider(latent, grok, policy),
    consciousness: latent,
    narration: new TransportAwarenessNarrationProvider(grok, policy),
    adjudication: grok,
    ...(grokAdapter.domainProvider ? { adjudicationProvider: grokAdapter.domainProvider } : {}),
  };
}
