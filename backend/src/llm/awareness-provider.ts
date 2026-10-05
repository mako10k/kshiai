// R: Generate schema-validated awareness updates from role-specific prose projections.
import {
  AwarenessConsciousOutputSchema, AwarenessDefaultPolicy, AwarenessPolicyV1Schema, type AwarenessPolicyV1,
  AwarenessLatentOutputSchema,
  type AwarenessConsciousInput,
  type AwarenessConsciousOutput,
  type AwarenessLatentInput,
  type AwarenessLatentOutput,
} from "@kshiai/shared";
import type { AwarenessJsonTransport } from "./awareness-provider-contract.js";
import { prepareAwarenessRequest } from "./awareness-request.js";

export interface AwarenessModelProvider {
  subconscious(input: AwarenessLatentInput, promptRevision?: string, policy?: AwarenessPolicyV1): Promise<AwarenessLatentOutput>;
  conscious(input: AwarenessConsciousInput, promptRevision?: string, policy?: AwarenessPolicyV1): Promise<AwarenessConsciousOutput>;
}

/** Role routes are explicit; no provider fallback or second interpretation call is added here. */
export class TransportAwarenessProvider implements AwarenessModelProvider {
  private readonly policy: AwarenessPolicyV1;
  constructor(
    private readonly latentTransport: AwarenessJsonTransport,
    private readonly consciousTransport: AwarenessJsonTransport,
    policy: AwarenessPolicyV1 = AwarenessDefaultPolicy,
  ) {
    this.policy = AwarenessPolicyV1Schema.parse(policy);
    if (latentTransport.identity.provider !== "openai" || latentTransport.identity.fastModel !== "gpt-6-luna") {
      throw new Error("AWARENESS_LATENT_ROUTE_MUST_BE_OPENAI_GPT_6_LUNA");
    }
    if (consciousTransport.identity.provider !== "xai" || !consciousTransport.identity.engineModel.startsWith("grok-")) {
      throw new Error("AWARENESS_CONSCIOUS_ROUTE_MUST_BE_XAI_GROK_ENGINE");
    }
  }

  async subconscious(input: AwarenessLatentInput, promptRevision?: string, policy?: AwarenessPolicyV1): Promise<AwarenessLatentOutput> {
    const expectedTick = input.tick;
    const request = prepareAwarenessRequest({ role: "subconscious", input }, policy ?? this.policy, promptRevision);
    const result = AwarenessLatentOutputSchema.parse(await this.latentTransport.requestJson(request.system, request.user, request.options));
    if (result.state.updatedTick !== expectedTick) throw new Error("AWARENESS_LATENT_OUTPUT_TICK_MISMATCH");
    return result;
  }

  async conscious(input: AwarenessConsciousInput, promptRevision?: string, policy?: AwarenessPolicyV1): Promise<AwarenessConsciousOutput> {
    const request = prepareAwarenessRequest({ role: "conscious", input }, policy ?? this.policy, promptRevision);
    return AwarenessConsciousOutputSchema.parse(await this.consciousTransport.requestJson(request.system, request.user, request.options));
  }
}
