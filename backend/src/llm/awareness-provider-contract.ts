// R: Define the narrow, accounted JSON transport boundary for awareness model roles.
import type { ResponseFormatJSONSchema } from "openai/resources/shared";

export type AwarenessTransportIdentity = {
  readonly provider: string;
  readonly engineModel: string;
  readonly fastModel: string;
};

export type AwarenessRequestOptions = {
  tier: "engine" | "fast";
  timeoutMs: number;
  maxCompletionTokens: number;
  label: string;
  responseFormat: { type: "json_object" } | (ResponseFormatJSONSchema & {
    json_schema: ResponseFormatJSONSchema["json_schema"] & { strict: true; schema: NonNullable<ResponseFormatJSONSchema["json_schema"]["schema"]> };
  });
};

/** The existing adapter owns SDK requests, attempt accounting, and physical termination. */
export interface AwarenessJsonTransport {
  readonly identity: AwarenessTransportIdentity;
  requestJson(system: string, user: string, options: AwarenessRequestOptions): Promise<unknown>;
}
