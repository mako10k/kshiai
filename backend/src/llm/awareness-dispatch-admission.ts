// R: Admit exact awareness requests only with matching verified token and maximum-charge contracts.
import { AwarenessDefaultPolicy, type AwarenessPolicyV1 } from "@kshiai/shared";
import type { AwarenessDispatchProof, AwarenessExecutionAdmission } from "../services/awareness-execution.js";
import { requestDigest } from "../services/distributed-guard.js";
import type { JsonRequestOpts } from "./openai-compatible.js";
import type { AwarenessTransportIdentity } from "./awareness-provider-contract.js";
import { prepareAwarenessRequest } from "./awareness-request.js";

export type AwarenessPricedRequest = {
  provider: string; model: string; system: string; user: string;
  options: JsonRequestOpts & {
    tier: "engine" | "fast"; timeoutMs: number; maxCompletionTokens: number; label: string;
    responseFormat: NonNullable<JsonRequestOpts["responseFormat"]>;
  };
};
export type AwarenessProviderQuote = {
  provider: string;
  model: string;
  requestDigest: string;
  fullMessageTokens: number;
  outputTokenLimit: number;
  maximumChargeUsd: number;
  verifiedFullPrompt: boolean;
  includesAllGeneratedTokens: boolean;
};
/** The injected contract must establish model-specific framing, token counting, and all charge components. */
export interface AwarenessVerifiedBillingContract {
  readonly provider: string;
  readonly model: string;
  quote(request: AwarenessPricedRequest): Promise<AwarenessProviderQuote | null>;
}
export type AwarenessQuoteLimits = { inputTokens: number; outputTokens: number; deadlineMs: number };

function requestFitsQuoteContract(request: AwarenessPricedRequest, contract: AwarenessVerifiedBillingContract | undefined, limits: AwarenessQuoteLimits): boolean {
  return Boolean(contract && contract.provider === request.provider && contract.model === request.model &&
    request.options.maxCompletionTokens === limits.outputTokens && request.options.timeoutMs > 0 &&
    request.options.timeoutMs <= limits.deadlineMs && Number.isFinite(request.options.timeoutMs));
}

function quoteFitsLimits(quote: AwarenessProviderQuote | null, request: AwarenessPricedRequest, digest: string, limits: AwarenessQuoteLimits): boolean {
  return Boolean(quote && quote.provider === request.provider && quote.model === request.model && quote.requestDigest === digest &&
    quote.verifiedFullPrompt === true && quote.includesAllGeneratedTokens === true && Number.isSafeInteger(quote.fullMessageTokens) &&
    quote.fullMessageTokens > 0 && quote.fullMessageTokens <= limits.inputTokens && quote.outputTokenLimit === limits.outputTokens &&
    Number.isFinite(quote.maximumChargeUsd) && quote.maximumChargeUsd >= 0 &&
    (AwarenessDefaultPolicy.maxCostUsd === null || quote.maximumChargeUsd <= AwarenessDefaultPolicy.maxCostUsd));
}

function dispatchProof(digest: string, quote: AwarenessProviderQuote): AwarenessDispatchProof {
  return { requestDigest: digest, verifiedFullPrompt: true, inputTokens: quote.fullMessageTokens,
    outputTokenLimit: quote.outputTokenLimit, maximumChargeUsd: quote.maximumChargeUsd };
}

export async function verifyAwarenessDispatchQuote(
  request: AwarenessPricedRequest,
  contract: AwarenessVerifiedBillingContract | undefined,
  limits: AwarenessQuoteLimits,
): Promise<AwarenessDispatchProof | null> {
  if (!contract || !requestFitsQuoteContract(request, contract, limits)) return null;
  const digest = requestDigest(request);
  try {
    // Keep the proof source separate from caller-owned objects across an asynchronous quote.
    const quote = await contract.quote(structuredClone(request));
    if (!quote || !quoteFitsLimits(quote, request, digest, limits)) return null;
    return dispatchProof(digest, quote);
  } catch {
    return null;
  }
}

/** Observed admission records uncertainty while enforcing the immutable role output and dispatch deadline. */
export function prepareObservedAwarenessDispatch(request: AwarenessPricedRequest, limits: AwarenessQuoteLimits): AwarenessDispatchProof | null {
  if (!request.provider.trim() || !request.model.trim() || !request.system || !request.user ||
      request.options.maxCompletionTokens !== limits.outputTokens || !Number.isFinite(request.options.timeoutMs) ||
      request.options.timeoutMs <= 0 || request.options.timeoutMs > limits.deadlineMs) return null;
  return { mode: "observed", verifiedFullPrompt: false, inputTokens: null, maximumChargeUsd: null,
    requestDigest: requestDigest(request), outputTokenLimit: request.options.maxCompletionTokens };
}

export function createAwarenessExecutionAdmission(config: {
  latent: AwarenessTransportIdentity;
  conscious: AwarenessTransportIdentity;
  contracts: readonly AwarenessVerifiedBillingContract[];
  policy?: AwarenessPolicyV1;
  promptRevision?: string;
}): AwarenessExecutionAdmission {
  const latent = Object.freeze({ ...config.latent });
  const conscious = Object.freeze({ ...config.conscious });
  const contracts = [...config.contracts];
  return {
    async verify(request) {
      const identity = request.role === "subconscious" ? latent : conscious;
      const model = request.role === "subconscious" ? identity.fastModel : identity.engineModel;
      if (request.role === "subconscious" ? identity.provider !== "openai" || model !== "gpt-6-luna" : identity.provider !== "xai" || !model.startsWith("grok-")) return null;
      const matches = contracts.filter((contract) => contract.provider === identity.provider && contract.model === model);
      const policy = config.policy ?? AwarenessDefaultPolicy;
      const prepared = prepareAwarenessRequest(request, policy, config.promptRevision);
      const priced = { provider: identity.provider, model, ...prepared };
      if (policy.accountingMode === "observed") return prepareObservedAwarenessDispatch(priced, policy.roles[request.role]);
      if (matches.length !== 1) return null;
      return verifyAwarenessDispatchQuote(priced, matches[0], policy.roles[request.role]);
    },
  };
}
