// R: Define the narrow, accounted JSON transport boundary for awareness model roles.
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
  responseFormat: { type: "json_object" };
};

/** The existing adapter owns SDK requests, attempt accounting, and physical termination. */
export interface AwarenessJsonTransport {
  readonly identity: AwarenessTransportIdentity;
  requestJson(system: string, user: string, options: AwarenessRequestOptions): Promise<unknown>;
}
